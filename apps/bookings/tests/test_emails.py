from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core import mail
from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse

from apps.bookings.availability import ItemRequest
from apps.bookings.emails import send_due_reminders
from apps.bookings.models import BookingStatus, CancelledBy
from apps.bookings.services import cancel_booking, create_booking
from apps.clients.models import Client, ReminderChannel
from apps.clients.services import mark_read, post_message
from apps.salon.models import SalonInfo

from .factories import at
from .test_staff_api import StaffApiTestCase


@override_settings(FRONTEND_URL="https://sisesthetics.com")
class EmailTestCase(StaffApiTestCase):
    def setUp(self):
        super().setUp()
        SalonInfo.objects.create(
            name="SIS Esthetics Hair", phone="0888 000 111", address="ул. Тест 1", email="salon@sis.bg"
        )
        self.client_obj.email = "maria@example.com"
        self.client_obj.save()

    def book_online(self, start, now=None):
        with self.captureOnCommitCallbacks(execute=True):
            return create_booking(
                client=self.client_obj, requests=[ItemRequest(self.cut, self.poli)], start=start, now=now
            )


class BookingEmailTests(EmailTestCase):
    def test_confirmation_after_booking(self):
        booking = self.book_online(at(self.day, 10))
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ["maria@example.com"])
        self.assertIn("Записан час", email.subject)
        self.assertIn("Подстригване – Поли Ботева, 10:00", email.body)
        self.assertIn(f"https://sisesthetics.com/rezervacia/{booking.cancel_token}", email.body)
        self.assertIn("тел. 0888 000 111", email.body)
        booking.refresh_from_db()
        self.assertIsNone(booking.reminder_sent_at)

    def test_no_email_without_address(self):
        self.client_obj.email = ""
        self.client_obj.save()
        self.book_online(at(self.day, 10))
        self.assertEqual(mail.outbox, [])

    def test_booked_inside_the_reminder_window_gets_no_separate_reminder(self):
        booking = self.book_online(at(self.day, 10), now=at(self.day, 8))
        booking.refresh_from_db()
        self.assertIsNotNone(booking.reminder_sent_at)
        self.assertEqual(send_due_reminders(now=at(self.day, 8)), 0)

    def test_cancel_by_salon_tells_the_client_why(self):
        booking = self.book(self.poli, self.cut, at(self.day, 10))
        with self.captureOnCommitCallbacks(execute=True):
            cancel_booking(booking, by=CancelledBy.SALON, reason="Поли е болна", user=self.user)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Отказан час", mail.outbox[0].subject)
        self.assertIn("салонът отмени", mail.outbox[0].body)
        self.assertIn("Причина: Поли е болна", mail.outbox[0].body)

    def test_cancel_by_client_confirms_it(self):
        booking = self.book(self.poli, self.cut, at(self.day, 10))
        with self.captureOnCommitCallbacks(execute=True):
            cancel_booking(booking, by=CancelledBy.CLIENT, now=at(self.day - timedelta(days=3), 10))
        self.assertIn("Вашият час е отказан", mail.outbox[0].body)

    def test_moving_a_visit_emails_the_new_time_and_resets_the_reminder(self):
        booking = self.book(self.poli, self.cut, at(self.day, 10))
        booking.reminder_sent_at = at(self.day, 9)
        booking.save()
        self.login()
        with self.captureOnCommitCallbacks(execute=True):
            response = self.api.post(
                reverse("api:staff-booking-move", args=[booking.pk]),
                {"item": booking.items.get().pk, "start": at(self.day, 14).isoformat(), "specialist": self.ivan.pk},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Преместен час", mail.outbox[0].subject)
        self.assertIn("Подстригване – Иван, 14:00", mail.outbox[0].body)
        booking.refresh_from_db()
        self.assertIsNone(booking.reminder_sent_at)


class ReminderTests(EmailTestCase):
    def test_reminder_goes_once(self):
        booking = self.book(self.poli, self.cut, at(self.day, 10))
        now = at(self.day, 10) - timedelta(hours=20)
        self.assertEqual(send_due_reminders(now=now), 1)
        self.assertIn("Напомняне", mail.outbox[0].subject)
        self.assertIn("обадете се на 0888 000 111", mail.outbox[0].body)
        self.assertEqual(send_due_reminders(now=now + timedelta(minutes=10)), 0)
        booking.refresh_from_db()
        self.assertEqual(booking.reminder_sent_at, now)

    def test_not_yet_and_not_for_some(self):
        self.book(self.poli, self.cut, at(self.day, 10))  # too far ahead
        self.book(self.ivan, self.cut, at(self.day - timedelta(days=6), 12), status=BookingStatus.CANCELLED)
        no_reminders = Client.objects.create(
            first_name="Ива", phone="0888 999 999", email="iva@example.com", reminder_channel=ReminderChannel.NONE
        )
        self.book(self.nadia, self.manicure, at(self.day - timedelta(days=6), 12), client=no_reminders)
        self.assertEqual(send_due_reminders(now=at(self.day - timedelta(days=7), 14)), 0)

    def test_failed_send_is_tried_again(self):
        booking = self.book(self.poli, self.cut, at(self.day, 10))
        now = at(self.day, 10) - timedelta(hours=2)
        with (
            mock.patch("apps.bookings.emails.send_mail", side_effect=OSError("SMTP down")),
            self.assertLogs("apps.bookings.emails", "ERROR"),
        ):
            self.assertEqual(send_due_reminders(now=now), 0)
        booking.refresh_from_db()
        self.assertIsNone(booking.reminder_sent_at)
        self.assertEqual(send_due_reminders(now=now), 1)

    def test_command(self):
        out = StringIO()
        call_command("send_booking_reminders", stdout=out)
        self.assertIn("Изпратени напомняния: 0", out.getvalue())


class SalonMessageEmailTests(EmailTestCase):
    def test_client_message_emails_the_salon_once_until_read(self):
        post_message(self.client_obj, "Може ли в петък?", from_client=True)
        post_message(self.client_obj, "И маникюр?", from_client=True)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["salon@sis.bg"])
        self.assertIn("Ново съобщение от Мария Иванова", mail.outbox[0].subject)
        self.assertIn("Може ли в петък?", mail.outbox[0].body)
        self.assertIn("https://sisesthetics.com/personal/saobshtenia", mail.outbox[0].body)

        mark_read(self.client_obj, by_client=False)
        post_message(self.client_obj, "Благодаря!", from_client=True)
        self.assertEqual(len(mail.outbox), 2)
