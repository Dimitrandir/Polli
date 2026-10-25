"""Booking use cases shared by the API and the admin."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.clients.models import Client
from apps.clients.phone import normalize_phone
from apps.clients.services import client_for
from apps.salon.rules import booking_rule
from apps.staff.models import Resource, Specialist

from . import emails
from .availability import AvailabilityEngine, BookingError
from .history import record
from .models import Booking, BookingItem, BookingSource, BookingStatus, CancelledBy

BLOCKED_MESSAGE = "В момента не можем да приемем онлайн резервация. Моля, свържете се със салона по телефона."


def resolve_client(*, first_name, last_name="", phone, email="", user=None, consent=False):
    """Find or create the client that makes an online booking and make sure they may book."""
    phone = normalize_phone(phone)
    email = (email or "").strip().lower()
    if not phone:
        raise BookingError("Моля, въведете телефон.")

    # Staff who book from the public site in their own browser book for someone else.
    account = user if user is not None and user.is_authenticated and not user.is_staff else None

    client = client_for(account) if account is not None else None
    if client is None:
        client = Client.objects.filter(phone=phone).first()

    if client is None:
        client = Client(first_name=first_name, last_name=last_name, phone=phone, email=email, user=account)
    else:
        # Never change the salon's record from a public form: a typed phone number proves nothing,
        # and the email on a record is what links it to an account at login. An account takes over
        # an existing record only when its verified email matches; otherwise the booking still goes
        # to that record, but the account does not get to see its history.
        if (
            account is not None
            and client.user_id is None
            and account.email
            and client.email == account.email.strip().lower()
        ):
            client.user = account

    if client.is_blocked or (email and Client.objects.filter(email=email, is_blocked=True).exists()):
        raise BookingError(BLOCKED_MESSAGE)

    if consent and client.privacy_consent_at is None:
        client.give_privacy_consent()
    client.save()
    return client


def create_booking(
    *,
    client,
    requests,
    start,
    parallel=False,
    note="",
    source=BookingSource.ONLINE,
    for_staff=False,
    now=None,
    by=None,
    who=None,
):
    """Book the visit. `by` is the team member who booked it (None = the client online)."""
    if client.is_blocked and not for_staff:
        raise BookingError(BLOCKED_MESSAGE)

    engine = AvailabilityEngine(requests, parallel=parallel, for_staff=for_staff, now=now)
    with transaction.atomic():
        # Serialise concurrent bookings for the same specialists/resources, then re-check.
        list(Specialist.objects.select_for_update().filter(id__in=engine.specialist_ids).order_by("id"))
        list(Resource.objects.select_for_update().filter(id__in=engine.resource_ids).order_by("id"))
        slot = engine.plan_at(start)
        if slot is None:
            raise BookingError("Избраният час вече не е свободен. Моля, изберете друг.")
        staff = by if by is not None and by.is_authenticated and by.is_staff else None
        booking = Booking.objects.create(
            client=client, start_at=slot.start, end_at=slot.end, note=note, source=source, created_by=staff
        )
        BookingItem.objects.bulk_create(
            BookingItem(
                booking=booking,
                service=item.service,
                specialist=item.specialist,
                start_at=item.start,
                end_at=item.end,
                busy_until=item.busy_until,
                price=item.price,
                duration_minutes=item.duration_minutes,
            )
            for item in slot.items
        )
        record(booking, "Записа часа", user=staff, who=who)
        emails.booking_created(booking, now)
    return booking


def can_client_cancel(booking, now=None):
    now = now or timezone.now()
    deadline = booking.start_at - timedelta(hours=booking_rule("CANCELLATION_HOURS"))
    return booking.status == BookingStatus.CONFIRMED and now <= deadline


def cancel_booking(booking, *, by=CancelledBy.CLIENT, reason="", now=None, user=None):
    now = now or timezone.now()
    if booking.status != BookingStatus.CONFIRMED:
        raise BookingError("Резервацията вече не е активна.")
    if by == CancelledBy.CLIENT and not can_client_cancel(booking, now):
        hours = booking_rule("CANCELLATION_HOURS")
        raise BookingError(
            f"Онлайн отказ е възможен до {hours} часа преди началото. Моля, свържете се със салона по телефона."
        )
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = now
    booking.cancelled_by = by
    booking.cancellation_reason = reason
    booking.save(update_fields=["status", "cancelled_at", "cancelled_by", "cancellation_reason", "updated_at"])
    who = None if user is not None else ("клиентът" if by == CancelledBy.CLIENT else "салонът")
    record(booking, f"Отказа часа: {reason}" if reason else "Отказа часа", user=user, who=who)
    emails.booking_cancelled(booking)
    return booking
