from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.bookings.admin import BookingItemForm
from apps.bookings.models import Booking

from .factories import SalonTestCase, at


class AdminTests(SalonTestCase):
    def setUp(self):
        super().setUp()
        self.admin = get_user_model().objects.create_superuser("admin", "admin@example.com", "x")
        self.client.force_login(self.admin)

    def test_day_schedule_page(self):
        self.book(self.poli, self.colour, at(self.day, 10))
        response = self.client.get(reverse("admin:bookings_booking_day"), {"date": self.day.isoformat()})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Поли Ботева")
        self.assertContains(response, "Мария Иванова")
        self.assertContains(response, "10:00–11:30")

    def test_booking_list_shows_time_and_specialist(self):
        self.book(self.poli, self.colour, at(self.day, 10))
        response = self.client.get(reverse("admin:bookings_booking_changelist"))
        self.assertContains(response, f"пн {self.day:%d.%m.%Y}, 10:00–11:30")
        self.assertContains(response, "Поли Ботева")
        self.assertNotContains(response, "след обяд")

    def test_admin_pages_load(self):
        booking = self.book(self.poli, self.colour, at(self.day, 10))
        for url in [
            reverse("admin:bookings_booking_changelist"),
            reverse("admin:bookings_booking_change", args=[booking.pk]),
            reverse("admin:bookings_booking_add"),
            reverse("admin:staff_specialist_change", args=[self.poli.pk]),
            reverse("admin:catalog_service_changelist"),
            reverse("admin:clients_client_change", args=[self.client_obj.pk]),
        ]:
            self.assertEqual(self.client.get(url).status_code, 200, url)

    def test_item_form_fills_in_end_and_price(self):
        booking = Booking.objects.create(client=self.client_obj, start_at=at(self.day, 10), end_at=at(self.day, 10))
        form = BookingItemForm(
            data={"service": self.colour.pk, "specialist": self.poli.pk, "start_at": at(self.day, 10)}
        )
        form.instance.booking = booking
        self.assertTrue(form.is_valid(), form.errors)
        item = form.save()
        self.assertEqual(item.end_at, at(self.day, 11, 30))
        self.assertEqual(str(item.price), "80.00")
        booking.refresh_time_range()
        self.assertEqual(booking.end_at, at(self.day, 11, 30))

    def test_item_form_rejects_overlap(self):
        self.book(self.poli, self.colour, at(self.day, 10))
        booking = Booking.objects.create(client=self.client_obj, start_at=at(self.day, 11), end_at=at(self.day, 11))
        form = BookingItemForm(data={"service": self.cut.pk, "specialist": self.poli.pk, "start_at": at(self.day, 11)})
        form.instance.booking = booking
        self.assertFalse(form.is_valid())
        self.assertIn("вече е зает", str(form.errors))

    def test_item_form_rejects_service_the_specialist_does_not_do(self):
        form = BookingItemForm(
            data={"service": self.manicure.pk, "specialist": self.poli.pk, "start_at": at(self.day, 11)}
        )
        self.assertFalse(form.is_valid())
        self.assertIn("не извършва", str(form.errors))

    def test_block_action(self):
        response = self.client.post(
            reverse("admin:clients_client_changelist"),
            {"action": "block_clients", "_selected_action": [self.client_obj.pk]},
        )
        self.assertEqual(response.status_code, 302)
        self.client_obj.refresh_from_db()
        self.assertTrue(self.client_obj.is_blocked)
