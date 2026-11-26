"""Days without online booking: closed for clients on the website and in the AI assistant, open for the team."""

from datetime import timedelta

from django.urls import reverse

from apps.assistant.models import Conversation
from apps.assistant.tools import find_free_slots_tool, propose_booking_tool
from apps.bookings.availability import AvailabilityEngine, BookingError, ItemRequest
from apps.bookings.models import Booking
from apps.bookings.services import create_booking
from apps.salon.models import DEFAULT_ONLINE_BLOCK_MESSAGE, OnlineBlock, SalonInfo

from .factories import at
from .test_staff_manage import ManageTestCase


class OnlineBlockTestCase(ManageTestCase):
    def availability(self, items, days=1, day=None):
        response = self.api.post(
            reverse("api:availability"),
            {"date": (day or self.day).isoformat(), "days": days, "items": items},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def close(self, specialist=None, message="", day=None):
        return OnlineBlock.objects.create(date=day or self.day, specialist=specialist, message=message)


class EngineTests(OnlineBlockTestCase):
    def test_whole_salon_closes_the_day_online_only(self):
        self.close()
        data = self.availability([{"service": self.cut.pk}], days=2)
        self.assertEqual(data["days"][0]["slots"], [])
        self.assertEqual(data["days"][0]["blocked"], DEFAULT_ONLINE_BLOCK_MESSAGE)
        self.assertIsNone(data["days"][1]["blocked"])
        self.assertTrue(data["days"][1]["slots"])

        with self.assertRaisesMessage(BookingError, "само по телефона"):
            create_booking(client=self.client_obj, requests=[ItemRequest(service=self.cut)], start=at(self.day, 10))
        # The team still books that day.
        booking = create_booking(
            client=self.client_obj, requests=[ItemRequest(service=self.cut)], start=at(self.day, 10), for_staff=True
        )
        self.assertEqual(booking.items.get().start_at, at(self.day, 10))

    def test_a_closed_specialist_leaves_the_colleagues_bookable(self):
        self.close(self.poli, message="Поли е на семинар.")
        # Any specialist: Ivan takes the cut, the day is not closed.
        data = self.availability([{"service": self.cut.pk}])
        self.assertIsNone(data["days"][0]["blocked"])
        names = {i["specialist_name"] for s in data["days"][0]["slots"] for i in s["items"]}
        self.assertEqual(names, {"Иван"})
        # Asked for Poli herself: closed, with her own text.
        data = self.availability([{"service": self.cut.pk, "specialist": self.poli.pk}])
        self.assertEqual(data["days"][0]["slots"], [])
        self.assertEqual(data["days"][0]["blocked"], "Поли е на семинар.")

    def test_salon_text_from_the_settings_and_the_phone(self):
        SalonInfo.objects.create(name="SIS", phone="0888 111 222", address="София", online_block_message="Обадете се!")
        self.close()
        data = self.availability([{"service": self.cut.pk}])
        self.assertEqual(data["days"][0]["blocked"], "Обадете се!")
        self.assertEqual(data["phone"], "0888 111 222")

    def test_existing_visits_stay(self):
        booking = self.book(self.poli, self.cut, at(self.day, 10))
        self.close()
        booking.refresh_from_db()
        self.assertEqual(booking.status, "confirmed")

    def test_staff_engine_ignores_blocks(self):
        self.close()
        engine = AvailabilityEngine([ItemRequest(service=self.cut)], for_staff=True)
        self.assertIsNone(engine.blocked_message(self.day))
        self.assertTrue(engine.slots_for_day(self.day))


class AssistantTests(OnlineBlockTestCase):
    def test_assistant_gives_the_text_and_the_phone(self):
        SalonInfo.objects.create(name="SIS", phone="0888 111 222", address="София")
        self.close()
        result = find_free_slots_tool({"services": [{"service_id": self.cut.pk}], "date": self.day.isoformat()})
        day = result["days"][0]
        self.assertEqual(day["slots"], [])
        self.assertEqual(day["online_booking_closed"], DEFAULT_ONLINE_BLOCK_MESSAGE)
        self.assertEqual(day["phone"], "0888 111 222")

        from apps.assistant.tools import ToolError

        with self.assertRaisesMessage(ToolError, "само по телефона"):
            propose_booking_tool(
                {"services": [{"service_id": self.cut.pk}], "start": at(self.day, 10).isoformat()},
                conversation=Conversation.objects.create(),
                created_proposals=[],
            )
        self.assertEqual(Booking.objects.count(), 0)


class StaffApiTests(OnlineBlockTestCase):
    url = reverse("api:staff-online-blocks")

    def post(self, **payload):
        return self.api.post(self.url, payload, format="json")

    def test_a_specialist_closes_only_their_own_days(self):
        self.as_ivan()
        days = [self.day.isoformat(), (self.day + timedelta(days=1)).isoformat()]
        response = self.post(dates=days, specialist=self.ivan.pk, blocked=True)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(OnlineBlock.objects.filter(specialist=self.ivan).count(), 2)

        self.assertEqual(self.post(dates=days, specialist=self.poli.pk, blocked=True).status_code, 403)
        self.assertEqual(self.post(dates=days, specialist=None, blocked=True).status_code, 403)

        data = self.api.get(self.url).json()
        self.assertFalse(data["can_block_salon"])
        self.assertEqual(len(data["blocks"]), 2)
        manage = {s["id"]: s["can_manage"] for s in data["specialists"]}
        self.assertTrue(manage[self.ivan.pk])
        self.assertFalse(manage[self.poli.pk])

        # Open one day again.
        self.post(dates=days[:1], specialist=self.ivan.pk, blocked=False)
        self.assertEqual(list(OnlineBlock.objects.values_list("date", flat=True)), [self.day + timedelta(days=1)])

    def test_admin_closes_the_salon_and_changes_the_text(self):
        self.as_admin()
        response = self.post(dates=[self.day.isoformat()], blocked=True)
        self.assertEqual(response.status_code, 200, response.content)
        block = OnlineBlock.objects.get()
        self.assertIsNone(block.specialist)
        self.assertEqual(block.created_by, self.user)

        # Closing again updates the day's own text instead of adding a second block.
        self.post(dates=[self.day.isoformat()], blocked=True, message="Салонът е на семинар.")
        self.assertEqual(OnlineBlock.objects.get().message, "Салонът е на семинар.")

        # The admin may also close a colleague's day.
        self.assertEqual(
            self.post(dates=[self.day.isoformat()], specialist=self.ivan.pk, blocked=True).status_code, 200
        )

        settings_url = reverse("api:staff-settings")
        self.assertEqual(self.api.get(settings_url).json()["online_block_message"], DEFAULT_ONLINE_BLOCK_MESSAGE)
        response = self.api.patch(settings_url, {"online_block_message": "Само по телефона, моля."}, format="json")
        self.assertEqual(response.json()["online_block_message"], "Само по телефона, моля.")

    def test_calendar_shows_closed_days(self):
        self.close(self.ivan)
        self.close(day=self.day + timedelta(days=1))
        self.login()
        day = self.api.get(reverse("api:staff-day"), {"date": self.day.isoformat()}).json()
        self.assertIsNone(day["online_blocks"]["salon"])
        self.assertIn(str(self.ivan.pk), day["online_blocks"]["specialists"])

        week = self.api.get(reverse("api:staff-week"), {"date": self.day.isoformat(), "specialist": self.ivan.pk})
        flags = [d["online_blocked"] for d in week.json()["days"]]
        self.assertEqual(flags[:3], [True, True, False])

        month = self.api.get(reverse("api:staff-month"), {"date": self.day.isoformat()}).json()
        self.assertEqual(month["online_blocks"][self.day.isoformat()], [self.ivan.pk])
        tomorrow = (self.day + timedelta(days=1)).isoformat()
        if tomorrow[:7] == self.day.isoformat()[:7]:
            self.assertEqual(month["online_blocks"][tomorrow], "salon")

    def test_needs_a_staff_login(self):
        self.api.force_authenticate(None)
        self.assertIn(self.api.get(self.url).status_code, (401, 403))
