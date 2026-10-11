from datetime import time, timedelta
from decimal import Decimal

from django.conf import settings
from django.test import override_settings

from apps.bookings.availability import AvailabilityEngine, BookingError, ItemRequest, _max_concurrency, _subtract
from apps.staff.models import ScheduleOverride, TimeOff

from .factories import SalonTestCase, at


class HelperTests(SalonTestCase):
    def test_subtract_splits_intervals(self):
        d = self.day
        result = _subtract([(at(d, 9), at(d, 18))], [(at(d, 10), at(d, 11)), (at(d, 17), at(d, 19))])
        self.assertEqual(result, [(at(d, 9), at(d, 10)), (at(d, 11), at(d, 17))])

    def test_max_concurrency_ignores_touching_intervals(self):
        d = self.day
        intervals = [(at(d, 9), at(d, 10)), (at(d, 10), at(d, 11)), (at(d, 10, 30), at(d, 12))]
        self.assertEqual(_max_concurrency(intervals, at(d, 9), at(d, 10)), 1)
        self.assertEqual(_max_concurrency(intervals, at(d, 9), at(d, 12)), 2)


class SingleServiceTests(SalonTestCase):
    def slots(self, *requests, parallel=False, now=None, day=None):
        engine = AvailabilityEngine(list(requests), parallel=parallel, now=now)
        return engine.slots_for_day(day or self.day)

    def test_whole_day_on_a_15_minute_grid(self):
        slots = self.slots(ItemRequest(self.colour, self.poli))
        self.assertEqual(slots[0].start, at(self.day, 9))
        # 90 min service, closing at 18:00 -> last start 16:30.
        self.assertEqual(slots[-1].start, at(self.day, 16, 30))
        self.assertEqual(len(slots), (16 * 60 + 30 - 9 * 60) // 15 + 1)

    def test_existing_booking_and_buffer_block_the_specialist(self):
        # Ivan cuts 10:00–10:45 and needs 15 min afterwards -> busy until 11:00.
        self.book(self.ivan, self.cut, at(self.day, 10), buffer=15)
        slot_starts = {s.start for s in self.slots(ItemRequest(self.cut, self.ivan))}
        slots_start = slot_starts
        self.assertIn(at(self.day, 9), slots_start)
        # 09:15 + 45 min + 15 buffer = 10:15 > 10:00 -> not free.
        self.assertNotIn(at(self.day, 9, 15), slots_start)
        for blocked in (at(self.day, 10), at(self.day, 10, 30), at(self.day, 10, 45)):
            self.assertNotIn(blocked, slots_start)
        self.assertIn(at(self.day, 11), slots_start)

    def test_cancelled_booking_does_not_block(self):
        self.book(self.ivan, self.cut, at(self.day, 10), status="cancelled")
        self.assertIn(at(self.day, 10), {s.start for s in self.slots(ItemRequest(self.cut, self.ivan))})

    def test_time_off_blocks(self):
        TimeOff.objects.create(specialist=self.poli, start=at(self.day, 12), end=at(self.day, 18))
        slots = self.slots(ItemRequest(self.colour, self.poli))
        self.assertEqual(slots[-1].start, at(self.day, 10, 30))

    def test_date_override_replaces_weekly_hours(self):
        ScheduleOverride.objects.create(specialist=self.poli, date=self.day, start_time=time(13), end_time=time(16))
        slots = self.slots(ItemRequest(self.colour, self.poli))
        self.assertEqual([slots[0].start, slots[-1].start], [at(self.day, 13), at(self.day, 14, 30)])

    def test_day_off(self):
        sunday = self.day + timedelta(days=6)
        self.assertEqual(self.slots(ItemRequest(self.colour, self.poli), day=sunday), [])

    def test_override_on_a_day_off_opens_it(self):
        sunday = self.day + timedelta(days=6)
        ScheduleOverride.objects.create(specialist=self.poli, date=sunday, start_time=time(10), end_time=time(12))
        slots = self.slots(ItemRequest(self.colour, self.poli), day=sunday)
        self.assertEqual([s.start for s in slots], [at(sunday, 10), at(sunday, 10, 15), at(sunday, 10, 30)])

    def test_any_specialist_falls_back_to_the_next_free_one(self):
        self.book(self.poli, self.colour, at(self.day, 9))
        slot = next(s for s in self.slots(ItemRequest(self.colour)) if s.start == at(self.day, 9))
        self.assertEqual(slot.items[0].specialist, self.ivan)

    def test_specialist_price_override(self):
        poli = self.slots(ItemRequest(self.colour, self.poli))[0]
        ivan = self.slots(ItemRequest(self.colour, self.ivan))[0]
        self.assertEqual(poli.total_price, Decimal("80.00"))
        self.assertEqual(ivan.total_price, Decimal("60.00"))

    def test_minimum_notice(self):
        now = at(self.day, 10, 5)
        slots = self.slots(ItemRequest(self.colour, self.poli), now=now)
        self.assertEqual(slots[0].start, at(self.day, 11, 15))

    @override_settings(BOOKING={**settings.BOOKING, "MAX_DAYS_AHEAD": 3})
    def test_booking_window_limit(self):
        self.assertEqual(self.slots(ItemRequest(self.colour, self.poli)), [])

    def test_specialist_who_does_not_do_the_service(self):
        with self.assertRaisesMessage(BookingError, "не извършва"):
            AvailabilityEngine([ItemRequest(self.manicure, self.poli)])

    def test_service_not_bookable_online(self):
        self.colour.is_online_bookable = False
        self.colour.save()
        with self.assertRaisesMessage(BookingError, "не може да бъде резервирана онлайн"):
            AvailabilityEngine([ItemRequest(self.colour)])
        # Staff may still book it.
        AvailabilityEngine([ItemRequest(self.colour)], for_staff=True)

    def test_empty_request(self):
        with self.assertRaises(BookingError):
            AvailabilityEngine([])


class MultiServiceTests(SalonTestCase):
    def test_sequential_services_follow_each_other(self):
        engine = AvailabilityEngine([ItemRequest(self.cut, self.poli), ItemRequest(self.colour, self.poli)])
        slot = engine.plan_at(at(self.day, 9))
        self.assertEqual([i.start for i in slot.items], [at(self.day, 9), at(self.day, 9, 45)])
        self.assertEqual(slot.end, at(self.day, 11, 15))
        self.assertEqual(slot.total_price, Decimal("110.00"))

    def test_sequential_total_duration_must_fit_before_closing(self):
        engine = AvailabilityEngine([ItemRequest(self.cut, self.poli), ItemRequest(self.colour, self.poli)])
        slots = engine.slots_for_day(self.day)
        self.assertEqual(slots[-1].start, at(self.day, 15, 45))

    def test_parallel_services_run_at_the_same_time(self):
        engine = AvailabilityEngine([ItemRequest(self.manicure), ItemRequest(self.colour, self.poli)], parallel=True)
        slot = engine.plan_at(at(self.day, 9))
        self.assertEqual({i.start for i in slot.items}, {at(self.day, 9)})
        self.assertEqual({i.specialist for i in slot.items}, {self.nadia, self.poli})
        self.assertEqual(slot.end, at(self.day, 10, 30))

    def test_parallel_needs_every_specialist_free(self):
        self.book(self.nadia, self.manicure, at(self.day, 9))
        engine = AvailabilityEngine([ItemRequest(self.manicure), ItemRequest(self.colour, self.poli)], parallel=True)
        self.assertIsNone(engine.plan_at(at(self.day, 9)))
        self.assertIsNotNone(engine.plan_at(at(self.day, 10, 30)))

    def test_parallel_never_gives_one_specialist_two_services(self):
        engine = AvailabilityEngine(
            [ItemRequest(self.cut, self.poli), ItemRequest(self.colour, self.poli)], parallel=True
        )
        self.assertEqual(engine.slots_for_day(self.day), [])

    def test_parallel_backtracks_to_find_a_valid_assignment(self):
        # The cut would go to Poli first (she is listed first), but only Poli colours here,
        # so the engine has to move the cut to Ivan.
        engine = AvailabilityEngine([ItemRequest(self.cut), ItemRequest(self.colour, self.poli)], parallel=True)
        slot = engine.plan_at(at(self.day, 9))
        self.assertEqual([i.specialist for i in slot.items], [self.ivan, self.poli])

    def test_parallel_with_no_valid_assignment(self):
        self.book(self.ivan, self.cut, at(self.day, 9))
        engine = AvailabilityEngine([ItemRequest(self.cut), ItemRequest(self.colour, self.poli)], parallel=True)
        self.assertIsNone(engine.plan_at(at(self.day, 9)))


class ResourceTests(SalonTestCase):
    def test_resource_limits_parallel_use(self):
        self.make_basin(quantity=1)
        engine = AvailabilityEngine(
            [ItemRequest(self.colour, self.poli), ItemRequest(self.cut, self.ivan)], parallel=True
        )
        self.assertIsNone(engine.plan_at(at(self.day, 9)))

    def test_resource_with_capacity_two(self):
        self.make_basin(quantity=2)
        engine = AvailabilityEngine(
            [ItemRequest(self.colour, self.poli), ItemRequest(self.cut, self.ivan)], parallel=True
        )
        self.assertIsNotNone(engine.plan_at(at(self.day, 9)))

    def test_existing_booking_holds_the_resource(self):
        self.make_basin(quantity=1)
        self.book(self.poli, self.colour, at(self.day, 9))
        engine = AvailabilityEngine([ItemRequest(self.cut, self.ivan)])
        self.assertIsNone(engine.plan_at(at(self.day, 9, 30)))
        self.assertIsNotNone(engine.plan_at(at(self.day, 10, 30)))
