from django.contrib import admin, messages

from apps.bookings.models import Booking

from .models import Client, Message


class BookingInline(admin.TabularInline):
    model = Booking
    extra = 0
    fields = ["start_at", "status", "note"]
    readonly_fields = fields
    show_change_link = True
    can_delete = False
    ordering = ["-start_at"]
    verbose_name_plural = "история на посещенията"

    def has_add_permission(self, request, obj=None):
        return False


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    fields = ["created_at", "from_client", "sender", "text", "read_at"]
    readonly_fields = fields
    can_delete = False
    verbose_name_plural = "съобщения"

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ["full_name", "nickname", "phone", "email", "is_blocked", "created_at"]
    list_filter = ["is_blocked"]
    search_fields = ["first_name", "last_name", "nickname", "phone", "email"]
    readonly_fields = [
        "blocked_at",
        "privacy_consent_at",
        "privacy_consent_version",
        "marketing_consent_at",
        "created_at",
    ]
    autocomplete_fields = ["user"]
    inlines = [BookingInline, MessageInline]
    actions = ["block_clients", "unblock_clients"]

    @admin.display(description="име")
    def full_name(self, obj):
        return obj.full_name

    @admin.action(description="Блокирай избраните клиенти")
    def block_clients(self, request, queryset):
        for client in queryset:
            client.block(reason=client.blocked_reason or "Блокиран от администратор")
        self.message_user(request, f"Блокирани клиенти: {queryset.count()}.", messages.SUCCESS)

    @admin.action(description="Отблокирай избраните клиенти")
    def unblock_clients(self, request, queryset):
        for client in queryset:
            client.unblock()
        self.message_user(request, f"Отблокирани клиенти: {queryset.count()}.", messages.SUCCESS)
