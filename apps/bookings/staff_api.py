"""API for the salon team: login and the daily calendar (the staff side of the booking system).

Everyone with "staff status" in the admin can use it. All specialists see the whole salon's day,
like in Studio24, and anyone may book a client with any colleague. Changing a booking is for an
administrator, the specialists in it and whoever booked it; blocking time is for an administrator
and the specialist themselves (see apps.staff.roles).
"""

from datetime import date, time, timedelta

from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from django.db.models import Max, Q
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
from apps.staff.roles import can_manage_specialist, is_salon_admin
from apps.staff.schedule import aware, working_intervals

from . import emails
from .availability import BookingError, ItemRequest
from .history import history, record, when
from .models import OCCUPYING_STATUSES, Booking, BookingItem, BookingSource, BookingStatus, CancelledBy
from .services import cancel_booking, create_booking

CLIENT_SEARCH_LIMIT = 20
RECENT_CLIENTS = 30


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
            "is_admin": is_salon_admin(user),
        },
    }


def can_manage_booking(user, booking):
    """An administrator, the specialists doing the visit and whoever booked it."""
    if is_salon_admin(user) or (booking.created_by_id and booking.created_by_id == user.pk):
        return True
    return any(can_manage_specialist(user, item.specialist_id) for item in booking.items.all())


NOT_YOURS = "Можете да променяте само своите часове. Помолете администратор или колегата."


# --- serializers ---------------------------------------------------------------


class StaffClientSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="full_name")

    class Meta:
        model = Client
        fields = ["id", "name", "first_name", "last_name", "nickname", "phone", "email", "notes", "is_blocked"]


class StaffItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    service = serializers.IntegerField(source="service_id")
    service_name = serializers.CharField(source="service.display_name")
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
    history = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

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
            "history",
            "can_edit",
        ]

    def get_history(self, booking):
        return [{**e, "at": timezone.localtime(e["at"]).isoformat()} for e in history(booking)]

    def get_can_edit(self, booking):
        user = self.context.get("user")
        return bool(user and can_manage_booking(user, booking))


def _serialize(request, booking_or_list, many=False):
    return StaffBookingSerializer(booking_or_list, many=many, context={"user": request.user}).data


def _interval(start, end):
    return {"start": timezone.localtime(start).isoformat(), "end": timezone.localtime(end).isoformat()}


def _bookings():
    return Booking.objects.select_related("client", "created_by").prefetch_related("items__service", "events")


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


def _date_param(request, name="date"):
    try:
        return date.fromisoformat(request.query_params.get(name, ""))
    except ValueError:
        return timezone.localdate()


def _day_bounds(day):
    start = aware(day, time.min)
    return start, aware(day + timedelta(days=1), time.min)


def _hours_and_time_off(specialist_ids, day):
    """Working intervals and time off (clamped to the day) per specialist for one date."""
    day_start, day_end = _day_bounds(day)
    hours = working_intervals(specialist_ids, day)
    result = {sid: {"working": [_interval(a, b) for a, b in hours[sid]], "time_off": []} for sid in specialist_ids}
    for t in TimeOff.objects.filter(specialist_id__in=specialist_ids, start__lt=day_end, end__gt=day_start):
        result[t.specialist_id]["time_off"].append(
            {"id": t.pk, **_interval(max(t.start, day_start), min(t.end, day_end)), "reason": t.reason}
        )
    return result


def _active_bookings(specialist_ids, start, end):
    return (
        _bookings()
        .filter(items__specialist_id__in=specialist_ids, items__start_at__lt=end, items__end_at__gt=start)
        .exclude(status=BookingStatus.CANCELLED)
        .distinct()
        .order_by("start_at")
    )


def _specialist_payload(s):
    return {"id": s.pk, "name": s.name, "color": s.color, "is_online_bookable": s.is_online_bookable}


class StaffDayView(APIView):
    """Everything the day calendar needs: a column per specialist with hours, time off and bookings."""

    permission_classes = [IsSalonStaff]

    def get(self, request):
        day = _date_param(request)
        specialists = list(Specialist.objects.filter(is_active=True))
        ids = [s.pk for s in specialists]
        per_specialist = _hours_and_time_off(ids, day)
        return Response(
            {
                "date": day.isoformat(),
                "timezone": str(timezone.get_current_timezone()),
                "specialists": [{**_specialist_payload(s), **per_specialist[s.pk]} for s in specialists],
                "bookings": _serialize(request, _active_bookings(ids, *_day_bounds(day)), many=True),
            }
        )


class StaffWeekView(APIView):
    """One specialist's week (Monday to Sunday): a column per day, like Studio24's week view."""

    permission_classes = [IsSalonStaff]

    def get(self, request):
        monday = _date_param(request)
        monday -= timedelta(days=monday.weekday())
        specialists = list(Specialist.objects.filter(is_active=True))
        if not specialists:
            return Response(
                {"start": monday.isoformat(), "specialist": None, "specialists": [], "days": [], "bookings": []}
            )
        wanted = request.query_params.get("specialist", "")
        specialist = next((s for s in specialists if str(s.pk) == wanted), specialists[0])
        days = [monday + timedelta(days=n) for n in range(7)]
        bookings = _active_bookings([specialist.pk], _day_bounds(days[0])[0], _day_bounds(days[-1])[1])
        return Response(
            {
                "start": monday.isoformat(),
                "timezone": str(timezone.get_current_timezone()),
                "specialist": specialist.pk,
                "specialists": [_specialist_payload(s) for s in specialists],
                "days": [
                    {"date": d.isoformat(), **_hours_and_time_off([specialist.pk], d)[specialist.pk]} for d in days
                ],
                "bookings": _serialize(request, bookings, many=True),
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
                {"id": service.pk, "name": service.display_name, "group": service.group.name, "specialists": []},
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
        if not query:
            # The clients page opens on the clients seen most recently.
            recent = (
                Client.objects.annotate(last_visit=Max("bookings__start_at"))
                .filter(last_visit__isnull=False)
                .order_by("-last_visit")[:RECENT_CLIENTS]
            )
            return Response(StaffClientSerializer(recent, many=True).data)
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

    def post(self, request):
        """A new client added from the clients page."""
        data = NewClientSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        phone = normalize_phone(v["phone"])
        if len(phone) < 8:
            return _error("Въведете валиден телефон.")
        existing = Client.objects.filter(phone=phone).first()
        if existing:
            return _error(f"Вече има клиент с този телефон: {existing.full_name}.")
        client = Client.objects.create(
            first_name=v["first_name"].strip(), last_name=v["last_name"].strip(), phone=phone, email=v["email"]
        )
        return Response(StaffClientSerializer(client).data, status=status.HTTP_201_CREATED)


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
                by=request.user,
            )
        except BookingError as exc:
            return _error(str(exc))
        if v["internal_note"]:
            booking.internal_note = v["internal_note"]
            booking.save(update_fields=["internal_note", "updated_at"])
        booking = _bookings().get(pk=booking.pk)
        return Response(_serialize(request, booking), status=status.HTTP_201_CREATED)


class StaffBookingUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW], required=False
    )
    internal_note = serializers.CharField(required=False, allow_blank=True, max_length=1000)


STATUS_CHANGE = {
    BookingStatus.CONFIRMED: "Върна часа като потвърден",
    BookingStatus.COMPLETED: "Отбеляза като изпълнен",
    BookingStatus.NO_SHOW: "Отбеляза неявяване",
}


class StaffBookingDetailView(APIView):
    """Open a booking, mark it done / no-show, or edit the internal note."""

    permission_classes = [IsSalonStaff]

    def get(self, request, pk):
        return Response(_serialize(request, get_object_or_404(_bookings(), pk=pk)))

    def patch(self, request, pk):
        booking = get_object_or_404(_bookings(), pk=pk)
        data = StaffBookingUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if not can_manage_booking(request.user, booking):
            return _error(NOT_YOURS, status.HTTP_403_FORBIDDEN)
        if "status" in v and booking.status == BookingStatus.CANCELLED:
            return _error("Резервацията е отказана.")
        changes = []
        if "status" in v and v["status"] != booking.status:
            changes.append(STATUS_CHANGE[v["status"]])
        if "internal_note" in v and v["internal_note"] != booking.internal_note:
            changes.append("Промени вътрешната бележка")
        for field in ("status", "internal_note"):
            if field in v:
                setattr(booking, field, v[field])
        booking.save()
        for text in changes:
            record(booking, text, user=request.user)
        return Response(_serialize(request, _bookings().get(pk=pk)))


class StaffCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)


class StaffBookingCancelView(APIView):
    permission_classes = [IsSalonStaff]

    def post(self, request, pk):
        booking = get_object_or_404(_bookings(), pk=pk)
        data = StaffCancelSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not can_manage_booking(request.user, booking):
            return _error(NOT_YOURS, status.HTTP_403_FORBIDDEN)
        try:
            cancel_booking(
                booking,
                by=CancelledBy.SALON,
                reason=data.validated_data["reason"] or "Отказана от салона",
                user=request.user,
            )
        except BookingError as exc:
            return _error(str(exc))
        return Response(_serialize(request, _bookings().get(pk=pk)))


class StaffMoveSerializer(serializers.Serializer):
    item = serializers.IntegerField(help_text="Услугата, която е хваната и преместена (първата в блока).")
    start = serializers.DateTimeField(help_text="Новото начало на тази услуга.")
    specialist = serializers.PrimaryKeyRelatedField(queryset=Specialist.objects.filter(is_active=True))


def _conflict(specialist, start, busy_until, booking_id):
    """Why `specialist` cannot take [start, busy_until), or None."""
    clash = (
        BookingItem.objects.filter(
            specialist=specialist,
            booking__status__in=OCCUPYING_STATUSES,
            start_at__lt=busy_until,
            busy_until__gt=start,
        )
        .exclude(booking_id=booking_id)
        .select_related("booking__client")
        .first()
    )
    if clash:
        return (
            f"{specialist.name} има час с {clash.booking.client.full_name} "
            f"{timezone.localtime(clash.start_at):%H:%M}–{timezone.localtime(clash.end_at):%H:%M}."
        )
    if TimeOff.objects.filter(specialist=specialist, start__lt=busy_until, end__gt=start).exists():
        return f"{specialist.name} отсъства по това време."
    day = timezone.localtime(start).date()
    if not any(a <= start and busy_until <= b for a, b in working_intervals([specialist.pk], day)[specialist.pk]):
        return f"{specialist.name} не работи по това време. Работното време се сменя от „Служители“."
    return None


class StaffBookingMoveView(APIView):
    """Drag and drop: shift a visit in time and optionally hand the dragged part to another specialist."""

    permission_classes = [IsSalonStaff]

    def post(self, request, pk):
        data = StaffMoveSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        with transaction.atomic():
            booking = get_object_or_404(Booking.objects.select_for_update(), pk=pk)
            if booking.status != BookingStatus.CONFIRMED:
                return _error("Може да се местят само потвърдени часове.")
            items = list(booking.items.select_related("service", "specialist"))
            if not (
                is_salon_admin(request.user)
                or booking.created_by_id == request.user.pk
                or any(can_manage_specialist(request.user, i.specialist_id) for i in items)
            ):
                return _error(NOT_YOURS, status.HTTP_403_FORBIDDEN)
            old_start = booking.start_at
            moved = next((i for i in items if i.pk == v["item"]), None)
            if moved is None:
                return _error("Услугата не е от тази резервация.")
            delta = v["start"] - moved.start_at
            source, target = moved.specialist, v["specialist"]
            specialist_ids = sorted({i.specialist_id for i in items} | {target.pk})
            list(Specialist.objects.select_for_update().filter(id__in=specialist_ids).order_by("id"))

            for item in items:
                if item.specialist_id == source.pk and target != source:
                    if not SpecialistService.objects.filter(specialist=target, service=item.service).exists():
                        return _error(f"{target.name} не извършва услугата „{item.service.display_name}“.")
                    item.specialist = target
                item.start_at += delta
                item.end_at += delta
                item.busy_until += delta
            # Every service of the visit moves by the same amount, so they keep their order.
            for item in items:
                problem = _conflict(item.specialist, item.start_at, item.busy_until, booking.pk)
                if problem:
                    return _error(problem)
            BookingItem.objects.bulk_update(items, ["specialist", "start_at", "end_at", "busy_until"])
            booking.refresh_time_range()
            text = f"Премести часа от {when(old_start)} на {when(booking.start_at)}" if delta else "Премести часа"
            if target != source:
                text += f" (от {source.name} при {target.name})"
            record(booking, text, user=request.user)
            emails.booking_moved(booking, old_start)
        return Response(_serialize(request, _bookings().get(pk=pk)))


class StaffTimeOffSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeOff
        fields = ["id", "specialist", "start", "end", "reason"]

    def validate(self, data):
        user = self.context["request"].user
        if not can_manage_specialist(user, data["specialist"].pk):
            raise serializers.ValidationError("Можете да блокирате време само в своя график.")
        if data["end"] <= data["start"]:
            raise serializers.ValidationError("Краят трябва да е след началото.")
        clash = (
            BookingItem.objects.filter(
                specialist=data["specialist"],
                booking__status=BookingStatus.CONFIRMED,
                start_at__lt=data["end"],
                end_at__gt=data["start"],
            )
            .select_related("booking__client")
            .first()
        )
        if clash:
            raise serializers.ValidationError(
                f"В този интервал има час с {clash.booking.client.full_name} "
                f"({timezone.localtime(clash.start_at):%H:%M}). Преместете го първо."
            )
        return data


class StaffTimeOffCreateView(APIView):
    """Block time in a specialist's column (a break, an errand, a day off)."""

    permission_classes = [IsSalonStaff]

    def post(self, request):
        data = StaffTimeOffSerializer(data=request.data, context={"request": request})
        data.is_valid(raise_exception=True)
        data.save()
        return Response(data.data, status=status.HTTP_201_CREATED)


class StaffTimeOffDetailView(APIView):
    permission_classes = [IsSalonStaff]

    def delete(self, request, pk):
        block = get_object_or_404(TimeOff, pk=pk)
        if not can_manage_specialist(request.user, block.specialist_id):
            return _error("Можете да махате само своите блокирани часове.", status.HTTP_403_FORBIDDEN)
        block.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffMonthView(APIView):
    """The month picker: how busy each specialist is on each day (booked time / working time), like Studio24."""

    permission_classes = [IsSalonStaff]

    def get(self, request):
        first = _date_param(request).replace(day=1)
        next_month = (first + timedelta(days=32)).replace(day=1)
        days = [first + timedelta(days=n) for n in range((next_month - first).days)]
        specialists = list(Specialist.objects.filter(is_active=True))
        ids = [s.pk for s in specialists]
        booked = {}
        items = BookingItem.objects.filter(
            specialist_id__in=ids,
            booking__status__in=OCCUPYING_STATUSES,
            start_at__gte=_day_bounds(first)[0],
            start_at__lt=_day_bounds(next_month)[0],
        ).values_list("specialist_id", "start_at", "end_at")
        for specialist_id, start, end in items:
            key = (timezone.localtime(start).date(), specialist_id)
            booked[key] = booked.get(key, 0) + (end - start).total_seconds() / 60
        result = {}
        for day in days:
            hours = working_intervals(ids, day)
            loads = {}
            for sid in ids:
                working = sum((b - a).total_seconds() / 60 for a, b in hours[sid])
                minutes = booked.get((day, sid), 0)
                if working or minutes:
                    # 0 = free, 1 = full; a day off with bookings counts as full.
                    loads[sid] = round(min(1, minutes / working), 2) if working else 1
            result[day.isoformat()] = loads
        return Response(
            {
                "month": first.isoformat(),
                "specialists": [_specialist_payload(s) for s in specialists],
                "days": result,
            }
        )
