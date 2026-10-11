from datetime import datetime

from django.utils import timezone

from .models import ScheduleOverride, WorkingHours


def aware(day, t, tz=None):
    return timezone.make_aware(datetime.combine(day, t), tz or timezone.get_current_timezone())


def working_intervals(specialist_ids, day, tz=None):
    """Working intervals per specialist for a date: date overrides win over the weekly schedule."""
    result = {sid: [] for sid in specialist_ids}
    overridden = set()
    for o in ScheduleOverride.objects.filter(specialist_id__in=specialist_ids, date=day):
        overridden.add(o.specialist_id)
        result[o.specialist_id].append((aware(day, o.start_time, tz), aware(day, o.end_time, tz)))
    weekly = WorkingHours.objects.filter(specialist_id__in=specialist_ids, weekday=day.weekday()).exclude(
        specialist_id__in=overridden
    )
    for wh in weekly:
        result[wh.specialist_id].append((aware(day, wh.start_time, tz), aware(day, wh.end_time, tz)))
    return {sid: sorted(intervals) for sid, intervals in result.items()}
