from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.staff.models import Weekday

DEFAULT_ONLINE_BLOCK_MESSAGE = "В този ден може да резервирате час само по телефона!"


class SalonInfo(models.Model):
    """Contacts and policies shown on the website. There is one row."""

    name = models.CharField("име", max_length=150)
    legal_name = models.CharField("юридическо лице", max_length=200, blank=True)
    phone = models.CharField("телефон", max_length=50)
    email = models.EmailField("имейл", blank=True)
    address = models.CharField("адрес", max_length=255)
    facebook = models.URLField("Facebook", blank=True)
    instagram = models.URLField("Instagram", blank=True)
    tiktok = models.URLField("TikTok", blank=True)
    booking_policy = models.TextField("условия при резервация", blank=True)
    # Online booking rules. Empty = the default from the server settings (settings.BOOKING).
    max_days_ahead = models.PositiveIntegerField(
        "записване до (дни напред)",
        null=True,
        blank=True,
        help_text="Колко дни напред клиентите могат да си запишат час онлайн.",
    )
    min_notice_minutes = models.PositiveIntegerField(
        "най-рано след (мин.)",
        null=True,
        blank=True,
        help_text="Колко минути след момента е най-ранният час, който клиент може да запише онлайн.",
    )
    cancellation_hours = models.PositiveIntegerField(
        "онлайн отказ до (часа преди)",
        null=True,
        blank=True,
        help_text="До колко часа преди началото клиентът може да откаже сам.",
    )
    hide_client_phones = models.BooleanField(
        "скрий телефоните на клиентите от служителите",
        default=False,
        help_text="Служителите, които не са администратори, не виждат телефоните на клиентите в календара.",
    )
    online_block_message = models.CharField(
        "текст за дни без онлайн записване",
        max_length=255,
        blank=True,
        help_text=f"Какво виждат клиентите в блокиран ден. Празно = „{DEFAULT_ONLINE_BLOCK_MESSAGE}“",
    )

    class Meta:
        verbose_name = "информация за салона"
        verbose_name_plural = "информация за салона"

    def __str__(self):
        return self.name

    @classmethod
    def load(cls):
        return cls.objects.prefetch_related("opening_hours").first()


class OpeningHours(models.Model):
    """When the salon is open. A day without rows is a day off."""

    salon = models.ForeignKey(SalonInfo, on_delete=models.CASCADE, related_name="opening_hours", verbose_name="салон")
    weekday = models.PositiveSmallIntegerField("ден", choices=Weekday.choices)
    start_time = models.TimeField("от")
    end_time = models.TimeField("до")

    class Meta:
        ordering = ["weekday", "start_time"]
        verbose_name = "работно време"
        verbose_name_plural = "работно време на салона"

    def __str__(self):
        return f"{self.get_weekday_display()} {self.start_time:%H:%M}–{self.end_time:%H:%M}"

    def clean(self):
        super().clean()
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": "Краят трябва да е след началото."})


class OnlineBlock(models.Model):
    """A day on which clients cannot book online (the website and the AI assistant).

    Without a specialist the whole salon is closed for online booking; with one, only that
    specialist. The team still books from the calendar and the visits already booked stay.
    """

    date = models.DateField("дата", db_index=True)
    specialist = models.ForeignKey(
        "staff.Specialist",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="online_blocks",
        verbose_name="специалист",
        help_text="Празно = целият салон.",
    )
    message = models.CharField(
        "текст за клиентите",
        max_length=255,
        blank=True,
        help_text="Празно = текстът от настройките.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        verbose_name="блокиран от",
    )
    created_at = models.DateTimeField("създаден", auto_now_add=True)

    class Meta:
        ordering = ["date", "specialist__order", "specialist__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["date", "specialist"],
                condition=models.Q(specialist__isnull=False),
                name="unique_online_block_specialist",
            ),
            models.UniqueConstraint(
                fields=["date"], condition=models.Q(specialist__isnull=True), name="unique_online_block_salon"
            ),
        ]
        verbose_name = "ден без онлайн записване"
        verbose_name_plural = "дни без онлайн записване"

    def __str__(self):
        who = self.specialist.name if self.specialist_id else "целият салон"
        return f"{self.date:%d.%m.%Y} – {who}"
