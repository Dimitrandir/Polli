from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models


class Resource(models.Model):
    """A shared physical resource that limits how many services can run at once."""

    name = models.CharField("име", max_length=100)
    quantity = models.PositiveSmallIntegerField(
        "брой", default=1, validators=[MinValueValidator(1)], help_text="Колко услуги могат да го ползват едновременно."
    )
    is_active = models.BooleanField("активен", default=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "ресурс"
        verbose_name_plural = "ресурси"

    def __str__(self):
        return self.name


class Specialist(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="specialist",
        verbose_name="потребител",
    )
    name = models.CharField("име", max_length=150)
    title = models.CharField("позиция", max_length=150, blank=True, help_text="Напр. „Колорист, трихолог“.")
    bio = models.TextField("представяне", blank=True)
    services = models.ManyToManyField(
        "catalog.Service", through="SpecialistService", related_name="specialists", verbose_name="услуги"
    )
    order = models.PositiveIntegerField("подредба", default=0)
    is_active = models.BooleanField("активен", default=True)
    is_online_bookable = models.BooleanField("онлайн резервации", default=True)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "специалист"
        verbose_name_plural = "специалисти"

    def __str__(self):
        return self.name


class SpecialistService(models.Model):
    """Which services a specialist performs, with optional own price and duration."""

    specialist = models.ForeignKey(
        Specialist, on_delete=models.CASCADE, related_name="specialist_services", verbose_name="специалист"
    )
    service = models.ForeignKey(
        "catalog.Service", on_delete=models.CASCADE, related_name="specialist_services", verbose_name="услуга"
    )
    price_override = models.DecimalField(
        "собствена цена (EUR)",
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Празно = цената на услугата.",
    )
    duration_override = models.PositiveIntegerField(
        "собствена продължителност (мин.)",
        null=True,
        blank=True,
        validators=[MinValueValidator(5)],
        help_text="Празно = продължителността на услугата.",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["specialist", "service"], name="unique_specialist_service"),
        ]
        verbose_name = "услуга на специалист"
        verbose_name_plural = "услуги на специалиста"

    def __str__(self):
        return f"{self.specialist} – {self.service}"

    @property
    def price(self):
        return self.price_override if self.price_override is not None else self.service.price

    @property
    def duration_minutes(self):
        return self.duration_override or self.service.duration_minutes


class Weekday(models.IntegerChoices):
    MONDAY = 0, "понеделник"
    TUESDAY = 1, "вторник"
    WEDNESDAY = 2, "сряда"
    THURSDAY = 3, "четвъртък"
    FRIDAY = 4, "петък"
    SATURDAY = 5, "събота"
    SUNDAY = 6, "неделя"


class _TimeRangeMixin:
    def clean(self):
        super().clean()
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": "Краят трябва да е след началото."})


class WorkingHours(_TimeRangeMixin, models.Model):
    """Regular weekly schedule. Several rows per day model a break."""

    specialist = models.ForeignKey(
        Specialist, on_delete=models.CASCADE, related_name="working_hours", verbose_name="специалист"
    )
    weekday = models.PositiveSmallIntegerField("ден", choices=Weekday.choices)
    start_time = models.TimeField("от")
    end_time = models.TimeField("до")

    class Meta:
        ordering = ["specialist", "weekday", "start_time"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")), name="working_hours_end_after_start"
            ),
        ]
        verbose_name = "работно време"
        verbose_name_plural = "работно време (седмично)"

    def __str__(self):
        return f"{self.get_weekday_display()} {self.start_time:%H:%M}–{self.end_time:%H:%M}"


class ScheduleOverride(_TimeRangeMixin, models.Model):
    """Special hours for one date. When a date has overrides, they replace the weekly schedule."""

    specialist = models.ForeignKey(
        Specialist, on_delete=models.CASCADE, related_name="schedule_overrides", verbose_name="специалист"
    )
    date = models.DateField("дата")
    start_time = models.TimeField("от")
    end_time = models.TimeField("до")

    class Meta:
        ordering = ["date", "start_time"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")), name="schedule_override_end_after_start"
            ),
        ]
        verbose_name = "специален график"
        verbose_name_plural = "специален график (за конкретна дата)"

    def __str__(self):
        return f"{self.date:%d.%m.%Y} {self.start_time:%H:%M}–{self.end_time:%H:%M}"


class TimeOff(models.Model):
    """Time when the specialist is not available: leave, sick day, a long break."""

    specialist = models.ForeignKey(
        Specialist, on_delete=models.CASCADE, related_name="time_off", verbose_name="специалист"
    )
    start = models.DateTimeField("от")
    end = models.DateTimeField("до")
    reason = models.CharField("причина", max_length=200, blank=True)

    class Meta:
        ordering = ["start"]
        constraints = [
            models.CheckConstraint(condition=models.Q(end__gt=models.F("start")), name="time_off_end_after_start"),
        ]
        verbose_name = "отсъствие"
        verbose_name_plural = "отсъствия"

    def __str__(self):
        return f"{self.specialist}: {self.start:%d.%m.%Y %H:%M} – {self.end:%d.%m.%Y %H:%M}"

    def clean(self):
        super().clean()
        if self.start and self.end and self.end <= self.start:
            raise ValidationError({"end": "Краят трябва да е след началото."})
