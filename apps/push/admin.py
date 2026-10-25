from django.contrib import admin

from .models import PushSubscription


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ["user", "user_agent", "created_at"]
    search_fields = ["user__email", "user__username"]
    readonly_fields = ["user", "endpoint", "p256dh", "auth", "user_agent", "created_at"]
