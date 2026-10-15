import uuid

from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """A chat with the AI assistant on the website.

    `messages` is the exact history sent to the Claude API (tool calls included), so it is never
    shown as is; `transcript` is what the visitor sees. The id is the secret that lets the browser
    continue the conversation.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="assistant_conversations",
        verbose_name="потребител",
    )
    messages = models.JSONField("история за модела", default=list, blank=True)
    transcript = models.JSONField("разговор", default=list, blank=True)
    # Facts the model has to learn on its next turn, e.g. that the visitor confirmed a booking.
    pending_notes = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField("започнат", auto_now_add=True)
    updated_at = models.DateTimeField("последно съобщение", auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "разговор с асистента"
        verbose_name_plural = "разговори с асистента"

    def __str__(self):
        first = next((m["text"] for m in self.transcript if m.get("role") == "user"), "")
        return first[:80] or str(self.id)

    @property
    def user_turns(self):
        return sum(1 for m in self.transcript if m.get("role") == "user")


class BookingProposal(models.Model):
    """A booking the assistant suggested. It becomes a booking only when the visitor confirms it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="proposals", verbose_name="разговор"
    )
    items = models.JSONField("услуги", help_text='[{"service": id, "specialist": id}]')
    parallel = models.BooleanField("едновременно", default=False)
    start_at = models.DateTimeField("начало")
    note = models.CharField("бележка", max_length=1000, blank=True)
    # What the visitor is shown on the card: service and specialist names, times and prices.
    summary = models.JSONField("обобщение", default=dict)
    booking = models.OneToOneField(
        "bookings.Booking",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assistant_proposal",
        verbose_name="резервация",
    )
    created_at = models.DateTimeField("създадено", auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "предложение за час"
        verbose_name_plural = "предложения за час"

    def __str__(self):
        return f"{self.start_at:%d.%m.%Y %H:%M}"
