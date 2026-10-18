"""Managing the salon from the team's side: rights, booking history, the month picker, team, services, settings."""

from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from apps.bookings.availability import AvailabilityEngine, ItemRequest
from apps.bookings.models import Booking
from apps.catalog.models import Service
from apps.salon.models import SalonInfo
from apps.staff.models import SpecialistService, TimeOff, WorkingHours
from apps.staff.roles import set_salon_admin

from .factories import at
from .test_staff_api import StaffApiTestCase


class ManageTestCase(StaffApiTestCase):
    def setUp(self):
        super().setUp()
        # Ivan is a regular team member; Poli (self.user) becomes the administrator where a test needs it.
        self.ivan_user = get_user_model().objects.create_user("ivan", password="tajna-parola-1", is_staff=True)
        self.ivan.user = self.ivan_user
        self.ivan.save()

    def as_ivan(self):
        self.api.force_authenticate(self.ivan_user)

    def as_admin(self):
        set_salon_admin(self.user, True)
        self.login()


class BookingRightsTests(ManageTestCase):
    def test_anyone_books_for_a_colleague_but_changes_only_their_own(self):
        self.as_ivan()
        response = self.api.post(
            reverse("api:staff-booking-create"),
            {
                "client": self.client_obj.pk,
                "specialist": self.poli.pk,
                "services": [self.cut.pk],
                "start": at(self.day, 10).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(response.json()["can_edit"])  # Ivan booked it, so he may change it

        others = self.book(self.poli, self.colour, at(self.day, 14))
        url = reverse("api:staff-booking-detail", args=[others.pk])
        self.assertFalse(self.api.get(url).json()["can_edit"])
        self.assertEqual(self.api.patch(url, {"status": "completed"}, format="json").status_code, 403)
        self.assertEqual(self.api.post(reverse("api:staff-booking-cancel", args=[others.pk])).status_code, 403)

        self.as_admin()
        self.assertEqual(self.api.patch(url, {"status": "completed"}, format="json").status_code, 200)

    def test_time_off_only_in_own_schedule(self):
        self.as_ivan()
        payload = {
            "specialist": self.poli.pk,
            "start": at(self.day, 13).isoformat(),
            "end": at(self.day, 14).isoformat(),
        }
        self.assertEqual(self.api.post(reverse("api:staff-time-off-create"), payload, format="json").status_code, 400)
        payload["specialist"] = self.ivan.pk
        self.assertEqual(self.api.post(reverse("api:staff-time-off-create"), payload, format="json").status_code, 201)

        block = TimeOff.objects.create(specialist=self.poli, start=at(self.day, 16), end=at(self.day, 17))
        self.assertEqual(self.api.delete(reverse("api:staff-time-off-detail", args=[block.pk])).status_code, 403)

    def test_session_says_who_is_admin(self):
        self.as_ivan()
        self.assertFalse(self.api.get(reverse("api:staff-session")).json()["user"]["is_admin"])
        self.as_admin()
        self.assertTrue(self.api.get(reverse("api:staff-session")).json()["user"]["is_admin"])


class HistoryTests(ManageTestCase):
    def test_who_booked_moved_and_cancelled(self):
        self.as_ivan()
        booking_id = self.api.post(
            reverse("api:staff-booking-create"),
            {
                "client": self.client_obj.pk,
                "specialist": self.ivan.pk,
                "services": [self.cut.pk],
                "start": at(self.day, 10).isoformat(),
            },
            format="json",
        ).json()["id"]
        booking = Booking.objects.get(pk=booking_id)
        self.assertEqual(booking.created_by, self.ivan_user)

        self.api.post(
            reverse("api:staff-booking-move", args=[booking_id]),
            {"item": booking.items.get().pk, "start": at(self.day, 11).isoformat(), "specialist": self.ivan.pk},
            format="json",
        )
        self.api.post(reverse("api:staff-booking-cancel", args=[booking_id]), {"reason": "болна"}, format="json")

        history = self.api.get(reverse("api:staff-booking-detail", args=[booking_id])).json()["history"]
        self.assertEqual([e["who"] for e in history], ["Иван", "Иван", "Иван"])
        self.assertEqual(history[0]["text"], "Записа часа")
        self.assertIn("Премести часа от", history[1]["text"])
        self.assertIn("11:00", history[1]["text"])
        self.assertEqual(history[2]["text"], "Отказа часа: болна")

    def test_online_booking_and_old_bookings(self):
        old = self.book(self.poli, self.cut, at(self.day, 10))
        self.login()
        history = self.api.get(reverse("api:staff-booking-detail", args=[old.pk])).json()["history"]
        self.assertEqual(history[0]["who"], "клиентът онлайн")


class MonthTests(ManageTestCase):
    def test_how_busy_each_specialist_is(self):
        self.book(self.poli, self.colour, at(self.day, 9))  # 90 of 540 minutes
        self.login()
        data = self.api.get(reverse("api:staff-month"), {"date": self.day.isoformat()}).json()
        self.assertEqual(data["month"], self.day.replace(day=1).isoformat())
        loads = data["days"][self.day.isoformat()]
        self.assertAlmostEqual(loads[str(self.poli.pk)], 0.17)
        self.assertEqual(loads[str(self.ivan.pk)], 0)
        saturday = self.day + timedelta(days=5)
        if saturday.month == self.day.month:
            self.assertEqual(data["days"][saturday.isoformat()], {})


class TeamTests(ManageTestCase):
    def test_edit_own_profile_and_hours_only(self):
        self.as_ivan()
        url = reverse("api:staff-team-member", args=[self.ivan.pk])
        response = self.api.patch(url, {"title": "Фризьор", "bio": "Обича късите прически."}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["is_me"])
        self.assertEqual(
            self.api.patch(
                reverse("api:staff-team-member", args=[self.poli.pk]), {"title": "x"}, format="json"
            ).status_code,
            403,
        )
        self.assertEqual(self.api.patch(url, {"is_admin": True}, format="json").status_code, 403)

        hours = [
            {"weekday": 0, "start": "09:00", "end": "13:00"},
            {"weekday": 0, "start": "14:00", "end": "19:00"},  # lunch break 13–14
        ]
        response = self.api.put(reverse("api:staff-team-hours", args=[self.ivan.pk]), hours, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            list(WorkingHours.objects.filter(specialist=self.ivan).values_list("start_time", flat=True)),
            [time(9), time(14)],
        )
        overlapping = [*hours, {"weekday": 0, "start": "18:00", "end": "20:00"}]
        response = self.api.put(reverse("api:staff-team-hours", args=[self.ivan.pk]), overlapping, format="json")
        self.assertEqual(response.status_code, 400)

    def test_admin_adds_person_grants_rights_and_switches_off(self):
        self.as_admin()
        response = self.api.post(
            reverse("api:staff-team"),
            {"name": "Ели", "title": "Маникюрист", "username": "eli", "password": "Dylga-parola-42", "is_admin": True},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(response.json()["login"]["is_admin"])

        eli = response.json()["id"]
        url = reverse("api:staff-team-member", args=[eli])
        response = self.api.patch(url, {"is_active": False}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(get_user_model().objects.get(username="eli").is_active)

        self.book(self.ivan, self.cut, at(self.day, 10))
        response = self.api.patch(
            reverse("api:staff-team-member", args=[self.ivan.pk]), {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("предстоящи", response.json()["detail"])

        me = reverse("api:staff-team-member", args=[self.poli.pk])
        self.assertEqual(self.api.patch(me, {"is_admin": False}, format="json").status_code, 400)

    def test_inactive_people_are_hidden_from_others(self):
        self.nadia.is_active = False
        self.nadia.save()
        self.as_ivan()
        names = [m["name"] for m in self.api.get(reverse("api:staff-team")).json()]
        self.assertNotIn("Надя", names)
        self.as_admin()
        names = [m["name"] for m in self.api.get(reverse("api:staff-team")).json()]
        self.assertIn("Надя", names)


class CatalogTests(ManageTestCase):
    def test_only_admin_edits_services(self):
        self.as_ivan()
        self.assertEqual(self.api.get(reverse("api:staff-catalog")).status_code, 200)
        url = reverse("api:staff-service", args=[self.cut.pk])
        self.assertEqual(self.api.patch(url, {"price": "35.00"}, format="json").status_code, 403)

        self.as_admin()
        response = self.api.patch(
            url,
            {"price": "35.00", "specialists": [{"id": self.poli.pk, "price": "40.00"}, {"id": self.nadia.pk}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.cut.refresh_from_db()
        self.assertEqual(self.cut.price, Decimal("35.00"))
        offers = dict(SpecialistService.objects.filter(service=self.cut).values_list("specialist_id", "price_override"))
        self.assertEqual(offers, {self.poli.pk: Decimal("40.00"), self.nadia.pk: None})  # Ivan was removed

    def test_add_a_service(self):
        self.as_admin()
        response = self.api.post(
            reverse("api:staff-service-create"),
            {
                "group": self.cut.group_id,
                "name": "Детско подстригване",
                "price": "20.00",
                "duration_minutes": 30,
                "specialists": [{"id": self.ivan.pk}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        service = Service.objects.get(name="Детско подстригване")
        self.assertTrue(SpecialistService.objects.filter(service=service, specialist=self.ivan).exists())


class SettingsTests(ManageTestCase):
    @override_settings(
        BOOKING={
            "SLOT_STEP_MINUTES": 15,
            "MIN_NOTICE_MINUTES": 60,
            "MAX_DAYS_AHEAD": 60,
            "CANCELLATION_HOURS": 24,
            "MAX_AVAILABILITY_DAYS": 14,
        }
    )
    def test_booking_window_from_the_settings_page(self):
        self.as_ivan()
        self.assertEqual(self.api.get(reverse("api:staff-settings")).json()["max_days_ahead"], 60)
        self.assertEqual(
            self.api.patch(reverse("api:staff-settings"), {"max_days_ahead": 3}, format="json").status_code, 403
        )

        self.as_admin()
        response = self.api.patch(
            reverse("api:staff-settings"),
            {"max_days_ahead": 3, "opening_hours": [{"weekday": 0, "start": "09:00", "end": "19:00"}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(SalonInfo.objects.get().max_days_ahead, 3)
        self.assertEqual(len(response.json()["opening_hours"]), 1)

        # self.day is at least a week ahead, so online clients can no longer book it.
        engine = AvailabilityEngine([ItemRequest(service=self.cut, specialist=None)], now=timezone.now())
        self.assertEqual(engine.slots_for_day(self.day), [])


class ClientEditTests(ManageTestCase):
    def test_edit_contacts_and_block(self):
        self.as_ivan()
        url = reverse("api:staff-client", args=[self.client_obj.pk])
        response = self.api.patch(
            url, {"last_name": "Петрова", "phone": "0899 000 111", "is_blocked": True}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        card = response.json()
        self.assertEqual(card["name"], "Мария Петрова")
        self.assertEqual(card["phone"], "+359899000111")
        self.assertTrue(card["is_blocked"])
        self.assertIn("stats", card)

    def test_recent_clients_and_new_client(self):
        self.book(self.poli, self.cut, at(self.day, 10))
        self.as_ivan()
        rows = self.api.get(reverse("api:staff-clients")).json()
        self.assertEqual([r["id"] for r in rows], [self.client_obj.pk])
        response = self.api.post(
            reverse("api:staff-clients"), {"first_name": "Ана", "phone": "0877 123 456"}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        response = self.api.post(
            reverse("api:staff-clients"), {"first_name": "Друга", "phone": "0877123456"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
