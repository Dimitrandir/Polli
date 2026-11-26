from django.contrib import admin

from .models import OnlineBlock, OpeningHours, SalonInfo


class OpeningHoursInline(admin.TabularInline):
    model = OpeningHours
    extra = 0


@admin.register(SalonInfo)
class SalonInfoAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "email", "address"]
    inlines = [OpeningHoursInline]

    def has_add_permission(self, request):
        return not SalonInfo.objects.exists()


@admin.register(OnlineBlock)
class OnlineBlockAdmin(admin.ModelAdmin):
    list_display = ["date", "specialist", "message", "created_by"]
    list_filter = ["specialist"]
    date_hierarchy = "date"
    raw_id_fields = ["created_by"]
