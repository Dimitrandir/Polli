from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.catalog.models import Service
from apps.staff.models import Specialist

from .availability import AvailabilityEngine, BookingError, ItemRequest
from .models import Booking, CancelledBy
from .services import can_client_cancel, cancel_booking, create_booking, resolve_client


def booking_error_response(exc):
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


# --- serializers ---------------------------------------------------------------


class ItemRequestSerializer(serializers.Serializer):
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.all())
    specialist = serializers.PrimaryKeyRelatedField(
        queryset=Specialist.objects.all(), required=False, allow_null=True, default=None
    )


class _ItemsMixin(serializers.Serializer):
    items = ItemRequestSerializer(many=True, allow_empty=False)
    parallel = serializers.BooleanField(
        default=False, help_text="true = услугите се изпълняват едновременно от различни специалисти."
    )

    def item_requests(self):
        return [ItemRequest(service=i["service"], specialist=i["specialist"]) for i in self.validated_data["items"]]


class AvailabilityRequestSerializer(_ItemsMixin):
    date = serializers.DateField()
    days = serializers.IntegerField(default=1, min_value=1, max_value=settings.BOOKING["MAX_AVAILABILITY_DAYS"])


class PlannedItemSerializer(serializers.Serializer):
    service = serializers.IntegerField(source="service.pk")
    service_name = serializers.CharField(source="service.name")
    specialist = serializers.IntegerField(source="specialist.pk")
    specialist_name = serializers.CharField(source="specialist.name")
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()
    price = serializers.DecimalField(max_digits=8, decimal_places=2)


class SlotSerializer(serializers.Serializer):
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    items = PlannedItemSerializer(many=True)


class ClientInputSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32)
    email = serializers.EmailField(required=False, allow_blank=True, default="")


class BookingCreateSerializer(_ItemsMixin):
    start = serializers.DateTimeField()
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=1000)
    client = ClientInputSerializer()
    consent = serializers.BooleanField()

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("Необходимо е съгласие с политиката за поверителност.")
        return value


class BookingItemSerializer(serializers.Serializer):
    service = serializers.IntegerField(source="service_id")
    service_name = serializers.CharField(source="service.name")
    specialist = serializers.IntegerField(source="specialist_id")
    specialist_name = serializers.CharField(source="specialist.name")
    start = serializers.DateTimeField(source="start_at")
    end = serializers.DateTimeField(source="end_at")
    price = serializers.DecimalField(max_digits=8, decimal_places=2)


class BookingSerializer(serializers.ModelSerializer):
    start = serializers.DateTimeField(source="start_at")
    end = serializers.DateTimeField(source="end_at")
    items = BookingItemSerializer(many=True)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = ["id", "status", "start", "end", "note", "items", "total_price", "can_cancel", "created_at"]

    def get_can_cancel(self, booking):
        return can_client_cancel(booking)


class BookingWithTokenSerializer(BookingSerializer):
    class Meta(BookingSerializer.Meta):
        fields = BookingSerializer.Meta.fields + ["cancel_token"]


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)


def _booking_queryset():
    return Booking.objects.select_related("client").prefetch_related("items__service", "items__specialist")


# --- views -----------------------------------------------------------------------


class AvailabilityView(APIView):
    """Free start times for a set of services, for one day or a week."""

    # Public and read-only: ignore any admin session so no CSRF token is needed.
    authentication_classes = []

    def post(self, request):
        data = AvailabilityRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            engine = AvailabilityEngine(data.item_requests(), parallel=data.validated_data["parallel"])
        except BookingError as exc:
            return booking_error_response(exc)
        days = engine.slots(data.validated_data["date"], data.validated_data["days"])
        return Response(
            {
                "timezone": str(timezone.get_current_timezone()),
                "days": [{"date": day, "slots": SlotSerializer(slots, many=True).data} for day, slots in days.items()],
            }
        )


class BookingCreateView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "bookings"

    def post(self, request):
        data = BookingCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        try:
            client = resolve_client(**v["client"], user=request.user, consent=v["consent"])
            booking = create_booking(
                client=client,
                requests=data.item_requests(),
                start=v["start"],
                parallel=v["parallel"],
                note=v["note"],
            )
        except BookingError as exc:
            return booking_error_response(exc)
        booking = _booking_queryset().get(pk=booking.pk)
        return Response(BookingWithTokenSerializer(booking).data, status=status.HTTP_201_CREATED)


class BookingByTokenView(generics.RetrieveAPIView):
    """A booking opened from the link in the confirmation email (no login needed)."""

    authentication_classes = []  # the secret token is the authorisation

    serializer_class = BookingWithTokenSerializer
    lookup_field = "cancel_token"
    lookup_url_kwarg = "token"

    def get_queryset(self):
        return _booking_queryset()


class BookingCancelView(APIView):
    authentication_classes = []  # the secret token is the authorisation

    def post(self, request, token):
        booking = get_object_or_404(_booking_queryset(), cancel_token=token)
        data = CancelSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            cancel_booking(booking, by=CancelledBy.CLIENT, reason=data.validated_data["reason"])
        except BookingError as exc:
            return booking_error_response(exc)
        return Response(BookingWithTokenSerializer(booking).data)


class MyBookingsView(generics.ListAPIView):
    """Visit history of the logged-in client."""

    serializer_class = BookingWithTokenSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return _booking_queryset().filter(client__user=self.request.user).order_by("-start_at")
