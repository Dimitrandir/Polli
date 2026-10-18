"""A booking's history for the team: who booked it, moved it, changed or cancelled it, and when."""

from django.utils import timezone

from apps.staff.roles import staff_name

from .models import BookingEvent, BookingSource

ONLINE_CLIENT = "клиентът онлайн"
WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "нд"]


def when(dt):
    """ "вт 20.10, 10:00" in salon time."""
    local = timezone.localtime(dt)
    return f"{WEEKDAYS[local.weekday()]} {local:%d.%m}, {local:%H:%M}"


def record(booking, text, *, user=None, who=None):
    staff = user if user is not None and user.is_authenticated else None
    return BookingEvent.objects.create(
        booking=booking, user=staff, who=(who or staff_name(staff) or ONLINE_CLIENT)[:150], text=text[:255]
    )


def history(booking):
    """The events, oldest first. Bookings made before the history existed get a "booked" line."""
    events = [{"at": e.at, "who": e.who, "text": e.text} for e in booking.events.all()]
    if events:
        return events
    if booking.created_by_id:
        who = staff_name(booking.created_by)
    else:
        who = ONLINE_CLIENT if booking.source == BookingSource.ONLINE else "салонът"
    return [{"at": booking.created_at, "who": who, "text": "Записа часа"}]
