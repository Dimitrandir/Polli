from django.conf import settings
from django.db import models


class PushSubscription(models.Model):
    """One browser (a phone or a computer) that agreed to show notifications for an account."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions", verbose_name="акаунт"
    )
    # The browser's push service address; it identifies the device.
    endpoint = models.URLField("адрес", max_length=1000, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    user_agent = models.CharField("браузър", max_length=300, blank=True)
    created_at = models.DateTimeField("включено", auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "устройство с известия"
        verbose_name_plural = "устройства с известия"

    def __str__(self):
        return f"{self.user} – {self.user_agent[:60]}"
