from django.core.exceptions import ValidationError
from django.db import models

from apps.staff.models import Weekday


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
