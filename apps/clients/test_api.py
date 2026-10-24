import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.urls import reverse
from rest_framework.test import APIClient

from apps.bookings.models import Booking, BookingStatus
from apps.bookings.tests.factories import SalonTestCase, at

from .models import Client, ClientNote, Message

User = get_user_model()


class ClientAccountTestCase(SalonTestCase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.user = User.objects.create_user("petya@example.com", email="petya@example.com")
        self.api.force_authenticate(self.user)

    def make_profile(self, **overrides):
        payload = {"first_name": "Петя", "last_name": "Петрова", "phone": "0877 000 111", "privacy_consent": True}
        payload.update(overrides)
        return self.api.patch(reverse("api:me"), payload, format="json")


class ProfileTests(ClientAccountTestCase):
    def test_needs_login(self):
        self.assertEqual(APIClient().get(reverse("api:me")).status_code, 403)

    def test_staff_session_is_not_a_client(self):
        staff = APIClient()
        staff.force_authenticate(User.objects.create_user("poli", is_staff=True))
        self.assertEqual(staff.get(reverse("api:me")).status_code, 403)

    def test_create_profile(self):
        self.assertFalse(self.api.get(reverse("api:me")).json()["complete"])
        self.assertEqual(self.make_profile(privacy_consent=False).status_code, 400)

        response = self.make_profile(preferred_specialist=self.poli.pk, marketing_consent=True)
        self.assertEqual(response.status_code, 200, response.content)
        profile = response.json()
        self.assertTrue(profile["complete"])
        self.assertEqual(profile["phone"], "+359877000111")
        self.assertTrue(profile["marketing_consent"])
        client = Client.objects.get(user=self.user)
        self.assertEqual(client.email, "petya@example.com")
        self.assertEqual(client.preferred_specialist, self.poli)
        self.assertEqual(client.privacy_consent_version, "2026-10")

    def test_change_profile_and_withdraw_marketing_consent(self):
        self.make_profile(marketing_consent=True)
        changes = {"last_name": "Георгиева", "marketing_consent": False}
        response = self.api.patch(reverse("api:me"), changes, format="json")
        self.assertEqual(response.json()["last_name"], "Георгиева")
        self.assertIsNone(Client.objects.get(user=self.user).marketing_consent_at)

    def test_phone_of_another_client_is_refused(self):
        response = self.make_profile(phone="0888 123 456")  # Мария's phone
        self.assertEqual(response.status_code, 400)
        self.assertIn("вече е записан", response.json()["detail"])
        self.assertIsNone(Client.objects.get(pk=self.client_obj.pk).user)

    def test_export(self):
        self.make_profile()
        client = Client.objects.get(user=self.user)
        self.book(self.poli, self.colour, at(self.day, 9), client=client)
        Message.objects.create(client=client, text="Здравейте!", from_client=True, sender=self.user)
        response = self.api.get(reverse("api:me-export"))
        self.assertIn("attachment", response["Content-Disposition"])
        data = json.loads(response.content)
        self.assertEqual(data["profile"]["phone"], "+359877000111")
        self.assertEqual(data["bookings"][0]["services"][0]["service"], "Боядисване на корени")
        self.assertEqual(data["messages"][0]["text"], "Здравейте!")

    def test_delete_account(self):
        self.make_profile()
        client = Client.objects.get(user=self.user)
        past = self.book(self.poli, self.cut, at(self.day, 9) - timedelta(days=30), client=client, status="completed")
        future = self.book(self.poli, self.colour, at(self.day, 9), client=client)
        Message.objects.create(client=client, text="Здравейте!", from_client=True)
        ClientNote.objects.create(client=client, author=User.objects.create_user("poli", is_staff=True), text="x")

        self.assertEqual(self.api.delete(reverse("api:me")).status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        client.refresh_from_db()
        self.assertEqual((client.first_name, client.email, client.user), ("Изтрит", "", None))
        self.assertEqual(client.phone, f"deleted-{client.pk}")
        self.assertFalse(client.messages.exists() or client.private_notes.exists())
        self.assertEqual(Booking.objects.get(pk=future.pk).status, BookingStatus.CANCELLED)
        self.assertEqual(Booking.objects.get(pk=past.pk).status, BookingStatus.COMPLETED)


class BookingLinkTests(ClientAccountTestCase):
    def booking_payload(self, phone, email="petya@example.com"):
        return {
            "start": at(self.day, 9).isoformat(),
            "items": [{"service": self.colour.pk, "specialist": self.poli.pk}],
            "client": {"first_name": "Петя", "phone": phone, "email": email},
            "consent": True,
        }

    def test_typed_phone_of_someone_else_does_not_give_their_history(self):
        response = self.api.post(reverse("api:booking-create"), self.booking_payload("0888 123 456"), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.client_obj.refresh_from_db()
        self.assertIsNone(self.client_obj.user)
        self.assertEqual(self.api.get(reverse("api:my-bookings")).json(), [])

    def test_matching_verified_email_links_the_record(self):
        self.client_obj.email = "petya@example.com"
        self.client_obj.save()
        self.api.post(reverse("api:booking-create"), self.booking_payload("0888 123 456"), format="json")
        self.client_obj.refresh_from_db()
        self.assertEqual(self.client_obj.user, self.user)
        self.assertEqual(len(self.api.get(reverse("api:my-bookings")).json()), 1)


class StaffBookingLinkTests(ClientAccountTestCase):
    """A visit booked from the staff calendar shows up for a client who is already logged in."""

    def staff_books(self, **new_client):
        staff = APIClient()
        staff.force_authenticate(User.objects.create_user("poli", is_staff=True))
        payload = {
            "new_client": {"first_name": "Петя", "last_name": "Петрова", "phone": "0877 000 111", **new_client},
            "specialist": self.poli.pk,
            "services": [self.cut.pk],
            "start": at(self.day, 15).isoformat(),
        }
        response = staff.post(reverse("api:staff-booking-create"), payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)

    def test_same_email_links_while_logged_in(self):
        self.assertFalse(self.api.get(reverse("api:me")).json()["complete"])
        self.staff_books(email="Petya@Example.com")

        profile = self.api.get(reverse("api:me")).json()
        self.assertTrue(profile["complete"])
        self.assertEqual((profile["first_name"], profile["last_name"]), ("Петя", "Петрова"))
        self.assertEqual(self.api.get(reverse("api:auth-session")).json()["user"]["name"], "Петя Петрова")
        self.assertEqual(Client.objects.get(phone="+359877000111").user, self.user)

    def test_visit_list_links_too(self):
        self.staff_books(email="petya@example.com")
        self.assertEqual(len(self.api.get(reverse("api:my-bookings")).json()), 1)

    def test_without_email_nothing_is_linked(self):
        self.staff_books()
        self.assertFalse(self.api.get(reverse("api:me")).json()["complete"])
        self.assertEqual(self.api.get(reverse("api:my-bookings")).json(), [])
        self.assertIsNone(Client.objects.get(phone="+359877000111").user)

    def test_other_email_is_not_linked(self):
        self.staff_books(email="someone@example.com")
        self.assertFalse(self.api.get(reverse("api:me")).json()["complete"])


class MessagesTests(ClientAccountTestCase):
    def setUp(self):
        super().setUp()
        self.make_profile()
        self.client_record = Client.objects.get(user=self.user)
        self.staff = APIClient()
        self.poli_user = User.objects.create_user("poli", is_staff=True)
        self.poli.user = self.poli_user
        self.poli.save()
        self.staff.force_authenticate(self.poli_user)

    def test_conversation(self):
        response = self.api.post(reverse("api:me-messages"), {"text": "Може ли в петък?"}, format="json")
        self.assertEqual(response.status_code, 201, response.content)

        inbox = self.staff.get(reverse("api:staff-inbox")).json()
        self.assertEqual(inbox["unread_total"], 1)
        self.assertEqual(inbox["conversations"][0]["client"]["name"], "Петя Петрова")
        self.assertEqual(inbox["conversations"][0]["last_message"]["text"], "Може ли в петък?")

        url = reverse("api:staff-client-messages", args=[self.client_record.pk])
        self.assertEqual(len(self.staff.get(url).json()), 1)
        self.assertEqual(self.staff.get(reverse("api:staff-inbox")).json()["unread_total"], 0)

        mail.outbox.clear()
        reply = self.staff.post(url, {"text": "Да, в 10:00."}, format="json").json()
        self.assertEqual(reply["sender_name"], "Поли Ботева")
        self.assertEqual(mail.outbox[0].to, ["petya@example.com"])

        self.assertEqual(self.api.get(reverse("api:auth-session")).json()["user"]["unread_messages"], 1)
        messages = self.api.get(reverse("api:me-messages")).json()
        self.assertEqual([m["from_client"] for m in messages], [True, False])
        self.assertEqual(self.api.get(reverse("api:auth-session")).json()["user"]["unread_messages"], 0)

    def test_client_without_account_cannot_get_messages(self):
        url = reverse("api:staff-client-messages", args=[self.client_obj.pk])
        response = self.staff.post(url, {"text": "Здравейте"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_clients_cannot_use_the_staff_side(self):
        self.assertEqual(self.api.get(reverse("api:staff-inbox")).status_code, 403)
        self.assertEqual(self.api.get(reverse("api:staff-client", args=[self.client_record.pk])).status_code, 403)


class StaffClientCardTests(SalonTestCase):
    def setUp(self):
        super().setUp()
        self.poli_user = User.objects.create_user("poli", is_staff=True)
        self.ivan_user = User.objects.create_user("ivan", is_staff=True)
        self.api = APIClient()
        self.api.force_authenticate(self.poli_user)

    def test_nickname_is_found_by_search(self):
        petar = Client.objects.create(first_name="Петър", last_name="Стайков", phone="0899 000 001")
        url = reverse("api:staff-client", args=[petar.pk])
        self.assertEqual(self.api.patch(url, {"nickname": "Митко "}, format="json").json()["nickname"], "Митко")
        results = self.api.get(reverse("api:staff-clients"), {"q": "митко"}).json()
        self.assertEqual([(c["name"], c["nickname"]) for c in results], [("Петър Стайков", "Митко")])

    def test_private_notes_are_seen_only_by_their_author(self):
        notes_url = reverse("api:staff-client-notes", args=[self.client_obj.pk])
        note = self.api.post(notes_url, {"text": "Алергия към амоняк"}, format="json").json()
        card = self.api.get(reverse("api:staff-client", args=[self.client_obj.pk])).json()
        self.assertEqual([n["text"] for n in card["my_notes"]], ["Алергия към амоняк"])

        ivan = APIClient()
        ivan.force_authenticate(self.ivan_user)
        self.assertEqual(ivan.get(notes_url).json(), [])
        self.assertEqual(ivan.get(reverse("api:staff-client", args=[self.client_obj.pk])).json()["my_notes"], [])
        self.assertEqual(ivan.delete(reverse("api:staff-note", args=[note["id"]])).status_code, 404)

        response = self.api.patch(reverse("api:staff-note", args=[note["id"]]), {"text": "Без амоняк"}, format="json")
        self.assertEqual(response.json()["text"], "Без амоняк")
        self.assertEqual(self.api.delete(reverse("api:staff-note", args=[note["id"]])).status_code, 204)

    def test_card_shows_recent_visits(self):
        self.book(self.poli, self.colour, at(self.day, 9))
        card = self.api.get(reverse("api:staff-client", args=[self.client_obj.pk])).json()
        self.assertEqual(card["bookings"][0]["services"], "Боядисване на корени")
        self.assertFalse(card["has_account"])
