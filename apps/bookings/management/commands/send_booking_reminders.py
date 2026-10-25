from django.core.management.base import BaseCommand

from apps.bookings.emails import send_due_reminders


class Command(BaseCommand):
    help = (
        "Изпраща имейл напомняне за часовете, които започват в следващите BOOKING_REMINDER_HOURS часа "
        "(по подразбиране 24). Всеки час получава едно напомняне. Пуска се на всеки 10 минути."
    )

    def handle(self, *args, **options):
        self.stdout.write(f"Изпратени напомняния: {send_due_reminders()}")
