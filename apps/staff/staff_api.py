"""The team page: every specialist's profile (photo, description, colour), weekly hours and rights.

Everyone edits their own profile and hours; an administrator edits everyone, adds people,
switches off those who do not work at the moment and grants administrator rights.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.models import BookingStatus
from apps.bookings.staff_api import IsSalonStaff

from .models import Specialist, Weekday, WorkingHours
from .roles import can_manage_specialist, is_salon_admin, own_specialist_id, set_salon_admin

MAX_PHOTO_BYTES = 8 * 1024 * 1024


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def team_member(specialist, request):
    user = specialist.user
    return {
        "id": specialist.pk,
        "name": specialist.name,
        "title": specialist.title,
        "bio": specialist.bio,
        "photo": request.build_absolute_uri(specialist.photo.url) if specialist.photo else None,
        "color": specialist.color,
        "order": specialist.order,
        "is_active": specialist.is_active,
        "is_online_bookable": specialist.is_online_bookable,
        "working_hours": [
            {"weekday": h.weekday, "start": f"{h.start_time:%H:%M}", "end": f"{h.end_time:%H:%M}"}
            for h in specialist.working_hours.all()
        ],
        "login": (
            {"username": user.get_username(), "is_admin": is_salon_admin(user), "is_active": user.is_active}
            if user
            else None
        ),
        "is_me": specialist.pk == own_specialist_id(request.user),
        "can_edit": can_manage_specialist(request.user, specialist.pk),
    }


def _team(request):
    specialists = Specialist.objects.select_related("user").prefetch_related("working_hours")
    if not is_salon_admin(request.user):
        specialists = specialists.filter(Q(is_active=True) | Q(pk=own_specialist_id(request.user)))
    return specialists.order_by("-is_active", "order", "name")


class MemberSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150, required=False)
    title = serializers.CharField(max_length=150, required=False, allow_blank=True)
    bio = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    color = serializers.RegexField(r"^(#[0-9a-fA-F]{6})?$", required=False, allow_blank=True)
    # Only an administrator may change the fields below.
    order = serializers.IntegerField(required=False, min_value=0)
    is_active = serializers.BooleanField(required=False)
    is_online_bookable = serializers.BooleanField(required=False)
    is_admin = serializers.BooleanField(required=False)
    username = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(max_length=128, required=False, allow_blank=True, trim_whitespace=False)


ADMIN_FIELDS = {"order", "is_active", "is_online_bookable", "is_admin", "username", "password"}


def _apply_login(specialist, v):
    """Create or update the specialist's login from `username` / `password` / `is_admin`."""
    if not {"username", "password", "is_admin"} & set(v):
        return
    User = get_user_model()
    user = specialist.user
    username = v.get("username", "").strip()
    password = v.get("password", "")
    if username and (user is None or username != user.get_username()):
        if User.objects.filter(username__iexact=username).exclude(pk=getattr(user, "pk", None)).exists():
            raise serializers.ValidationError({"username": "Това потребителско име е заето."})
    if user is None and not (username and password):
        if "is_admin" in v and v["is_admin"]:
            raise serializers.ValidationError("Задайте потребителско име и парола, за да дадете права.")
        return
    if password:
        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
    if user is None:
        user = User.objects.create_user(username, password=password, is_staff=True, first_name=specialist.name)
        specialist.user = user
        specialist.save(update_fields=["user"])
    else:
        if username:
            user.username = username
        if password:
            user.set_password(password)
        user.save()
    if "is_admin" in v:
        set_salon_admin(user, v["is_admin"])


class TeamView(APIView):
    """GET: the team. POST (administrator): add a person, optionally with a login."""

    permission_classes = [IsSalonStaff]

    def get(self, request):
        return Response([team_member(s, request) for s in _team(request)])

    def post(self, request):
        if not is_salon_admin(request.user):
            return _error("Само администратор може да добавя служители.", status.HTTP_403_FORBIDDEN)
        data = MemberSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if not v.get("name", "").strip():
            return _error("Въведете име.")
        with transaction.atomic():
            specialist = Specialist.objects.create(
                name=v["name"].strip(),
                title=v.get("title", "").strip(),
                bio=v.get("bio", "").strip(),
                color=v.get("color", ""),
                order=v.get("order", Specialist.objects.count()),
                is_online_bookable=v.get("is_online_bookable", True),
            )
            _apply_login(specialist, v)
        return Response(team_member(specialist, request), status=status.HTTP_201_CREATED)


class TeamMemberView(APIView):
    permission_classes = [IsSalonStaff]

    def get(self, request, pk):
        return Response(team_member(get_object_or_404(_team(request), pk=pk), request))

    def patch(self, request, pk):
        specialist = get_object_or_404(Specialist.objects.select_related("user"), pk=pk)
        if not can_manage_specialist(request.user, specialist.pk):
            return _error("Можете да променяте само своя профил.", status.HTTP_403_FORBIDDEN)
        data = MemberSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        admin = is_salon_admin(request.user)
        if not admin and ADMIN_FIELDS & set(v):
            return _error("Само администратор може да променя това.", status.HTTP_403_FORBIDDEN)
        is_me = specialist.user_id is not None and specialist.user_id == request.user.pk
        if is_me and (v.get("is_active") is False or v.get("is_admin") is False):
            return _error("Не можете да изключите себе си или да махнете собствените си права.")
        if v.get("is_active") is False and specialist.is_active:
            upcoming = (
                specialist.booking_items.filter(booking__status=BookingStatus.CONFIRMED, start_at__gte=timezone.now())
                .values("booking")
                .distinct()
                .count()
            )
            if upcoming:
                return _error(
                    f"{specialist.name} има предстоящи часове ({upcoming}). Преместете ги при колега или ги откажете, "
                    "и тогава изключете профила."
                )
        if "name" in v and not v["name"].strip():
            return _error("Въведете име.")

        with transaction.atomic():
            for field in ("name", "title", "bio"):
                if field in v:
                    setattr(specialist, field, v[field].strip())
            for field in ("color", "order", "is_active", "is_online_bookable"):
                if field in v:
                    setattr(specialist, field, v[field])
            specialist.save()
            if admin:
                _apply_login(specialist, v)
                if "is_active" in v and specialist.user and not specialist.user.is_superuser:
                    # Someone who does not work at the moment cannot log in either.
                    specialist.user.is_active = v["is_active"]
                    specialist.user.save(update_fields=["is_active"])
        specialist = get_object_or_404(_team(request), pk=pk)
        return Response(team_member(specialist, request))


class HoursSerializer(serializers.Serializer):
    weekday = serializers.ChoiceField(choices=Weekday.choices)
    start = serializers.TimeField()
    end = serializers.TimeField()


class TeamHoursView(APIView):
    """PUT the whole weekly schedule. Two intervals on a day mean a break between them."""

    permission_classes = [IsSalonStaff]

    def put(self, request, pk):
        specialist = get_object_or_404(Specialist, pk=pk)
        if not can_manage_specialist(request.user, specialist.pk):
            return _error("Можете да променяте само своето работно време.", status.HTTP_403_FORBIDDEN)
        data = HoursSerializer(data=request.data, many=True)
        data.is_valid(raise_exception=True)
        rows = sorted(data.validated_data, key=lambda r: (r["weekday"], r["start"]))
        for i, row in enumerate(rows):
            day = Weekday(row["weekday"]).label
            if row["end"] <= row["start"]:
                return _error(f"{day.capitalize()}: краят трябва да е след началото.")
            if i and rows[i - 1]["weekday"] == row["weekday"] and rows[i - 1]["end"] > row["start"]:
                return _error(f"{day.capitalize()}: интервалите се застъпват.")
        with transaction.atomic():
            specialist.working_hours.all().delete()
            WorkingHours.objects.bulk_create(
                WorkingHours(specialist=specialist, weekday=r["weekday"], start_time=r["start"], end_time=r["end"])
                for r in rows
            )
        return Response(team_member(get_object_or_404(_team(request), pk=pk), request))


class PhotoSerializer(serializers.Serializer):
    photo = serializers.ImageField()

    def validate_photo(self, photo):
        if photo.size > MAX_PHOTO_BYTES:
            raise serializers.ValidationError("Снимката е твърде голяма (до 8 MB).")
        return photo


class TeamPhotoView(APIView):
    """POST a new photo (multipart, field "photo") or DELETE the current one."""

    permission_classes = [IsSalonStaff]

    def _specialist(self, request, pk):
        specialist = get_object_or_404(Specialist, pk=pk)
        if not can_manage_specialist(request.user, specialist.pk):
            return None
        return specialist

    def post(self, request, pk):
        specialist = self._specialist(request, pk)
        if specialist is None:
            return _error("Можете да сменяте само своята снимка.", status.HTTP_403_FORBIDDEN)
        data = PhotoSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if specialist.photo:
            specialist.photo.delete(save=False)
        specialist.photo = data.validated_data["photo"]
        specialist.save(update_fields=["photo"])
        return Response(team_member(get_object_or_404(_team(request), pk=pk), request))

    def delete(self, request, pk):
        specialist = self._specialist(request, pk)
        if specialist is None:
            return _error("Можете да сменяте само своята снимка.", status.HTTP_403_FORBIDDEN)
        if specialist.photo:
            specialist.photo.delete(save=False)
            specialist.save(update_fields=["photo"])
        return Response(team_member(get_object_or_404(_team(request), pk=pk), request))
