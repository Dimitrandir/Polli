from django.conf import settings
from django.db import models
from django.utils import timezone

from .phone import normalize_phone


class ReminderChannel(models.TextChoices):
    EMAIL = "email", "имейл"
    NONE = "none", "без напомняния"


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
    nickname = models.CharField(
        "псевдоним",
        max_length=100,
        blank=True,
        help_text="Вижда се само от салона. Търсенето на клиент намира и по него (напр. „Митко“).",
    )
    phone = models.CharField("телефон", max_length=32, unique=True)
    email = models.EmailField("имейл", blank=True)
    notes = models.TextField("вътрешни бележки", blank=True, help_text="Виждат се само от салона.")
    is_blocked = models.BooleanField(
        "блокиран", default=False, help_text="Блокиран клиент не може да прави онлайн резервации."
    )
    blocked_reason = models.CharField("причина за блокиране", max_length=255, blank=True)
    blocked_at = models.DateTimeField("блокиран на", null=True, blank=True)
    privacy_consent_at = models.DateTimeField("съгласие за лични данни", null=True, blank=True)
    privacy_consent_version = models.CharField("версия на политиката", max_length=20, blank=True)
    marketing_consent_at = models.DateTimeField("съгласие за промоции", null=True, blank=True)
    preferred_specialist = models.ForeignKey(
        "staff.Specialist",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        verbose_name="любим специалист",
    )
    reminder_channel = models.CharField(
        "напомняния", max_length=10, choices=ReminderChannel.choices, default=ReminderChannel.EMAIL
    )
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

    def give_privacy_consent(self, now=None):
        self.privacy_consent_at = now or timezone.now()
        self.privacy_consent_version = settings.PRIVACY_POLICY_VERSION

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


class ClientNote(models.Model):
    """A specialist's own note about a client. Only its author sees it."""

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="private_notes", verbose_name="клиент")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+", verbose_name="автор"
    )
    text = models.TextField("бележка")
    created_at = models.DateTimeField("създадена", auto_now_add=True)
    updated_at = models.DateTimeField("променена", auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "лична бележка"
        verbose_name_plural = "лични бележки"

    def __str__(self):
        return f"{self.client.full_name}: {self.text[:40]}"


class Message(models.Model):
    """One message in the conversation between a client and the salon."""

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="messages", verbose_name="клиент")
    from_client = models.BooleanField("от клиента", default=False)
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        verbose_name="изпратено от",
    )
    text = models.TextField("текст")
    created_at = models.DateTimeField("изпратено", auto_now_add=True)
    read_at = models.DateTimeField("прочетено", null=True, blank=True, help_text="Кога го е видяла другата страна.")

    class Meta:
        ordering = ["created_at", "pk"]
        indexes = [models.Index(fields=["client", "created_at"])]
        verbose_name = "съобщение"
        verbose_name_plural = "съобщения"

    def __str__(self):
        return f"{self.client.full_name}: {self.text[:40]}"
