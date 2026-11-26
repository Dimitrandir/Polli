"""Salon settings for the team: opening hours and the online booking rules (only an administrator changes them).

Also the days without online booking: every specialist closes their own days, an administrator
closes the whole salon or any specialist.
"""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.staff.models import Specialist, Weekday
from apps.staff.roles import IsSalonAdminOrReadOnly, can_manage_specialist, is_salon_admin

from .blocks import default_message
from .models import DEFAULT_ONLINE_BLOCK_MESSAGE, OnlineBlock, OpeningHours, SalonInfo
from .rules import RULE_FIELDS, booking_rule

DEFAULT_NAME = "SIS Esthetics Hair"


def settings_payload():
    salon = SalonInfo.load()
    return {
        "max_days_ahead": booking_rule("MAX_DAYS_AHEAD"),
        "min_notice_minutes": booking_rule("MIN_NOTICE_MINUTES"),
        "cancellation_hours": booking_rule("CANCELLATION_HOURS"),
        "hide_client_phones": bool(salon and salon.hide_client_phones),
        "online_block_message": default_message(),
        "default_online_block_message": DEFAULT_ONLINE_BLOCK_MESSAGE,
        "defaults": {field: settings.BOOKING[key] for key, field in RULE_FIELDS.items()},
        "opening_hours": [
            {"weekday": h.weekday, "start": f"{h.start_time:%H:%M}", "end": f"{h.end_time:%H:%M}"}
            for h in (salon.opening_hours.all() if salon else [])
        ],
    }


class HoursSerializer(serializers.Serializer):
    weekday = serializers.ChoiceField(choices=Weekday.choices)
    start = serializers.TimeField()
    end = serializers.TimeField()

    def validate(self, data):
        if data["end"] <= data["start"]:
            raise serializers.ValidationError(f"{Weekday(data['weekday']).label.capitalize()}: краят е преди началото.")
        return data


class SettingsSerializer(serializers.Serializer):
    max_days_ahead = serializers.IntegerField(min_value=1, max_value=365, required=False)
    min_notice_minutes = serializers.IntegerField(min_value=0, max_value=7 * 24 * 60, required=False)
    cancellation_hours = serializers.IntegerField(min_value=0, max_value=14 * 24, required=False)
    hide_client_phones = serializers.BooleanField(required=False)
    online_block_message = serializers.CharField(max_length=255, required=False, allow_blank=True)
    opening_hours = HoursSerializer(many=True, required=False)


class SalonSettingsView(APIView):
    permission_classes = [IsSalonAdminOrReadOnly]

    def get(self, request):
        return Response(settings_payload())

    def patch(self, request):
        data = SettingsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        with transaction.atomic():
            salon = SalonInfo.objects.order_by("pk").first() or SalonInfo.objects.create(name=DEFAULT_NAME)
            for field in RULE_FIELDS.values():
                if field in v:
                    setattr(salon, field, v[field])
            if "hide_client_phones" in v:
                salon.hide_client_phones = v["hide_client_phones"]
            if "online_block_message" in v:
                text = v["online_block_message"].strip()
                salon.online_block_message = "" if text == DEFAULT_ONLINE_BLOCK_MESSAGE else text
            salon.save()
            if "opening_hours" in v:
                salon.opening_hours.all().delete()
                OpeningHours.objects.bulk_create(
                    OpeningHours(salon=salon, weekday=h["weekday"], start_time=h["start"], end_time=h["end"])
                    for h in v["opening_hours"]
                )
        return Response(settings_payload())


# --- days without online booking ---------------------------------------------------------------

MAX_BLOCK_DAYS = 366


class IsSalonStaff(permissions.BasePermission):
    message = "Нужен е вход като служител на салона."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_staff)


def block_payload(block):
    return {"id": block.pk, "date": block.date.isoformat(), "specialist": block.specialist_id, "message": block.message}


def _date(value, fallback):
    try:
        return serializers.DateField().to_internal_value(value) if value else fallback
    except serializers.ValidationError:
        return fallback


class OnlineBlockChangeSerializer(serializers.Serializer):
    dates = serializers.ListField(child=serializers.DateField(), allow_empty=False, max_length=MAX_BLOCK_DAYS)
    specialist = serializers.PrimaryKeyRelatedField(
        queryset=Specialist.objects.all(), allow_null=True, required=False, default=None
    )
    blocked = serializers.BooleanField()
    message = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class OnlineBlocksView(APIView):
    """GET: the closed days between `from` and `to` (default: today and the next year).

    POST: close (blocked=true) or open again (blocked=false) the given dates for the whole salon
    (specialist=null, administrators only) or for one specialist. Closing a closed day again
    updates its text.
    """

    permission_classes = [IsSalonStaff]

    def get(self, request):
        today = timezone.localdate()
        first = _date(request.query_params.get("from"), today)
        last = _date(request.query_params.get("to"), first + timedelta(days=MAX_BLOCK_DAYS))
        last = min(max(last, first), first + timedelta(days=2 * MAX_BLOCK_DAYS))
        user = request.user
        specialists = list(Specialist.objects.filter(is_active=True))
        return Response(
            {
                "from": first.isoformat(),
                "to": last.isoformat(),
                "default_message": default_message(),
                "can_block_salon": is_salon_admin(user),
                "specialists": [
                    {"id": s.pk, "name": s.name, "can_manage": can_manage_specialist(user, s.pk)} for s in specialists
                ],
                "blocks": [block_payload(b) for b in OnlineBlock.objects.filter(date__gte=first, date__lte=last)],
            }
        )

    def post(self, request):
        data = OnlineBlockChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        specialist = v["specialist"]
        user = request.user
        if specialist is None and not is_salon_admin(user):
            return Response(
                {"detail": "Само администратор може да спре онлайн записването за целия салон."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if specialist is not None and not can_manage_specialist(user, specialist.pk):
            return Response(
                {"detail": "Можете да спирате онлайн записването само за себе си."}, status=status.HTTP_403_FORBIDDEN
            )
        dates = sorted(set(v["dates"]))
        existing = OnlineBlock.objects.filter(date__in=dates, specialist=specialist)
        message = v["message"].strip()
        with transaction.atomic():
            if not v["blocked"]:
                existing.delete()
            else:
                have = {b.date: b for b in existing.order_by().select_for_update()}
                changed = [b for b in have.values() if b.message != message]
                for b in changed:
                    b.message = message
                OnlineBlock.objects.bulk_update(changed, ["message"])
                OnlineBlock.objects.bulk_create(
                    OnlineBlock(date=d, specialist=specialist, message=message, created_by=user)
                    for d in dates
                    if d not in have
                )
        blocks = OnlineBlock.objects.filter(date__in=dates, specialist=specialist)
        return Response({"blocks": [block_payload(b) for b in blocks]})
