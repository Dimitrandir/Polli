from django.http import Http404
from rest_framework import generics, serializers

from .models import OpeningHours, SalonInfo


class OpeningHoursSerializer(serializers.ModelSerializer):
    start_time = serializers.TimeField(format="%H:%M")
    end_time = serializers.TimeField(format="%H:%M")

    class Meta:
        model = OpeningHours
        fields = ["weekday", "start_time", "end_time"]


class SalonInfoSerializer(serializers.ModelSerializer):
    opening_hours = OpeningHoursSerializer(many=True)

    class Meta:
        model = SalonInfo
        fields = [
            "name",
            "legal_name",
            "phone",
            "email",
            "address",
            "facebook",
            "instagram",
            "tiktok",
            "booking_policy",
            "opening_hours",
        ]


class SalonInfoView(generics.RetrieveAPIView):
    """Contacts, social links, opening hours (weekday 0 = Monday) and booking policy."""

    serializer_class = SalonInfoSerializer

    def get_object(self):
        salon = SalonInfo.load()
        if salon is None:
            raise Http404
        return salon
