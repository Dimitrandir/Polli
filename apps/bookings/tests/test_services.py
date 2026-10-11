from datetime import timedelta

from apps.bookings.availability import BookingError, ItemRequest
from apps.bookings.models import BookingSource, BookingStatus, CancelledBy
from apps.bookings.services import can_client_cancel, cancel_booking, create_booking, resolve_client
from apps.clients.models import Client

from .factories import SalonTestCase, at


class CreateBookingTests(SalonTestCase):
    def test_creates_booking_with_price_snapshots(self):
        booking = create_booking(
            client=self.client_obj,
            requests=[ItemRequest(self.manicure), ItemRequest(self.colour, self.poli)],
            start=at(self.day, 9),
            parallel=True,
            note="Едновременно, моля",
        )
        self.assertEqual(booking.status, BookingStatus.CONFIRMED)
        self.assertEqual(booking.source, BookingSource.ONLINE)
        self.assertEqual((booking.start_at, booking.end_at), (at(self.day, 9), at(self.day, 10, 30)))
        self.assertEqual(sorted(str(i.price) for i in booking.items.all()), ["28.12", "80.00"])
        self.assertEqual(str(booking.total_price), "108.12")

        # Later price changes do not touch the booking.
        self.manicure.price = 35
        self.manicure.save()
        self.assertEqual(str(booking.total_price), "108.12")

    def test_cannot_double_book(self):
        create_booking(client=self.client_obj, requests=[ItemRequest(self.colour, self.poli)], start=at(self.day, 9))
        with self.assertRaisesMessage(BookingError, "вече не е свободен"):
            create_booking(client=self.client_obj, requests=[ItemRequest(self.cut, self.poli)], start=at(self.day, 10))

    def test_start_must_be_on_the_grid(self):
        with self.assertRaises(BookingError):
            create_booking(
                client=self.client_obj, requests=[ItemRequest(self.cut, self.poli)], start=at(self.day, 9, 7)
            )

    def test_cannot_book_in_the_past(self):
        with self.assertRaises(BookingError):
            create_booking(
                client=self.client_obj,
                requests=[ItemRequest(self.cut, self.poli)],
                start=at(self.day, 9),
                now=at(self.day, 12),
            )

    def test_blocked_client_cannot_book(self):
        self.client_obj.block("Неявявания")
        with self.assertRaisesMessage(BookingError, "свържете се със салона"):
            create_booking(client=self.client_obj, requests=[ItemRequest(self.cut)], start=at(self.day, 9))

    def test_staff_can_book_a_blocked_client_and_off_grid(self):
        self.client_obj.block()
        booking = create_booking(
            client=self.client_obj,
            requests=[ItemRequest(self.cut, self.poli)],
            start=at(self.day, 9, 7),
            source=BookingSource.SALON,
            for_staff=True,
        )
        self.assertEqual(booking.start_at, at(self.day, 9, 7))


class ResolveClientTests(SalonTestCase):
    def test_reuses_client_by_normalised_phone_without_overwriting_name(self):
        client = resolve_client(first_name="Друго име", phone="+359 888 123 456", email="M@Example.com", consent=True)
        self.assertEqual(client.pk, self.client_obj.pk)
        self.assertEqual(client.first_name, "Мария")
        self.assertEqual(client.email, "m@example.com")
        self.assertIsNotNone(client.privacy_consent_at)

    def test_creates_new_client(self):
        client = resolve_client(first_name="Петя", phone="0877 000 111")
        self.assertEqual(client.phone, "+359877000111")
        self.assertEqual(Client.objects.count(), 2)

    def test_blocked_phone(self):
        self.client_obj.block()
        with self.assertRaises(BookingError):
            resolve_client(first_name="Мария", phone="0888123456")

    def test_blocked_email_with_a_new_phone(self):
        self.client_obj.email = "maria@example.com"
        self.client_obj.save()
        self.client_obj.block()
        with self.assertRaises(BookingError):
            resolve_client(first_name="Мария", phone="0899 999 999", email="Maria@example.com")
        self.assertFalse(Client.objects.filter(phone="+359899999999").exists())


class CancelBookingTests(SalonTestCase):
    def setUp(self):
        super().setUp()
        self.booking = self.book(self.poli, self.colour, at(self.day, 10))

    def test_client_can_cancel_24_hours_ahead(self):
        now = self.booking.start_at - timedelta(hours=24)
        self.assertTrue(can_client_cancel(self.booking, now))
        cancel_booking(self.booking, now=now, reason="Болна съм")
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, BookingStatus.CANCELLED)
        self.assertEqual(self.booking.cancelled_by, CancelledBy.CLIENT)

    def test_client_cannot_cancel_later_than_24_hours(self):
        now = self.booking.start_at - timedelta(hours=23, minutes=59)
        self.assertFalse(can_client_cancel(self.booking, now))
        with self.assertRaisesMessage(BookingError, "24 часа"):
            cancel_booking(self.booking, now=now)

    def test_salon_can_always_cancel(self):
        cancel_booking(self.booking, by=CancelledBy.SALON, now=self.booking.start_at - timedelta(hours=1))
        self.assertEqual(self.booking.status, BookingStatus.CANCELLED)

    def test_cannot_cancel_twice(self):
        cancel_booking(self.booking, by=CancelledBy.SALON)
        with self.assertRaisesMessage(BookingError, "не е активна"):
            cancel_booking(self.booking, by=CancelledBy.SALON)

    def test_cancelling_frees_the_slot(self):
        cancel_booking(self.booking, by=CancelledBy.SALON)
        create_booking(client=self.client_obj, requests=[ItemRequest(self.colour, self.poli)], start=at(self.day, 10))
