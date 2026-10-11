from django.contrib import admin
from django.utils import timezone

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


@admin.register(Specialist)
class SpecialistAdmin(admin.ModelAdmin):
    list_display = ["name", "title", "order", "is_online_bookable", "is_active"]
    list_editable = ["order", "is_online_bookable", "is_active"]
    search_fields = ["name", "title"]
    inlines = [SpecialistServiceInline, WorkingHoursInline, ScheduleOverrideInline, TimeOffInline]


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
