from django.contrib import admin

from .models import OpeningHours, SalonInfo


class OpeningHoursInline(admin.TabularInline):
    model = OpeningHours
    extra = 0


@admin.register(SalonInfo)
class SalonInfoAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "email", "address"]
    inlines = [OpeningHoursInline]

    def has_add_permission(self, request):
        return not SalonInfo.objects.exists()
