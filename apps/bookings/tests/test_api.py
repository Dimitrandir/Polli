from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.bookings.models import Booking, BookingStatus
from apps.clients.models import Client

from .factories import SalonTestCase, at


class ApiTestCase(SalonTestCase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()

    def booking_payload(self, **overrides):
        payload = {
            "start": at(self.day, 9).isoformat(),
            "parallel": True,
            "items": [{"service": self.manicure.pk}, {"service": self.colour.pk, "specialist": self.poli.pk}],
            "note": "Едновременно, моля",
            "client": {
                "first_name": "Петя",
                "last_name": "Петрова",
                "phone": "0877 000 111",
                "email": "petya@example.com",
            },
            "consent": True,
        }
        payload.update(overrides)
        return payload


class CatalogApiTests(ApiTestCase):
    def test_categories_tree(self):
        data = self.api.get(reverse("api:category-list")).json()
        self.assertEqual([c["slug"] for c in data], ["kosa", "nokti"])
        manicure = data[1]["groups"][0]["services"][0]
        self.assertEqual(manicure["name"], "Маникюр с гел лак")
        self.assertEqual(manicure["price"], "28.12")
        self.assertEqual(manicure["duration_minutes"], 90)
        self.assertEqual([s["name"] for s in manicure["specialists"]], ["Надя"])

    def test_inactive_services_are_hidden(self):
        self.cut.is_active = False
        self.cut.save()
        names = [s["name"] for s in self.api.get(reverse("api:service-list")).json()]
        self.assertNotIn("Подстригване", names)

    def test_services_filtered_by_category_and_specialist(self):
        nails = self.api.get(reverse("api:service-list"), {"category": "nokti"}).json()
        self.assertEqual([s["name"] for s in nails], ["Маникюр с гел лак"])
        poli = self.api.get(reverse("api:service-list"), {"specialist": self.poli.pk}).json()
        self.assertEqual({s["name"] for s in poli}, {"Боядисване на корени", "Подстригване"})

    def test_specialists_with_their_prices(self):
        data = self.api.get(reverse("api:specialist-list"), {"service": self.colour.pk}).json()
        self.assertEqual([s["name"] for s in data], ["Поли Ботева", "Иван"])
        poli_colour = next(s for s in data[0]["services"] if s["id"] == self.colour.pk)
        self.assertEqual(poli_colour["price"], "80.00")


class AvailabilityApiTests(ApiTestCase):
    def test_week_view(self):
        response = self.api.post(
            reverse("api:availability"),
            {
                "date": self.day.isoformat(),
                "days": 7,
                "items": [{"service": self.colour.pk, "specialist": self.poli.pk}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        days = response.json()["days"]
        self.assertEqual(len(days), 7)
        self.assertEqual(days[0]["slots"][0]["items"][0]["specialist_name"], "Поли Ботева")
        self.assertEqual(days[5]["slots"], [])  # Saturday

    def test_rule_errors_are_400_in_bulgarian(self):
        response = self.api.post(
            reverse("api:availability"),
            {"date": self.day.isoformat(), "items": [{"service": self.manicure.pk, "specialist": self.poli.pk}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("не извършва", response.json()["detail"])


class BookingApiTests(ApiTestCase):
    def test_create_get_and_cancel(self):
        response = self.api.post(reverse("api:booking-create"), self.booking_payload(), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual(data["total_price"], "108.12")
        self.assertEqual(len(data["items"]), 2)
        self.assertTrue(data["can_cancel"])
        client = Client.objects.get(phone="+359877000111")
        self.assertIsNotNone(client.privacy_consent_at)

        token = data["cancel_token"]
        self.assertEqual(self.api.get(reverse("api:booking-detail", args=[token])).json()["id"], data["id"])

        response = self.api.post(reverse("api:booking-cancel", args=[token]), {"reason": "Промяна в плановете"})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], BookingStatus.CANCELLED)

    def test_consent_is_required(self):
        response = self.api.post(reverse("api:booking-create"), self.booking_payload(consent=False), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Booking.objects.exists())

    def test_taken_slot(self):
        self.book(self.poli, self.colour, at(self.day, 9))
        response = self.api.post(reverse("api:booking-create"), self.booking_payload(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("вече не е свободен", response.json()["detail"])

    def test_blocked_client(self):
        Client.objects.create(first_name="Петя", phone="0877000111", is_blocked=True)
        response = self.api.post(reverse("api:booking-create"), self.booking_payload(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Booking.objects.exists())

    def test_late_cancellation_is_refused(self):
        booking = self.book(self.poli, self.colour, at(self.day, 9))
        booking.start_at = booking.end_at = Booking.objects.get(pk=booking.pk).created_at + timedelta(hours=3)
        booking.save()
        response = self.api.post(reverse("api:booking-cancel", args=[booking.cancel_token]))
        self.assertEqual(response.status_code, 400)
        self.assertIn("24 часа", response.json()["detail"])

    def test_my_bookings_for_logged_in_client(self):
        self.assertEqual(self.api.get(reverse("api:my-bookings")).status_code, 403)
        user = get_user_model().objects.create_user("petya", password="x")
        self.api.force_authenticate(user)
        self.api.post(reverse("api:booking-create"), self.booking_payload(), format="json")
        history = self.api.get(reverse("api:my-bookings")).json()
        self.assertEqual(len(history), 1)
        self.assertEqual(Client.objects.get(user=user).phone, "+359877000111")


class LoggedInStaffTests(ApiTestCase):
    """The salon staff are often logged in to the admin in the same browser.

    The admin session cookie is sent to the frontend too (cookies ignore the port),
    so the public booking flow must keep working with it, with real CSRF checks on.
    """

    def setUp(self):
        super().setUp()
        self.api = APIClient(enforce_csrf_checks=True)
        admin = get_user_model().objects.create_superuser("admin", "admin@example.com", "x")
        self.api.force_login(admin)
        self.frontend = {"HTTP_ORIGIN": "http://localhost:3000"}

    def test_availability_needs_no_csrf_token(self):
        response = self.api.post(
            reverse("api:availability"),
            {"date": self.day.isoformat(), "items": [{"service": self.colour.pk}]},
            format="json",
            **self.frontend,
        )
        self.assertEqual(response.status_code, 200, response.content)

    def test_booking_with_csrf_token_from_the_frontend(self):
        self.api.get(reverse("admin:index"))  # sets the csrftoken cookie, as the admin login does
        token = self.api.cookies["csrftoken"].value
        response = self.api.post(
            reverse("api:booking-create"),
            self.booking_payload(),
            format="json",
            HTTP_X_CSRFTOKEN=token,
            **self.frontend,
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_booking_without_csrf_token_is_refused(self):
        response = self.api.post(reverse("api:booking-create"), self.booking_payload(), format="json", **self.frontend)
        self.assertEqual(response.status_code, 403)

    def test_cancel_by_token_needs_no_csrf_token(self):
        booking = self.book(self.poli, self.colour, at(self.day, 9))
        response = self.api.post(reverse("api:booking-cancel", args=[booking.cancel_token]), **self.frontend)
        self.assertEqual(response.status_code, 200, response.content)
