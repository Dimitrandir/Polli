import json
from datetime import datetime, time
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Service, ServiceCategory, ServiceGroup
from apps.content.models import Article, Page
from apps.salon.models import OpeningHours, SalonInfo
from apps.staff.models import Specialist, SpecialistService, WorkingHours

DEFAULT_DATA_DIR = Path(settings.BASE_DIR) / "data" / "old-site"


def read_markdown(path):
    """Split a data file into its JSON header and Markdown body."""
    _, header, body = path.read_text(encoding="utf-8").split("---\n", 2)
    return json.loads(header), body.strip()


def parse_time(value):
    return time.fromisoformat(value)


class Command(BaseCommand):
    help = (
        "Зарежда съдържанието от стария сайт sisesthetics.com: услуги и цени, екип, контакти и работно време, "
        "статии и страници. Може да се пуска многократно: по подразбиране само добавя липсващото."
    )

    def add_arguments(self, parser):
        parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="Папка с данните.")
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Презаписва и вече съществуващите записи с данните от файловете (промените от админа се губят).",
        )

    @transaction.atomic
    def handle(self, *args, data_dir, overwrite, **options):
        if not (data_dir / "catalog.json").exists():
            raise CommandError(f"Няма данни в {data_dir}.")
        self.data_dir = data_dir
        self.overwrite = overwrite
        self.created = {}
        self.updated = {}

        catalog = json.loads((data_dir / "catalog.json").read_text(encoding="utf-8"))
        specialists = self.load_specialists(catalog)
        self.load_services(catalog, specialists)
        self.load_salon(json.loads((data_dir / "salon.json").read_text(encoding="utf-8")))
        self.load_articles()
        self.load_pages()

        for label in {**self.created, **self.updated}:
            self.stdout.write(f"{label}: нови {self.created.get(label, 0)}, обновени {self.updated.get(label, 0)}")
        self.stdout.write(self.style.SUCCESS("Съдържанието от стария сайт е заредено."))

    def upsert(self, model, lookup, values):
        obj, created = model.objects.get_or_create(**lookup, defaults=values)
        label = str(model._meta.verbose_name_plural)
        if created:
            self.created[label] = self.created.get(label, 0) + 1
        elif self.overwrite:
            for field, value in values.items():
                setattr(obj, field, value)
            obj.save()
            self.updated[label] = self.updated.get(label, 0) + 1
        return obj

    def load_specialists(self, catalog):
        specialists = {}
        for order, row in enumerate(catalog["specialists"]):
            specialist = self.upsert(
                Specialist, {"name": row["name"]}, {"title": row["title"], "bio": row["bio"], "order": order}
            )
            if not specialist.photo and row.get("photo"):
                with (self.data_dir / "photos" / row["photo"]).open("rb") as photo:
                    specialist.photo.save(row["photo"], File(photo), save=True)
            # The weekly schedule from the old booking module; after that it is edited in the admin.
            if self.overwrite:
                specialist.working_hours.all().delete()
            if not specialist.working_hours.exists():
                WorkingHours.objects.bulk_create(
                    WorkingHours(
                        specialist=specialist,
                        weekday=h["weekday"],
                        start_time=parse_time(h["start"]),
                        end_time=parse_time(h["end"]),
                    )
                    for h in row["working_hours"]
                )
            specialists[row["name"]] = specialist
        return specialists

    def load_services(self, catalog, specialists):
        for c_order, cat in enumerate(catalog["categories"]):
            category = self.upsert(ServiceCategory, {"slug": cat["slug"]}, {"name": cat["name"], "order": c_order})
            for g_order, grp in enumerate(cat["groups"]):
                group = self.upsert(
                    ServiceGroup,
                    {"category": category, "name": grp["name"]},
                    {"description": grp["description"], "order": g_order},
                )
                for s_order, row in enumerate(grp["services"]):
                    service = self.upsert(
                        Service,
                        {"group": group, "name": row["name"]},
                        {
                            "description": row["description"],
                            "price": Decimal(row["price"]),
                            "duration_minutes": row["duration_minutes"],
                            "order": s_order,
                        },
                    )
                    for name in row["specialists"]:
                        own_price = row["price_by_specialist"].get(name)
                        self.upsert(
                            SpecialistService,
                            {"specialist": specialists[name], "service": service},
                            {"price_override": Decimal(own_price) if own_price else None},
                        )

    def load_salon(self, data):
        values = {k: data[k] for k in ["name", "legal_name", "phone", "email", "address", "booking_policy"]}
        values.update({k: data[k] for k in ["facebook", "instagram", "tiktok"]})
        salon = SalonInfo.load()
        if salon is None:
            salon = SalonInfo.objects.create(**values)
            self.created["информация за салона"] = 1
        elif self.overwrite:
            SalonInfo.objects.filter(pk=salon.pk).update(**values)
            salon.opening_hours.all().delete()
            self.updated["информация за салона"] = 1
        else:
            return
        OpeningHours.objects.bulk_create(
            OpeningHours(
                salon=salon, weekday=h["weekday"], start_time=parse_time(h["start"]), end_time=parse_time(h["end"])
            )
            for h in data["opening_hours"]
        )

    def load_articles(self):
        for path in sorted((self.data_dir / "articles").glob("*.md")):
            meta, body = read_markdown(path)
            published_at = datetime.fromisoformat(meta["published_at"])
            if timezone.is_naive(published_at):
                published_at = timezone.make_aware(published_at)
            self.upsert(
                Article,
                {"slug": meta["slug"]},
                {
                    "title": meta["title"],
                    "excerpt": meta["excerpt"],
                    "body": body,
                    "cover_image_url": meta["cover_image_url"],
                    "tags": meta["tags"],
                    "published_at": published_at,
                    "source_url": meta["source_url"],
                },
            )

    def load_pages(self):
        for path in sorted((self.data_dir / "pages").glob("*.md")):
            meta, body = read_markdown(path)
            self.upsert(
                Page,
                {"slug": meta["slug"]},
                {"title": meta["title"], "body": body, "source_url": meta["source_url"]},
            )
