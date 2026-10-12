"""API for the salon team: login and the daily calendar (the staff side of the booking system).

Everyone with "staff status" in the admin can use it. All specialists see the whole salon's day,
like in Studio24.
"""

from datetime import date, time, timedelta

from django.contrib.auth import authenticate, login, logout
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.catalog.api import active_services
from apps.catalog.models import Service
from apps.clients.models import Client
from apps.clients.phone import normalize_phone
from apps.staff.models import Specialist, SpecialistService, TimeOff
from apps.staff.schedule import aware, working_intervals

from .availability import BookingError, ItemRequest
from .models import Booking, BookingSource, BookingStatus, CancelledBy
from .services import cancel_booking, create_booking

CLIENT_SEARCH_LIMIT = 20


class IsSalonStaff(permissions.BasePermission):
    message = "Нужен е вход като служител на салона."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_staff)


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _user_payload(user):
    if not (user.is_authenticated and user.is_staff):
        return {"authenticated": False, "user": None}
    specialist = Specialist.objects.filter(user=user).first()
    return {
        "authenticated": True,
        "user": {
            "username": user.get_username(),
            "name": (specialist.name if specialist else user.get_full_name()) or user.get_username(),
            "specialist": specialist.pk if specialist else None,
        },
    }


# --- serializers ---------------------------------------------------------------


class StaffClientSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="full_name")

    class Meta:
        model = Client
        fields = ["id", "name", "first_name", "last_name", "nickname", "phone", "email", "notes", "is_blocked"]


class StaffItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    service = serializers.IntegerField(source="service_id")
    service_name = serializers.CharField(source="service.name")
    specialist = serializers.IntegerField(source="specialist_id")
    start = serializers.DateTimeField(source="start_at")
    end = serializers.DateTimeField(source="end_at")
    price = serializers.DecimalField(max_digits=8, decimal_places=2)


class StaffBookingSerializer(serializers.ModelSerializer):
    start = serializers.DateTimeField(source="start_at")
    end = serializers.DateTimeField(source="end_at")
    client = StaffClientSerializer()
    items = StaffItemSerializer(many=True)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        model = Booking
        fields = [
            "id",
            "status",
            "source",
            "start",
            "end",
            "note",
            "internal_note",
            "client",
            "items",
            "total_price",
            "created_at",
        ]


def _interval(start, end):
    return {"start": timezone.localtime(start).isoformat(), "end": timezone.localtime(end).isoformat()}


def _bookings():
    return Booking.objects.select_related("client").prefetch_related("items__service")


# --- session -------------------------------------------------------------------


@method_decorator(ensure_csrf_cookie, name="dispatch")
class StaffSessionView(APIView):
    """Who is logged in. Also sets the CSRF cookie the login form needs."""

    def get(self, request):
        return Response(_user_payload(request.user))


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class StaffLoginView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "staff_login"

    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = authenticate(request, **data.validated_data)
        if user is None or not user.is_staff:
            return _error("Грешно потребителско име или парола.")
        login(request, user)
        return Response(_user_payload(user))


class StaffLogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({"authenticated": False, "user": None})


# --- calendar --------------------------------------------------------------------


class StaffDayView(APIView):
    """Everything the day calendar needs: a column per specialist with hours, time off and bookings."""

    permission_classes = [IsSalonStaff]

    def get(self, request):
        try:
            day = date.fromisoformat(request.query_params.get("date", ""))
        except ValueError:
            day = timezone.localdate()
        day_start = aware(day, time.min)
        day_end = day_start + timedelta(days=1)

        specialists = list(Specialist.objects.filter(is_active=True))
        ids = [s.pk for s in specialists]
        hours = working_intervals(ids, day)
        time_off = TimeOff.objects.filter(specialist_id__in=ids, start__lt=day_end, end__gt=day_start)
        bookings = (
            _bookings()
            .filter(items__specialist_id__in=ids, items__start_at__lt=day_end, items__end_at__gt=day_start)
            .exclude(status=BookingStatus.CANCELLED)
            .distinct()
            .order_by("start_at")
        )
        return Response(
            {
                "date": day.isoformat(),
                "timezone": str(timezone.get_current_timezone()),
                "specialists": [
                    {
                        "id": s.pk,
                        "name": s.name,
                        "color": s.color,
                        "is_online_bookable": s.is_online_bookable,
                        "working": [_interval(a, b) for a, b in hours[s.pk]],
                        "time_off": [
                            {**_interval(max(t.start, day_start), min(t.end, day_end)), "reason": t.reason}
                            for t in time_off
                            if t.specialist_id == s.pk
                        ],
                    }
                    for s in specialists
                ],
                "bookings": StaffBookingSerializer(bookings, many=True).data,
            }
        )


class StaffServicesView(APIView):
    """All active services (also the ones not offered online) with the specialists who do them."""

    permission_classes = [IsSalonStaff]

    def get(self, request):
        offers = (
            SpecialistService.objects.filter(specialist__is_active=True, service__in=active_services())
            .select_related("service__group")
            .order_by("service__group__category__order", "service__group__order", "service__order", "service__name")
        )
        services = {}
        for offer in offers:
            service = offer.service
            entry = services.setdefault(
                service.pk,
                {"id": service.pk, "name": service.name, "group": service.group.name, "specialists": []},
            )
            entry["specialists"].append(
                {"id": offer.specialist_id, "price": f"{offer.price:.2f}", "duration_minutes": offer.duration_minutes}
            )
        return Response(list(services.values()))


class StaffClientSearchView(APIView):
    """Find a client by name, nickname, phone or email (for a new booking).

    The nickname is what the team calls the client ("Митко" finds Петър Стайков).
    """

    permission_classes = [IsSalonStaff]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response([])
        condition = Q(email__icontains=query) | Q(nickname__icontains=query)
        for word in query.split():
            condition |= Q(first_name__icontains=word) | Q(last_name__icontains=word) | Q(nickname__icontains=word)
        digits = "".join(ch for ch in query if ch.isdigit())
        if len(digits) >= 3:
            # Phones are stored as +359888123456; "0888 12" should match too.
            condition |= Q(phone__contains=digits.lstrip("0") or digits)
        clients = Client.objects.filter(condition).order_by("first_name", "last_name")[:CLIENT_SEARCH_LIMIT]
        return Response(StaffClientSerializer(clients, many=True).data)


class NewClientSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32)
    email = serializers.EmailField(required=False, allow_blank=True, default="")


class StaffBookingCreateSerializer(serializers.Serializer):
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.all(), required=False, allow_null=True)
    new_client = NewClientSerializer(required=False, allow_null=True)
    specialist = serializers.PrimaryKeyRelatedField(queryset=Specialist.objects.filter(is_active=True))
    services = serializers.PrimaryKeyRelatedField(queryset=Service.objects.all(), many=True, allow_empty=False)
    start = serializers.DateTimeField()
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=1000)
    internal_note = serializers.CharField(required=False, allow_blank=True, default="", max_length=1000)

    def validate(self, data):
        if not data.get("client") and not data.get("new_client"):
            raise serializers.ValidationError("Изберете клиент или въведете нов.")
        return data


def _client_for(data):
    if data.get("client"):
        return data["client"]
    new = data["new_client"]
    phone = normalize_phone(new["phone"])
    if not phone:
        raise BookingError("Моля, въведете телефон.")
    client = Client.objects.filter(phone=phone).first()
    if client is None:
        client = Client.objects.create(
            first_name=new["first_name"], last_name=new["last_name"], phone=phone, email=new["email"]
        )
    elif not client.email and new["email"]:
        client.email = new["email"]
        client.save(update_fields=["email"])
    return client


class StaffBookingCreateView(APIView):
    """A booking made by the salon: the services follow each other at one specialist."""

    permission_classes = [IsSalonStaff]

    def post(self, request):
        data = StaffBookingCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        try:
            client = _client_for(v)
            booking = create_booking(
                client=client,
                requests=[ItemRequest(service=s, specialist=v["specialist"]) for s in v["services"]],
                start=v["start"],
                note=v["note"],
                source=BookingSource.SALON,
                for_staff=True,
            )
        except BookingError as exc:
            return _error(str(exc))
        if v["internal_note"]:
            booking.internal_note = v["internal_note"]
            booking.save(update_fields=["internal_note", "updated_at"])
        booking = _bookings().get(pk=booking.pk)
        return Response(StaffBookingSerializer(booking).data, status=status.HTTP_201_CREATED)


class StaffBookingUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW], required=False
    )
    internal_note = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class StaffBookingDetailView(APIView):
    """Open a booking, mark it done / no-show, or edit the internal note."""

    permission_classes = [IsSalonStaff]

    def get(self, request, pk):
        return Response(StaffBookingSerializer(get_object_or_404(_bookings(), pk=pk)).data)

    def patch(self, request, pk):
        booking = get_object_or_404(_bookings(), pk=pk)
        data = StaffBookingUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if "status" in v and booking.status == BookingStatus.CANCELLED:
            return _error("Резервацията е отказана.")
        for field in ("status", "internal_note"):
            if field in v:
                setattr(booking, field, v[field])
        booking.save()
        return Response(StaffBookingSerializer(booking).data)


class StaffCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)


class StaffBookingCancelView(APIView):
    permission_classes = [IsSalonStaff]

    def post(self, request, pk):
        booking = get_object_or_404(_bookings(), pk=pk)
        data = StaffCancelSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            cancel_booking(booking, by=CancelledBy.SALON, reason=data.validated_data["reason"] or "Отказана от салона")
        except BookingError as exc:
            return _error(str(exc))
        return Response(StaffBookingSerializer(booking).data)
