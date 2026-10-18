from django import forms
from django.contrib import admin
from django.utils import timezone

from apps.catalog.models import Service, ServiceCategory

from .models import Resource, ScheduleOverride, Specialist, SpecialistService, TimeOff, WorkingHours


class SpecialistServiceInline(admin.TabularInline):
    model = SpecialistService
    extra = 0
    autocomplete_fields = ["service"]


class WorkingHoursInline(admin.TabularInline):
    model = WorkingHours
    extra = 0


class UpcomingFilterMixin:
    """Show only current and future rows so the form stays short."""

    def get_queryset(self, request):
        return super().get_queryset(request).filter(**{self.upcoming_lookup: self.upcoming_value()})


class ScheduleOverrideInline(UpcomingFilterMixin, admin.TabularInline):
    model = ScheduleOverride
    extra = 0
    upcoming_lookup = "date__gte"

    def upcoming_value(self):
        return timezone.localdate()


class TimeOffInline(UpcomingFilterMixin, admin.TabularInline):
    model = TimeOff
    extra = 0
    upcoming_lookup = "end__gte"

    def upcoming_value(self):
        return timezone.now()


class SpecialistForm(forms.ModelForm):
    add_categories = forms.ModelMultipleChoiceField(
        ServiceCategory.objects.all(),
        required=False,
        widget=forms.CheckboxSelectMultiple,
        label="добави всички услуги от",
        help_text="Добавя услугите от избраните категории, които специалистът още няма, с цената на услугата. "
        "Собствена цена се задава после в списъка с услугите по-долу.",
    )


@admin.register(Specialist)
class SpecialistAdmin(admin.ModelAdmin):
    form = SpecialistForm
    list_display = ["name", "title", "color", "order", "is_online_bookable", "is_active"]
    list_editable = ["color", "order", "is_online_bookable", "is_active"]
    search_fields = ["name", "title"]
    inlines = [SpecialistServiceInline, WorkingHoursInline, ScheduleOverrideInline, TimeOffInline]

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        categories = form.cleaned_data.get("add_categories")
        if not categories:
            return
        specialist = form.instance
        have = set(specialist.specialist_services.values_list("service_id", flat=True))
        services = Service.objects.filter(group__category__in=categories, is_active=True).exclude(pk__in=have)
        SpecialistService.objects.bulk_create(SpecialistService(specialist=specialist, service=s) for s in services)


@admin.register(TimeOff)
class TimeOffAdmin(admin.ModelAdmin):
    list_display = ["specialist", "start", "end", "reason"]
    list_filter = ["specialist"]
    date_hierarchy = "start"


@admin.register(ScheduleOverride)
class ScheduleOverrideAdmin(admin.ModelAdmin):
    list_display = ["specialist", "date", "start_time", "end_time"]
    list_filter = ["specialist"]
    date_hierarchy = "date"


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ["name", "quantity", "is_active"]
    list_editable = ["quantity", "is_active"]
