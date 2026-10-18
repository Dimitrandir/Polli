"""Online booking rules: what the salon set from the team's settings page, else the server defaults."""

from django.conf import settings

# settings.BOOKING key -> SalonInfo field
RULE_FIELDS = {
    "MAX_DAYS_AHEAD": "max_days_ahead",
    "MIN_NOTICE_MINUTES": "min_notice_minutes",
    "CANCELLATION_HOURS": "cancellation_hours",
}


def booking_rule(name):
    field = RULE_FIELDS.get(name)
    if field:
        from .models import SalonInfo

        value = SalonInfo.objects.order_by("pk").values_list(field, flat=True).first()
        if value is not None:
            return value
    return settings.BOOKING[name]
