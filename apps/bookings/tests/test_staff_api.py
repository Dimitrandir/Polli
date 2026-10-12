from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.bookings.models import Booking, BookingSource, BookingStatus, CancelledBy
from apps.clients.models import Client
from apps.staff.models import TimeOff

from .factories import SalonTestCase, at


class StaffApiTestCase(SalonTestCase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.user = get_user_model().objects.create_user("poli", password="tajna-parola-1", is_staff=True)
        self.poli.user = self.user
        self.poli.save()

    def login(self):
        self.api.force_authenticate(self.user)


class StaffAuthTests(StaffApiTestCase):
    def test_login_and_session(self):
        response = self.api.get(reverse("api:staff-session"))
        self.assertEqual(response.json(), {"authenticated": False, "user": None})
        self.assertIn("csrftoken", response.cookies)

        response = self.api.post(
            reverse("api:staff-login"), {"username": "poli", "password": "tajna-parola-1"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["user"]["name"], "Поли Ботева")
        self.assertEqual(response.json()["user"]["specialist"], self.poli.pk)

        response = self.api.get(reverse("api:staff-session"))
        self.assertTrue(response.json()["authenticated"])

        self.api.post(reverse("api:staff-logout"))
        self.assertFalse(self.api.get(reverse("api:staff-session")).json()["authenticated"])

    def test_wrong_password(self):
        response = self.api.post(reverse("api:staff-login"), {"username": "poli", "password": "x"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Грешно", response.json()["detail"])

    def test_non_staff_user_cannot_log_in(self):
        get_user_model().objects.create_user("klient", password="tajna-parola-1")
        response = self.api.post(
            reverse("api:staff-login"), {"username": "klient", "password": "tajna-parola-1"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_calendar_requires_staff(self):
        self.assertEqual(self.api.get(reverse("api:staff-day")).status_code, 403)
        self.api.force_authenticate(get_user_model().objects.create_user("klient"))
        self.assertEqual(self.api.get(reverse("api:staff-day")).status_code, 403)


class StaffDayTests(StaffApiTestCase):
    def test_day_has_columns_hours_time_off_and_bookings(self):
        self.poli.color = "#7cb342"
        self.poli.save()
        self.book(self.poli, self.colour, at(self.day, 10))
        self.book(self.ivan, self.cut, at(self.day, 12), status=BookingStatus.CANCELLED)
        self.book(self.ivan, self.cut, at(self.day + timedelta(days=1), 12))
        TimeOff.objects.create(specialist=self.nadia, start=at(self.day, 13), end=at(self.day, 14), reason="Лекар")
        self.login()

        data = self.api.get(reverse("api:staff-day"), {"date": self.day.isoformat()}).json()

        self.assertEqual(data["date"], self.day.isoformat())
        self.assertEqual([s["name"] for s in data["specialists"]], ["Поли Ботева", "Иван", "Надя"])
        poli = data["specialists"][0]
        self.assertEqual(poli["color"], "#7cb342")
        self.assertEqual(len(poli["working"]), 1)
        self.assertTrue(poli["working"][0]["start"].startswith(f"{self.day.isoformat()}T09:00"))
        self.assertEqual(data["specialists"][2]["time_off"][0]["reason"], "Лекар")

        self.assertEqual(len(data["bookings"]), 1)  # the cancelled one and the next day are left out
        booking = data["bookings"][0]
        self.assertEqual(booking["client"]["name"], "Мария Иванова")
        self.assertEqual(booking["client"]["phone"], "+359888123456")
        self.assertEqual(booking["items"][0]["service_name"], "Боядисване на корени")
        self.assertEqual(booking["items"][0]["specialist"], self.poli.pk)

    def test_services_list_includes_specialists_prices(self):
        self.login()
        data = self.api.get(reverse("api:staff-services")).json()
        colour = next(s for s in data if s["id"] == self.colour.pk)
        self.assertEqual(colour["group"], "Боядисване")
        prices = {s["id"]: s["price"] for s in colour["specialists"]}
        self.assertEqual(prices, {self.poli.pk: "80.00", self.ivan.pk: "60.00"})

    def test_client_search(self):
        Client.objects.create(first_name="Ана", last_name="Петрова", phone="0899 111 222")
        self.login()
        url = reverse("api:staff-clients")
        self.assertEqual([c["name"] for c in self.api.get(url, {"q": "мария"}).json()], ["Мария Иванова"])
        self.assertEqual([c["name"] for c in self.api.get(url, {"q": "0899 111"}).json()], ["Ана Петрова"])
        self.assertEqual(self.api.get(url, {"q": "а"}).json(), [])


class StaffBookingTests(StaffApiTestCase):
    def test_create_for_existing_client(self):
        self.login()
        response = self.api.post(
            reverse("api:staff-booking-create"),
            {
                "client": self.client_obj.pk,
                "specialist": self.poli.pk,
                "services": [self.cut.pk, self.colour.pk],
                "start": at(self.day, 10, 10).isoformat(),
                "internal_note": "Иска по-тъмен нюанс",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        booking = Booking.objects.get(pk=response.json()["id"])
        self.assertEqual(booking.source, BookingSource.SALON)
        self.assertEqual(booking.internal_note, "Иска по-тъмен нюанс")
        self.assertEqual(booking.start_at, at(self.day, 10, 10))  # staff are not tied to the 15-minute grid
        self.assertEqual(booking.end_at, at(self.day, 12, 25))  # 45 min cut + 90 min colour
        self.assertEqual([i.specialist_id for i in booking.items.all()], [self.poli.pk, self.poli.pk])

    def test_create_with_new_client_reuses_existing_phone(self):
        self.login()
        payload = {
            "new_client": {"first_name": "Мими", "phone": "0888123456"},
            "specialist": self.poli.pk,
            "services": [self.cut.pk],
            "start": at(self.day, 15).isoformat(),
        }
        response = self.api.post(reverse("api:staff-booking-create"), payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["client"]["id"], self.client_obj.pk)

        payload["new_client"] = {"first_name": "Ана", "last_name": "Петрова", "phone": "0899 111 222"}
        payload["start"] = at(self.day, 16).isoformat()
        response = self.api.post(reverse("api:staff-booking-create"), payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Client.objects.get(phone="+359899111222").full_name, "Ана Петрова")

    def test_create_rejects_clash(self):
        self.book(self.poli, self.colour, at(self.day, 10))
        self.login()
        response = self.api.post(
            reverse("api:staff-booking-create"),
            {
                "client": self.client_obj.pk,
                "specialist": self.poli.pk,
                "services": [self.cut.pk],
                "start": at(self.day, 11).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("не е свободен", response.json()["detail"])

    def test_create_requires_a_client(self):
        self.login()
        response = self.api.post(
            reverse("api:staff-booking-create"),
            {"specialist": self.poli.pk, "services": [self.cut.pk], "start": at(self.day, 11).isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_mark_completed_and_edit_note(self):
        booking = self.book(self.poli, self.colour, at(self.day, 10))
        self.login()
        url = reverse("api:staff-booking-detail", args=[booking.pk])
        response = self.api.patch(url, {"status": "completed", "internal_note": "Платено"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        booking.refresh_from_db()
        self.assertEqual(booking.status, BookingStatus.COMPLETED)
        self.assertEqual(booking.internal_note, "Платено")
        self.assertEqual(self.api.patch(url, {"status": "cancelled"}, format="json").status_code, 400)

    def test_cancel_by_salon(self):
        booking = self.book(self.poli, self.colour, at(self.day, 10))
        self.login()
        response = self.api.post(reverse("api:staff-booking-cancel", args=[booking.pk]), {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        booking.refresh_from_db()
        self.assertEqual(booking.status, BookingStatus.CANCELLED)
        self.assertEqual(booking.cancelled_by, CancelledBy.SALON)
