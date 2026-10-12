"""Client accounts: profile, messages with the salon, export and deletion of personal data (GDPR)."""

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Client, Message
from .phone import normalize_phone

PHONE_TAKEN = (
    "Този телефон вече е записан в салона. Обадете се ни, за да свържем профила ви с досегашните ви посещения."
)


class ProfileError(Exception):
    """The profile change is not allowed; the message is shown to the client."""


def client_for(user):
    return Client.objects.filter(user=user).first()


def staff_display_name(user):
    """How a team member signs messages: their specialist name if they have one."""
    if user is None:
        return "SIS Esthetics"
    specialist = getattr(user, "specialist", None)
    return (specialist.name if specialist else user.get_full_name()) or "SIS Esthetics"


# --- profile ---------------------------------------------------------------------


def update_profile(user, data, now=None):
    """Create or change the client record of a logged-in user.

    `data` may hold first_name, last_name, phone, preferred_specialist, reminder_channel,
    marketing_consent and privacy_consent (required when the record is created).
    """
    now = now or timezone.now()
    client = client_for(user)

    phone = None
    if "phone" in data:
        phone = normalize_phone(data["phone"])
        if not phone:
            raise ProfileError("Моля, въведете телефон.")
        taken = Client.objects.filter(phone=phone)
        if client is not None:
            taken = taken.exclude(pk=client.pk)
        if taken.exists():
            raise ProfileError(PHONE_TAKEN)

    if client is None:
        if not phone or not (data.get("first_name") or "").strip():
            raise ProfileError("Моля, попълнете име и телефон.")
        if not data.get("privacy_consent"):
            raise ProfileError("Необходимо е съгласие с политиката за поверителност.")
        client = Client(user=user, email=user.email, phone=phone)

    for field in ("first_name", "last_name", "preferred_specialist", "reminder_channel"):
        if field in data:
            setattr(client, field, data[field])
    if phone:
        client.phone = phone
    if not client.email:
        client.email = user.email
    if data.get("privacy_consent") and client.privacy_consent_at is None:
        client.give_privacy_consent(now)
    if "marketing_consent" in data:
        client.marketing_consent_at = (client.marketing_consent_at or now) if data["marketing_consent"] else None
    client.save()
    return client


def delete_account(user, now=None):
    """Delete the login and anonymise the client record.

    Visits stay (without personal data) so the salon's statistics and accounting add up;
    future visits are cancelled.
    """
    from apps.bookings.models import BookingStatus, CancelledBy

    now = now or timezone.now()
    client = client_for(user)
    if client is not None:
        client.bookings.filter(status=BookingStatus.CONFIRMED, start_at__gt=now).update(
            status=BookingStatus.CANCELLED,
            cancelled_at=now,
            cancelled_by=CancelledBy.CLIENT,
            cancellation_reason="Изтрит профил",
        )
        client.bookings.update(note="", internal_note="")
        client.messages.all().delete()
        client.private_notes.all().delete()
        # update() skips save(), which would turn the placeholder into a phone number.
        Client.objects.filter(pk=client.pk).update(
            user=None,
            first_name="Изтрит",
            last_name="клиент",
            nickname="",
            phone=f"deleted-{client.pk}",
            email="",
            notes="",
            blocked_reason="",
            privacy_consent_at=None,
            privacy_consent_version="",
            marketing_consent_at=None,
            preferred_specialist=None,
        )
    user.delete()


def export_data(user, now=None):
    """Everything the platform keeps about the user, as JSON-ready data (GDPR art. 15 and 20)."""
    now = now or timezone.now()
    client = client_for(user)
    data = {
        "exported_at": now.isoformat(),
        "account": {
            "email": user.email,
            "created_at": user.date_joined.isoformat(),
            "last_login": user.last_login.isoformat() if user.last_login else None,
        },
        "profile": None,
        "bookings": [],
        "messages": [],
    }
    if client is None:
        return data
    data["profile"] = {
        "first_name": client.first_name,
        "last_name": client.last_name,
        "phone": client.phone,
        "email": client.email,
        "preferred_specialist": client.preferred_specialist.name if client.preferred_specialist else None,
        "reminder_channel": client.reminder_channel,
        "privacy_consent_at": client.privacy_consent_at.isoformat() if client.privacy_consent_at else None,
        "privacy_consent_version": client.privacy_consent_version,
        "marketing_consent_at": client.marketing_consent_at.isoformat() if client.marketing_consent_at else None,
        "created_at": client.created_at.isoformat(),
    }
    bookings = client.bookings.prefetch_related("items__service", "items__specialist").order_by("start_at")
    data["bookings"] = [
        {
            "start": booking.start_at.isoformat(),
            "status": booking.status,
            "note": booking.note,
            "services": [
                {"service": item.service.name, "specialist": item.specialist.name, "price": str(item.price)}
                for item in booking.items.all()
            ],
        }
        for booking in bookings
    ]
    data["messages"] = [
        {
            "from": "client" if message.from_client else staff_display_name(message.sender),
            "text": message.text,
            "sent_at": message.created_at.isoformat(),
        }
        for message in client.messages.select_related("sender__specialist")
    ]
    return data


# --- messages --------------------------------------------------------------------


def post_message(client, text, *, sender=None, from_client=False):
    message = Message.objects.create(client=client, text=text.strip(), sender=sender, from_client=from_client)
    if not from_client and client.email:
        send_mail(
            subject="Ново съобщение от SIS Esthetics",
            message=(
                f"{staff_display_name(sender)} ви писа:\n\n{message.text}\n\n"
                f"Отговорете от профила си: {settings.FRONTEND_URL}/profil/saobshtenia"
            ),
            from_email=None,
            recipient_list=[client.email],
            fail_silently=True,
        )
    return message


def mark_read(client, *, by_client, now=None):
    """The reader has opened the conversation: the other side's messages are now read."""
    now = now or timezone.now()
    client.messages.filter(from_client=not by_client, read_at__isnull=True).update(read_at=now)
