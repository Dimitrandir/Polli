from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from apps.bookings.models import Booking, BookingItem
from apps.catalog.models import Service, ServiceCategory, ServiceGroup
from apps.clients.models import Client
from apps.staff.models import Resource, Specialist, SpecialistService, WorkingHours


def future_weekday(weekday=0, min_days=7):
    """A date at least `min_days` ahead that falls on the given weekday (0 = Monday)."""
    day = timezone.localdate() + timedelta(days=min_days)
    while day.weekday() != weekday:
        day += timedelta(days=1)
    return day


def at(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


class SalonTestCase(TestCase):
    """A small salon: two hair specialists, one nail technician, Mon–Fri 09:00–18:00."""

    @classmethod
    def setUpTestData(cls):
        hair = ServiceCategory.objects.create(name="Коса", slug="kosa", order=1)
        nails = ServiceCategory.objects.create(name="Нокти", slug="nokti", order=2)
        colour = ServiceGroup.objects.create(category=hair, name="Боядисване")
        cuts = ServiceGroup.objects.create(category=hair, name="Подстригване")
        gel = ServiceGroup.objects.create(category=nails, name="Гел лак")

        cls.colour = Service.objects.create(
            group=colour, name="Боядисване на корени", price=Decimal("60.00"), duration_minutes=90
        )
        cls.cut = Service.objects.create(
            group=cuts, name="Подстригване", price=Decimal("30.00"), duration_minutes=45, buffer_minutes=15
        )
        cls.manicure = Service.objects.create(
            group=gel, name="Маникюр с гел лак", price=Decimal("28.12"), duration_minutes=90
        )

        cls.poli = Specialist.objects.create(name="Поли Ботева", title="Колорист, трихолог", order=1)
        cls.ivan = Specialist.objects.create(name="Иван", order=2)
        cls.nadia = Specialist.objects.create(name="Надя", order=3)
        SpecialistService.objects.create(specialist=cls.poli, service=cls.colour, price_override=Decimal("80.00"))
        SpecialistService.objects.create(specialist=cls.poli, service=cls.cut)
        SpecialistService.objects.create(specialist=cls.ivan, service=cls.cut)
        SpecialistService.objects.create(specialist=cls.ivan, service=cls.colour)
        SpecialistService.objects.create(specialist=cls.nadia, service=cls.manicure)
        for specialist in (cls.poli, cls.ivan, cls.nadia):
            for weekday in range(5):
                WorkingHours.objects.create(
                    specialist=specialist, weekday=weekday, start_time=time(9), end_time=time(18)
                )

        cls.client_obj = Client.objects.create(first_name="Мария", last_name="Иванова", phone="0888 123 456")
        cls.day = future_weekday(0)

    def setUp(self):
        cache.clear()  # resets API throttling between tests

    def make_basin(self, quantity=1):
        basin = Resource.objects.create(name="Мивка", quantity=quantity)
        self.colour.resources.add(basin)
        self.cut.resources.add(basin)
        return basin

    def book(self, specialist, service, start, minutes=None, buffer=0, status="confirmed", client=None):
        minutes = minutes or service.duration_minutes
        end = start + timedelta(minutes=minutes)
        booking = Booking.objects.create(client=client or self.client_obj, start_at=start, end_at=end, status=status)
        BookingItem.objects.create(
            booking=booking,
            service=service,
            specialist=specialist,
            start_at=start,
            end_at=end,
            busy_until=end + timedelta(minutes=buffer),
            price=service.price,
            duration_minutes=minutes,
        )
        return booking
