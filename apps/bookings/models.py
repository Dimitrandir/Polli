import uuid

from django.core.exceptions import ValidationError
from django.db import models
from django.utils.timezone import localtime


class BookingStatus(models.TextChoices):
    CONFIRMED = "confirmed", "потвърдена"
    COMPLETED = "completed", "изпълнена"
    NO_SHOW = "no_show", "неявяване"
    CANCELLED = "cancelled", "отказана"


class BookingSource(models.TextChoices):
    ONLINE = "online", "онлайн"
    SALON = "salon", "от салона"


class CancelledBy(models.TextChoices):
    CLIENT = "client", "клиент"
    SALON = "salon", "салон"


# Bookings in these states keep their time slots occupied.
OCCUPYING_STATUSES = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW]


class Booking(models.Model):
    """One visit of a client. It holds one or more services (items)."""

    client = models.ForeignKey(
        "clients.Client", on_delete=models.PROTECT, related_name="bookings", verbose_name="клиент"
    )
    status = models.CharField("статус", max_length=20, choices=BookingStatus.choices, default=BookingStatus.CONFIRMED)
    source = models.CharField("източник", max_length=20, choices=BookingSource.choices, default=BookingSource.ONLINE)
    start_at = models.DateTimeField("начало", db_index=True)
    end_at = models.DateTimeField("край")
    note = models.TextField("бележка от клиента", blank=True)
    internal_note = models.TextField("вътрешна бележка", blank=True)
    cancel_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    cancelled_at = models.DateTimeField("отказана на", null=True, blank=True)
    cancelled_by = models.CharField("отказана от", max_length=20, choices=CancelledBy.choices, blank=True)
    cancellation_reason = models.CharField("причина за отказ", max_length=255, blank=True)
    created_at = models.DateTimeField("създадена", auto_now_add=True)
    updated_at = models.DateTimeField("обновена", auto_now=True)

    class Meta:
        ordering = ["-start_at"]
        verbose_name = "резервация"
        verbose_name_plural = "резервации"

    def __str__(self):
        return f"{self.client.full_name} – {self.start_at:%d.%m.%Y %H:%M}"

    @property
    def total_price(self):
        return sum((item.price for item in self.items.all()), start=0)

    def refresh_time_range(self):
        """Recompute start/end from the items (used after editing items in the admin)."""
        bounds = self.items.aggregate(start=models.Min("start_at"), end=models.Max("end_at"))
        if bounds["start"]:
            self.start_at, self.end_at = bounds["start"], bounds["end"]
            self.save(update_fields=["start_at", "end_at", "updated_at"])


class BookingItem(models.Model):
    """One service inside a booking, done by one specialist at a specific time."""

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="items", verbose_name="резервация")
    service = models.ForeignKey("catalog.Service", on_delete=models.PROTECT, related_name="+", verbose_name="услуга")
    specialist = models.ForeignKey(
        "staff.Specialist", on_delete=models.PROTECT, related_name="booking_items", verbose_name="специалист"
    )
    start_at = models.DateTimeField("начало")
    end_at = models.DateTimeField("край")
    # The specialist stays busy until this time (end + preparation buffer).
    busy_until = models.DateTimeField("зает до")
    # Snapshots, so later price list changes do not alter past bookings.
    price = models.DecimalField("цена (EUR)", max_digits=8, decimal_places=2)
    duration_minutes = models.PositiveIntegerField("продължителност (мин.)")

    class Meta:
        ordering = ["start_at"]
        indexes = [models.Index(fields=["specialist", "start_at"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_at__gt=models.F("start_at")), name="booking_item_end_after_start"
            ),
            models.CheckConstraint(
                condition=models.Q(busy_until__gte=models.F("end_at")), name="booking_item_busy_after_end"
            ),
        ]
        verbose_name = "услуга в резервация"
        verbose_name_plural = "услуги в резервацията"

    def __str__(self):
        return f"{self.service} – {self.specialist} ({self.start_at:%H:%M})"

    def clean(self):
        """Admin-side guard against double-booking a specialist."""
        super().clean()
        if not (self.start_at and self.end_at and self.specialist_id):
            return
        if self.end_at <= self.start_at:
            raise ValidationError({"end_at": "Краят трябва да е след началото."})
        busy_until = self.busy_until or self.end_at
        clash = (
            BookingItem.objects.filter(
                specialist_id=self.specialist_id,
                booking__status__in=OCCUPYING_STATUSES,
                start_at__lt=busy_until,
                busy_until__gt=self.start_at,
            )
            .exclude(pk=self.pk)
            .exclude(booking_id=self.booking_id)
            .select_related("booking__client")
            .first()
        )
        if clash:
            raise ValidationError(
                f"{self.specialist} вече е зает(а) в този интервал: {clash.booking.client.full_name}, "
                f"{localtime(clash.start_at):%H:%M}–{localtime(clash.end_at):%H:%M}."
            )
