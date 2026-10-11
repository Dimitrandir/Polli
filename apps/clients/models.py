from django.conf import settings
from django.db import models
from django.utils import timezone

from .phone import normalize_phone


class Client(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="client",
        verbose_name="потребителски акаунт",
    )
    first_name = models.CharField("име", max_length=100)
    last_name = models.CharField("фамилия", max_length=100, blank=True)
    phone = models.CharField("телефон", max_length=32, unique=True)
    email = models.EmailField("имейл", blank=True)
    notes = models.TextField("вътрешни бележки", blank=True, help_text="Виждат се само от салона.")
    is_blocked = models.BooleanField(
        "блокиран", default=False, help_text="Блокиран клиент не може да прави онлайн резервации."
    )
    blocked_reason = models.CharField("причина за блокиране", max_length=255, blank=True)
    blocked_at = models.DateTimeField("блокиран на", null=True, blank=True)
    privacy_consent_at = models.DateTimeField("съгласие за лични данни", null=True, blank=True)
    created_at = models.DateTimeField("създаден", auto_now_add=True)

    class Meta:
        ordering = ["first_name", "last_name"]
        indexes = [models.Index(fields=["email"])]
        verbose_name = "клиент"
        verbose_name_plural = "клиенти"

    def __str__(self):
        return f"{self.full_name} ({self.phone})"

    def save(self, *args, **kwargs):
        self.phone = normalize_phone(self.phone)
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def block(self, reason=""):
        self.is_blocked = True
        self.blocked_reason = reason
        self.blocked_at = timezone.now()
        self.save(update_fields=["is_blocked", "blocked_reason", "blocked_at"])

    def unblock(self):
        self.is_blocked = False
        self.blocked_reason = ""
        self.blocked_at = None
        self.save(update_fields=["is_blocked", "blocked_reason", "blocked_at"])
