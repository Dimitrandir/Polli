"""Availability engine.

Free start times are computed per specialist, not as fixed slots:
  * each specialist has working intervals for a date (weekly hours or a date override),
    minus time off and minus existing bookings (including the preparation buffer);
  * a request is a list of services, each optionally tied to a specialist;
  * in sequential mode the services follow each other, in parallel mode they all start
    together and must be done by different specialists
    (e.g. gel manicure and root colouring at the same time);
  * shared resources (a wash basin, a manicure table) limit how many services that need
    them can run at once.
"""

from dataclasses import dataclass, field
from datetime import date as date_cls
from datetime import datetime, timedelta
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from apps.catalog.models import Service
from apps.staff.models import Resource, Specialist, SpecialistService, TimeOff
from apps.staff.schedule import aware, working_intervals

from .models import OCCUPYING_STATUSES, BookingItem

MAX_ITEMS_PER_BOOKING = 6


class BookingError(Exception):
    """A booking rule was violated. The message is safe to show to the client (in Bulgarian)."""


@dataclass(frozen=True)
class ItemRequest:
    service: Service
    specialist: Specialist | None = None


@dataclass
class PlannedItem:
    service: Service
    specialist: Specialist
    start: datetime
    end: datetime
    busy_until: datetime
    price: Decimal
    duration_minutes: int


@dataclass
class Slot:
    start: datetime
    end: datetime
    items: list[PlannedItem]

    @property
    def total_price(self):
        return sum((i.price for i in self.items), Decimal("0"))


@dataclass
class _Day:
    free: dict[int, list[tuple[datetime, datetime]]] = field(default_factory=dict)
    resource_busy: dict[int, list[tuple[datetime, datetime]]] = field(default_factory=dict)
    first_start: datetime | None = None
    last_end: datetime | None = None


def _booking_rule(name):
    return settings.BOOKING[name]


def _subtract(intervals, busy):
    """Remove busy intervals from a list of (start, end) intervals."""
    result = []
    for start, end in intervals:
        pieces = [(start, end)]
        for b_start, b_end in busy:
            next_pieces = []
            for p_start, p_end in pieces:
                if b_end <= p_start or b_start >= p_end:
                    next_pieces.append((p_start, p_end))
                    continue
                if b_start > p_start:
                    next_pieces.append((p_start, b_start))
                if b_end < p_end:
                    next_pieces.append((b_end, p_end))
            pieces = next_pieces
        result.extend(pieces)
    return sorted(result)


def _max_concurrency(intervals, start, end):
    """Highest number of intervals that overlap at any moment inside [start, end)."""
    events = []
    for i_start, i_end in intervals:
        if i_start < end and i_end > start:
            events.append((max(i_start, start), 1))
            events.append((min(i_end, end), -1))
    # Ends sort before starts at the same moment, so touching intervals do not count as overlap.
    events.sort(key=lambda e: (e[0], e[1]))
    current = peak = 0
    for _, delta in events:
        current += delta
        peak = max(peak, current)
    return peak


class AvailabilityEngine:
    def __init__(self, requests, parallel=False, *, for_staff=False, now=None):
        if not requests:
            raise BookingError("Изберете поне една услуга.")
        if len(requests) > MAX_ITEMS_PER_BOOKING:
            raise BookingError(f"Една резервация може да съдържа най-много {MAX_ITEMS_PER_BOOKING} услуги.")
        self.requests = list(requests)
        self.parallel = parallel and len(self.requests) > 1
        self.for_staff = for_staff
        self.now = now or timezone.now()
        self.tz = timezone.get_current_timezone()
        self.step = timedelta(minutes=_booking_rule("SLOT_STEP_MINUTES"))
        self.candidates = [self._candidates_for(req) for req in self.requests]
        self.resources = {
            r.id: r
            for r in Resource.objects.filter(
                is_active=True, services__in=[req.service.pk for req in self.requests]
            ).distinct()
        }
        self.service_resources = {
            req.service.pk: [r.id for r in req.service.resources.all() if r.id in self.resources]
            for req in self.requests
        }

    # --- setup ---------------------------------------------------------------

    def _candidates_for(self, req):
        service = req.service
        if not service.is_active or not (service.is_online_bookable or self.for_staff):
            raise BookingError(f"Услугата „{service.name}“ не може да бъде резервирана онлайн.")
        qs = SpecialistService.objects.filter(service=service, specialist__is_active=True).select_related(
            "specialist", "service"
        )
        if not self.for_staff:
            qs = qs.filter(specialist__is_online_bookable=True)
        if req.specialist is not None:
            qs = qs.filter(specialist=req.specialist)
        candidates = list(qs.order_by("specialist__order", "specialist__name"))
        if not candidates:
            if req.specialist is not None:
                raise BookingError(f"{req.specialist.name} не извършва услугата „{service.name}“.")
            raise BookingError(f"В момента няма специалист за услугата „{service.name}“.")
        return candidates

    @property
    def specialist_ids(self):
        return sorted({ss.specialist_id for cands in self.candidates for ss in cands})

    @property
    def resource_ids(self):
        return sorted(self.resources)

    # --- loading a day -------------------------------------------------------

    def _aware(self, day, t):
        return aware(day, t, self.tz)

    def _load_day(self, day):
        day_start = self._aware(day, datetime.min.time())
        day_end = day_start + timedelta(days=1)
        ids = self.specialist_ids
        data = _Day()

        working = working_intervals(ids, day, self.tz)

        busy = {sid: [] for sid in ids}
        for off in TimeOff.objects.filter(specialist_id__in=ids, start__lt=day_end, end__gt=day_start):
            busy[off.specialist_id].append((off.start, off.end))
        for item in BookingItem.objects.filter(
            specialist_id__in=ids,
            booking__status__in=OCCUPYING_STATUSES,
            start_at__lt=day_end,
            busy_until__gt=day_start,
        ):
            busy[item.specialist_id].append((item.start_at, item.busy_until))

        for sid in ids:
            data.free[sid] = _subtract(working[sid], busy[sid])
            for start, end in data.free[sid]:
                data.first_start = start if data.first_start is None else min(data.first_start, start)
                data.last_end = end if data.last_end is None else max(data.last_end, end)

        data.resource_busy = {rid: [] for rid in self.resources}
        if self.resources:
            items = BookingItem.objects.filter(
                booking__status__in=OCCUPYING_STATUSES,
                service__resources__in=self.resource_ids,
                start_at__lt=day_end,
                busy_until__gt=day_start,
            ).prefetch_related("service__resources")
            for item in items.distinct():
                for r in item.service.resources.all():
                    if r.id in data.resource_busy:
                        data.resource_busy[r.id].append((item.start_at, item.busy_until))
        return data

    # --- planning ------------------------------------------------------------

    def _specialist_free(self, data, specialist_id, start, end):
        return any(f_start <= start and end <= f_end for f_start, f_end in data.free.get(specialist_id, []))

    def _resources_free(self, data, service_id, start, end, planned):
        for rid in self.service_resources.get(service_id, []):
            intervals = list(data.resource_busy[rid])
            intervals += [
                (p.start, p.busy_until) for p in planned if rid in self.service_resources.get(p.service.pk, [])
            ]
            if _max_concurrency(intervals, start, end) + 1 > self.resources[rid].quantity:
                return False
        return True

    def _try(self, data, ss, start, planned):
        """Return a PlannedItem if this specialist can do the service at `start`, else None."""
        duration = ss.duration_minutes
        end = start + timedelta(minutes=duration)
        busy_until = end + timedelta(minutes=ss.service.buffer_minutes)
        if not self._specialist_free(data, ss.specialist_id, start, busy_until):
            return None
        for p in planned:
            if p.specialist.pk == ss.specialist_id and p.start < end and start < p.end:
                return None
        if not self._resources_free(data, ss.service_id, start, busy_until, planned):
            return None
        return PlannedItem(
            service=ss.service,
            specialist=ss.specialist,
            start=start,
            end=end,
            busy_until=busy_until,
            price=ss.price,
            duration_minutes=duration,
        )

    def _plan_sequential(self, data, start):
        planned = []
        t = start
        for cands in self.candidates:
            item = next((i for ss in cands if (i := self._try(data, ss, t, planned))), None)
            if item is None:
                return None
            planned.append(item)
            t = item.end
        return planned

    def _plan_parallel(self, data, start, index=0, planned=None):
        planned = planned or []
        if index == len(self.candidates):
            return planned
        for ss in self.candidates[index]:
            item = self._try(data, ss, start, planned)
            if item is not None:
                result = self._plan_parallel(data, start, index + 1, planned + [item])
                if result:
                    return result
        return None

    def _plan(self, data, start):
        items = self._plan_parallel(data, start) if self.parallel else self._plan_sequential(data, start)
        if not items:
            return None
        return Slot(start=start, end=max(i.end for i in items), items=items)

    # --- booking window ------------------------------------------------------

    def _earliest_start(self):
        if self.for_staff:
            return None
        return self.now + timedelta(minutes=_booking_rule("MIN_NOTICE_MINUTES"))

    def _last_day(self):
        if self.for_staff:
            return None
        return timezone.localdate(self.now) + timedelta(days=_booking_rule("MAX_DAYS_AHEAD"))

    def _in_window(self, start):
        earliest, last_day = self._earliest_start(), self._last_day()
        if earliest and start < earliest:
            return False
        if last_day and timezone.localtime(start, self.tz).date() > last_day:
            return False
        return True

    # --- public API ----------------------------------------------------------

    def slots_for_day(self, day: date_cls):
        data = self._load_day(day)
        if data.first_start is None:
            return []
        midnight = self._aware(day, datetime.min.time())
        # Align the first candidate to the slot grid (e.g. :00, :15, :30, :45).
        offset = (data.first_start - midnight) % self.step
        t = data.first_start if not offset else data.first_start + (self.step - offset)
        slots = []
        while t < data.last_end:
            if self._in_window(t):
                slot = self._plan(data, t)
                if slot:
                    slots.append(slot)
            t += self.step
        return slots

    def slots(self, date_from: date_cls, days=1):
        days = max(1, min(days, _booking_rule("MAX_AVAILABILITY_DAYS")))
        return {date_from + timedelta(days=n): self.slots_for_day(date_from + timedelta(days=n)) for n in range(days)}

    def plan_at(self, start: datetime):
        """The plan for one exact start time, or None if it is not available."""
        if not self._in_window(start):
            return None
        local = timezone.localtime(start, self.tz)
        midnight = self._aware(local.date(), datetime.min.time())
        if not self.for_staff and (start - midnight) % self.step:
            return None
        data = self._load_day(timezone.localtime(start, self.tz).date())
        return self._plan(data, start)
