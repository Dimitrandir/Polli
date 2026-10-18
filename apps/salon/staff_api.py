"""Salon settings for the team: opening hours and the online booking rules (only an administrator changes them)."""

from django.conf import settings
from django.db import transaction
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.staff.models import Weekday
from apps.staff.roles import IsSalonAdminOrReadOnly

from .models import OpeningHours, SalonInfo
from .rules import RULE_FIELDS, booking_rule

DEFAULT_NAME = "SIS Esthetics Hair"


def settings_payload():
    salon = SalonInfo.load()
    return {
        "max_days_ahead": booking_rule("MAX_DAYS_AHEAD"),
        "min_notice_minutes": booking_rule("MIN_NOTICE_MINUTES"),
        "cancellation_hours": booking_rule("CANCELLATION_HOURS"),
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
            salon.save()
            if "opening_hours" in v:
                salon.opening_hours.all().delete()
                OpeningHours.objects.bulk_create(
                    OpeningHours(salon=salon, weekday=h["weekday"], start_time=h["start"], end_time=h["end"])
                    for h in v["opening_hours"]
                )
        return Response(settings_payload())
