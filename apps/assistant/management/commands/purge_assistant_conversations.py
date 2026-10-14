from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.assistant.models import Conversation


class Command(BaseCommand):
    help = "Изтрива разговорите с асистента, по-стари от ASSISTANT_RETENTION_DAYS дни (по подразбиране 90)."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=settings.ASSISTANT["RETENTION_DAYS"])

    def handle(self, *args, days, **options):
        cutoff = timezone.now() - timedelta(days=days)
        deleted, _ = Conversation.objects.filter(updated_at__lt=cutoff).delete()
        self.stdout.write(f"Изтрити записи: {deleted}")
