from django.contrib import admin

from apps.staff.models import SpecialistService

from .models import Service, ServiceCategory, ServiceGroup


class ServiceGroupInline(admin.TabularInline):
    model = ServiceGroup
    extra = 0
    fields = ["name", "order", "is_active"]


@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "order", "is_active"]
    list_editable = ["order", "is_active"]
    prepopulated_fields = {"slug": ["name"]}
    inlines = [ServiceGroupInline]


@admin.register(ServiceGroup)
class ServiceGroupAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "order", "is_active"]
    list_filter = ["category", "is_active"]
    list_editable = ["order", "is_active"]
    search_fields = ["name"]


class SpecialistServiceInline(admin.TabularInline):
    model = SpecialistService
    extra = 0
    autocomplete_fields = ["specialist"]
    verbose_name_plural = "специалисти, които извършват услугата"


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ["name", "group", "price", "duration_minutes", "is_online_bookable", "is_active"]
    list_editable = ["price", "duration_minutes", "is_online_bookable", "is_active"]
    list_filter = ["group__category", "group", "is_online_bookable", "is_active"]
    search_fields = ["name", "description"]
    filter_horizontal = ["resources"]
    inlines = [SpecialistServiceInline]
