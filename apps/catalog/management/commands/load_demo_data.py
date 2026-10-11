from datetime import time
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import Service, ServiceCategory, ServiceGroup
from apps.staff.models import Resource, Specialist, SpecialistService, WorkingHours

# Example data only, so the admin and API have something to show.
# Replace with the salon's real price list.
MENU = {
    ("Коса", "kosa"): {
        "Подстригване и стайлинг": [("Подстригване", "35.00", 45), ("Сешоар", "25.00", 30)],
        "Боядисване": [("Боядисване на корени", "60.00", 90), ("Балеаж", "150.00", 180)],
        "Терапии": [("Трихологична консултация", "40.00", 45)],
    },
    ("Нокти", "nokti"): {
        "Гел лак": [("Маникюр с гел лак", "28.12", 90), ("Педикюр с гел лак", "33.23", 90)],
    },
}


class Command(BaseCommand):
    help = "Зарежда примерни услуги, специалисти и работно време (за разработка)."

    @transaction.atomic
    def handle(self, *args, **options):
        services = {}
        for c_order, ((c_name, slug), groups) in enumerate(MENU.items()):
            category, _ = ServiceCategory.objects.get_or_create(slug=slug, defaults={"name": c_name, "order": c_order})
            for g_order, (g_name, items) in enumerate(groups.items()):
                group, _ = ServiceGroup.objects.get_or_create(
                    category=category, name=g_name, defaults={"order": g_order}
                )
                for s_order, (name, price, minutes) in enumerate(items):
                    services[name], _ = Service.objects.get_or_create(
                        group=group,
                        name=name,
                        defaults={"price": Decimal(price), "duration_minutes": minutes, "order": s_order},
                    )

        basin, _ = Resource.objects.get_or_create(name="Мивка", defaults={"quantity": 2})
        for name in ["Боядисване на корени", "Балеаж"]:
            services[name].resources.add(basin)

        team = {
            "Павлинка (Поли) Ботева": (
                "Колорист, трихолог",
                ["Подстригване", "Сешоар", "Боядисване на корени", "Балеаж", "Трихологична консултация"],
            ),
            "Маникюрист": ("Маникюр и педикюр", ["Маникюр с гел лак", "Педикюр с гел лак"]),
        }
        for order, (name, (title, service_names)) in enumerate(team.items()):
            specialist, _ = Specialist.objects.get_or_create(name=name, defaults={"title": title, "order": order})
            for service_name in service_names:
                SpecialistService.objects.get_or_create(specialist=specialist, service=services[service_name])
            for weekday in range(6):
                WorkingHours.objects.get_or_create(
                    specialist=specialist,
                    weekday=weekday,
                    defaults={"start_time": time(9), "end_time": time(19 if weekday < 5 else 15)},
                )
        self.stdout.write(self.style.SUCCESS("Примерните данни са заредени."))
