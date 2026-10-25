from datetime import date, time, timedelta

from django import forms
from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html

from apps.staff.models import Specialist, SpecialistService, TimeOff
from apps.staff.schedule import aware, working_intervals

from . import emails
from .availability import BookingError
from .history import record
from .models import OCCUPYING_STATUSES, Booking, BookingEvent, BookingItem, BookingSource, BookingStatus, CancelledBy
from .services import cancel_booking


class BookingItemForm(forms.ModelForm):
    """Staff pick service, specialist and start; end, buffer and price are filled in automatically."""

    class Meta:
        model = BookingItem
        fields = ["service", "specialist", "start_at", "duration_minutes", "price"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["duration_minutes"].required = False
        self.fields["price"].required = False
        self.fields["duration_minutes"].help_text = "Празно = стандартната продължителност."
        self.fields["price"].help_text = "Празно = цената от ценоразписа."

    def clean(self):
        data = super().clean()
        service, specialist, start = data.get("service"), data.get("specialist"), data.get("start_at")
        if not (service and specialist and start):
            return data
        offer = SpecialistService.objects.filter(service=service, specialist=specialist).first()
        if offer is None:
            raise ValidationError(f"{specialist} не извършва услугата „{service}“.")
        duration = data.get("duration_minutes") or offer.duration_minutes
        price = data.get("price")
        data["duration_minutes"] = duration
        data["price"] = offer.price if price is None else price
        self.instance.end_at = start + timedelta(minutes=duration)
        self.instance.busy_until = self.instance.end_at + timedelta(minutes=service.buffer_minutes)
        return data


class BookingItemInline(admin.TabularInline):
    model = BookingItem
    form = BookingItemForm
    extra = 0
    min_num = 1
    autocomplete_fields = ["service", "specialist"]
    readonly_fields = ["end_at"]
    fields = ["service", "specialist", "start_at", "duration_minutes", "end_at", "price"]


class SpecialistFilter(admin.SimpleListFilter):
    title = "специалист"
    parameter_name = "specialist"

    def lookups(self, request, model_admin):
        return [(s.pk, s.name) for s in Specialist.objects.filter(is_active=True)]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(items__specialist_id=self.value()).distinct()
        return queryset


class BookingEventInline(admin.TabularInline):
    model = BookingEvent
    extra = 0
    can_delete = False
    fields = ["at", "who", "text"]
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ["when", "client_link", "services", "specialists", "status", "source", "total"]
    list_filter = ["status", "source", SpecialistFilter]
    date_hierarchy = "start_at"
    search_fields = ["client__first_name", "client__last_name", "client__phone", "client__email"]
    autocomplete_fields = ["client"]
    readonly_fields = [
        "start_at",
        "end_at",
        "cancel_token",
        "cancelled_at",
        "cancelled_by",
        "created_by",
        "created_at",
        "updated_at",
    ]
    fieldsets = [
        (None, {"fields": ["client", "status", "source", ("start_at", "end_at")]}),
        ("Бележки", {"fields": ["note", "internal_note"]}),
        ("Отказ", {"fields": ["cancelled_at", "cancelled_by", "cancellation_reason"], "classes": ["collapse"]}),
        ("Служебни", {"fields": ["cancel_token", "created_by", "created_at", "updated_at"], "classes": ["collapse"]}),
    ]
    inlines = [BookingItemInline, BookingEventInline]
    actions = ["mark_completed", "mark_no_show", "cancel_by_salon"]

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("client")
            .prefetch_related("items__service", "items__specialist")
        )

    def get_changeform_initial_data(self, request):
        return {"source": BookingSource.SALON}

    def save_model(self, request, obj, form, change):
        if not obj.start_at:
            # Placeholder until the items are saved; refresh_time_range() sets the real values.
            obj.start_at = obj.end_at = timezone.now()
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        form.instance.refresh_time_range()
        if not change:
            record(form.instance, "Записа часа от админ панела", user=request.user)
            emails.booking_created(form.instance)
        elif form.has_changed() or any(f.has_changed() for f in formsets):
            record(form.instance, "Промени часа от админ панела", user=request.user)

    @admin.display(description="час", ordering="start_at")
    def when(self, obj):
        start, end = timezone.localtime(obj.start_at), timezone.localtime(obj.end_at)
        weekday = ["пн", "вт", "ср", "чт", "пт", "сб", "нд"][start.weekday()]
        return f"{weekday} {start:%d.%m.%Y}, {start:%H:%M}–{end:%H:%M}"

    @admin.display(description="специалисти")
    def specialists(self, obj):
        return ", ".join(dict.fromkeys(item.specialist.name for item in obj.items.all()))

    @admin.display(description="клиент", ordering="client__first_name")
    def client_link(self, obj):
        url = reverse("admin:clients_client_change", args=[obj.client_id])
        return format_html('<a href="{}">{}</a>{}', url, obj.client.full_name, " ⛔" if obj.client.is_blocked else "")

    @admin.display(description="услуги")
    def services(self, obj):
        return ", ".join(item.service.display_name for item in obj.items.all())

    @admin.display(description="сума (EUR)")
    def total(self, obj):
        return obj.total_price

    @admin.action(description="Отбележи като изпълнени")
    def mark_completed(self, request, queryset):
        updated = queryset.filter(status=BookingStatus.CONFIRMED).update(status=BookingStatus.COMPLETED)
        self.message_user(request, f"Отбелязани като изпълнени: {updated}.", messages.SUCCESS)

    @admin.action(description="Отбележи като неявяване")
    def mark_no_show(self, request, queryset):
        updated = queryset.filter(status=BookingStatus.CONFIRMED).update(status=BookingStatus.NO_SHOW)
        self.message_user(request, f"Отбелязани като неявяване: {updated}.", messages.SUCCESS)

    @admin.action(description="Откажи от името на салона")
    def cancel_by_salon(self, request, queryset):
        done = 0
        for booking in queryset:
            try:
                cancel_booking(booking, by=CancelledBy.SALON, reason="Отказана от салона", user=request.user)
                done += 1
            except BookingError:
                pass
        self.message_user(request, f"Отказани резервации: {done}.", messages.SUCCESS)

    # --- daily schedule ----------------------------------------------------------

    def get_urls(self):
        custom = [path("day/", self.admin_site.admin_view(self.day_view), name="bookings_booking_day")]
        return custom + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        extra_context = {**(extra_context or {}), "day_view_url": reverse("admin:bookings_booking_day")}
        return super().changelist_view(request, extra_context)

    def day_view(self, request):
        try:
            day = date.fromisoformat(request.GET.get("date", ""))
        except ValueError:
            day = timezone.localdate()
        day_start = aware(day, time.min)
        day_end = day_start + timedelta(days=1)

        specialists = list(Specialist.objects.filter(is_active=True))
        ids = [s.pk for s in specialists]
        hours = working_intervals(ids, day)
        items = (
            BookingItem.objects.filter(
                specialist_id__in=ids,
                booking__status__in=OCCUPYING_STATUSES,
                start_at__lt=day_end,
                end_at__gt=day_start,
            )
            .select_related("booking__client", "service")
            .order_by("start_at")
        )
        time_off = TimeOff.objects.filter(Q(specialist_id__in=ids), start__lt=day_end, end__gt=day_start)

        rows = []
        for s in specialists:
            rows.append(
                {
                    "specialist": s,
                    "hours": [(timezone.localtime(a), timezone.localtime(b)) for a, b in hours[s.pk]],
                    "time_off": [t for t in time_off if t.specialist_id == s.pk],
                    "items": [i for i in items if i.specialist_id == s.pk],
                }
            )
        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "title": f"График за {day:%d.%m.%Y}",
            "day": day,
            "prev_day": day - timedelta(days=1),
            "next_day": day + timedelta(days=1),
            "rows": rows,
        }
        return TemplateResponse(request, "admin/bookings/day.html", context)
