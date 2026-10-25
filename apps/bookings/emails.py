"""Emails to the client about a visit: confirmation, reminder, a moved time and a cancellation.

Each one goes only to clients with an email and only after the change is saved. A failed send never
undoes the booking: the client still sees everything in their profile.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from apps.salon.models import SalonInfo
from apps.salon.rules import booking_rule

from .history import WEEKDAYS
from .models import Booking, BookingStatus, CancelledBy

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ["понеделник", "вторник", "сряда", "четвъртък", "петък", "събота", "неделя"]
DEFAULT_SALON_REASON = "Отказана от салона"


def reminder_hours():
    return settings.BOOKING["REMINDER_HOURS"]


def _when(dt):
    """ "вторник, 20.10.2026 от 10:00" in salon time."""
    local = timezone.localtime(dt)
    return f"{WEEKDAY_NAMES[local.weekday()]}, {local:%d.%m.%Y} от {local:%H:%M}"


def _short_when(dt):
    local = timezone.localtime(dt)
    return f"{WEEKDAYS[local.weekday()]} {local:%d.%m} в {local:%H:%M}"


def _details(booking):
    lines = [f"Кога: {_when(booking.start_at)}"]
    for item in booking.items.select_related("service", "specialist"):
        start = timezone.localtime(item.start_at)
        lines.append(f"• {item.service.display_name} – {item.specialist.name}, {start:%H:%M}")
    lines.append(f"Обща сума: {booking.total_price:.2f} €")
    return "\n".join(lines)


def _signature():
    salon = SalonInfo.load()
    if salon is None:
        return "SIS Esthetics Hair"
    lines = [salon.name, salon.address, f"тел. {salon.phone}"]
    return "\n".join(line for line in lines if line.strip())


def _salon_phone():
    salon = SalonInfo.load()
    return salon.phone if salon else ""


def _manage_url(booking):
    return f"{settings.FRONTEND_URL}/rezervacia/{booking.cancel_token}"


def _send(booking, subject, body, *, fail_silently=True):
    if not booking.client.email:
        return False
    try:
        send_mail(
            subject=subject,
            message=f"Здравейте, {booking.client.first_name}!\n\n{body}\n\n{_signature()}",
            from_email=None,
            recipient_list=[booking.client.email],
        )
    except Exception:
        if not fail_silently:
            raise
        logger.exception("Could not email booking %s", booking.pk)
        return False
    return True


def _skip_reminder_if_soon(booking, now=None):
    """The client has just got the details, so a reminder for a visit inside the reminder window would repeat them."""
    now = now or timezone.now()
    soon = booking.start_at <= now + timedelta(hours=reminder_hours())
    booking.reminder_sent_at = now if soon else None
    Booking.objects.filter(pk=booking.pk).update(reminder_sent_at=booking.reminder_sent_at)


# --- what happened to the visit ------------------------------------------------


def send_confirmation(booking):
    hours = booking_rule("CANCELLATION_HOURS")
    body = (
        f"Вашият час в SIS Esthetics е записан.\n\n{_details(booking)}\n\n"
        f"Вижте или откажете часа: {_manage_url(booking)}\n"
        f"Онлайн отказ е възможен до {hours} часа преди началото. След това, моля, обадете се на салона."
    )
    _send(booking, f"Записан час: {_short_when(booking.start_at)}", body)


def send_moved(booking, old_start):
    body = (
        f"Вашият час беше преместен от {_when(old_start)}.\n\nНовият час:\n{_details(booking)}\n\n"
        f"Ако новият час не ви е удобен, моля, обадете се на салона. Детайли: {_manage_url(booking)}"
    )
    _send(booking, f"Преместен час: {_short_when(booking.start_at)}", body)


def send_cancellation(booking):
    if booking.cancelled_by == CancelledBy.SALON:
        reason = booking.cancellation_reason
        why = f"\nПричина: {reason}" if reason and reason != DEFAULT_SALON_REASON else ""
        body = (
            f"За съжаление салонът отмени вашия час.{why}\n\n{_details(booking)}\n\n"
            f"Изберете нов час: {settings.FRONTEND_URL}/rezervacia"
        )
    else:
        body = f"Вашият час е отказан.\n\n{_details(booking)}\n\nЗа нов час: {settings.FRONTEND_URL}/rezervacia"
    _send(booking, f"Отказан час: {_short_when(booking.start_at)}", body)


def send_reminder(booking):
    phone = _salon_phone()
    call = f" на {phone}" if phone else ""
    body = (
        f"Напомняме ви за часа в SIS Esthetics.\n\n{_details(booking)}\n\n"
        f"Ако не можете да дойдете, моля, обадете се{call}. Детайли: {_manage_url(booking)}"
    )
    return _send(booking, f"Напомняне: {_short_when(booking.start_at)}", body, fail_silently=False)


# --- hooks used by the booking services and views ------------------------------


def booking_created(booking, now=None):
    def send():
        _skip_reminder_if_soon(booking, now)
        send_confirmation(booking)

    transaction.on_commit(send)


def booking_moved(booking, old_start):
    if booking.start_at == old_start:
        return

    def send():
        _skip_reminder_if_soon(booking)
        send_moved(booking, old_start)

    transaction.on_commit(send)


def booking_cancelled(booking):
    transaction.on_commit(lambda: send_cancellation(booking))


def due_reminders(now=None):
    """Confirmed visits that start within the reminder window and have had no reminder yet."""
    from apps.clients.models import ReminderChannel

    now = now or timezone.now()
    return (
        Booking.objects.filter(
            status=BookingStatus.CONFIRMED,
            reminder_sent_at__isnull=True,
            start_at__gt=now,
            start_at__lte=now + timedelta(hours=reminder_hours()),
            client__reminder_channel=ReminderChannel.EMAIL,
        )
        .exclude(client__email="")
        .select_related("client")
        .order_by("start_at")
    )


def send_due_reminders(now=None):
    """Send each due reminder once. A failed send is tried again on the next run. Returns how many went out."""
    now = now or timezone.now()
    sent = 0
    for booking in due_reminders(now):
        # Claim the booking first, so two runs at the same time never send it twice.
        if not Booking.objects.filter(pk=booking.pk, reminder_sent_at__isnull=True).update(reminder_sent_at=now):
            continue
        try:
            send_reminder(booking)
        except Exception:
            logger.exception("Could not send the reminder for booking %s", booking.pk)
            Booking.objects.filter(pk=booking.pk).update(reminder_sent_at=None)
            continue
        sent += 1
    return sent
