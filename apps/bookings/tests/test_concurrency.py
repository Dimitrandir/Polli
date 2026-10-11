import threading
from datetime import time
from decimal import Decimal

from django.db import connection
from django.test import TransactionTestCase

from apps.bookings.availability import BookingError, ItemRequest
from apps.bookings.models import Booking
from apps.bookings.services import create_booking
from apps.catalog.models import Service, ServiceCategory, ServiceGroup
from apps.clients.models import Client
from apps.staff.models import Specialist, SpecialistService, WorkingHours

from .factories import at, future_weekday


class ConcurrentBookingTests(TransactionTestCase):
    def test_two_simultaneous_requests_for_the_same_slot(self):
        category = ServiceCategory.objects.create(name="Коса", slug="kosa")
        group = ServiceGroup.objects.create(category=category, name="Боядисване")
        service = Service.objects.create(group=group, name="Боядисване", price=Decimal(60), duration_minutes=90)
        poli = Specialist.objects.create(name="Поли")
        SpecialistService.objects.create(specialist=poli, service=service)
        day = future_weekday(0)
        WorkingHours.objects.create(specialist=poli, weekday=0, start_time=time(9), end_time=time(18))
        clients = [Client.objects.create(first_name=f"К{n}", phone=f"08880000{n}") for n in range(2)]

        barrier = threading.Barrier(2)
        results = []

        def attempt(client):
            try:
                barrier.wait()
                create_booking(client=client, requests=[ItemRequest(service, poli)], start=at(day, 10))
                results.append("ok")
            except BookingError:
                results.append("taken")
            finally:
                connection.close()

        threads = [threading.Thread(target=attempt, args=(c,)) for c in clients]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(sorted(results), ["ok", "taken"])
        self.assertEqual(Booking.objects.count(), 1)
