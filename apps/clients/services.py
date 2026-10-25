"""Client accounts: profile, messages with the salon, export and deletion of personal data (GDPR)."""

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Client, Message
from .phone import normalize_phone

PHONE_TAKEN = (
    "Този телефон вече е записан в салона. Помолете салона да впише имейла, с който влизате, към вашия запис"
    " – профилът ще се свърже сам с досегашните ви посещения."
)


class ProfileError(Exception):
    """The profile change is not allowed; the message is shown to the client."""


def client_for(user):
    """The client record of a logged-in client account, linking an existing record when it can."""
    client = Client.objects.filter(user=user).first()
    if client is None:
        client = link_by_email(user)
    return client


def link_by_email(user):
    """Attach the salon's existing client record to an account that has none yet.

    The salon may add the client (a booking from the staff calendar, a guest booking) before or
    after the account is made, so this runs whenever the account's record is looked up, not only
    at login. Only by the verified email: a phone number typed into a form proves nothing, so a
    match by phone alone never links (the salon can link it by hand in the admin). An email on more
    than one record is ambiguous and links nothing.
    """
    if user is None or not user.is_authenticated or user.is_staff or not user.email:
        return None
    if Client.objects.filter(user=user).exists():
        return None
    matches = list(Client.objects.filter(email=user.email.strip().lower(), user__isnull=True)[:2])
    if len(matches) != 1:
        return None
    client = matches[0]
    client.user = user
    client.save(update_fields=["user"])
    return client


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
                {"service": item.service.display_name, "specialist": item.specialist.name, "price": str(item.price)}
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
    if from_client:
        notify_salon(message)
    push_message(message)
    return message


def push_message(message):
    """A notification on the phone: to the client's devices, or to the team's when the client wrote."""
    from apps.push.services import notify, staff_users

    client = message.client
    if message.from_client:
        notify(
            staff_users(),
            title=client.full_name,
            body=message.text,
            url=f"/personal/saobshtenia?client={client.pk}",
            tag=f"client-{client.pk}",
        )
    elif client.user_id:
        notify(
            [client.user],
            title=f"{staff_display_name(message.sender)} от SIS Esthetics",
            body=message.text,
            url="/profil/saobshtenia",
            tag="salon",
        )


def notify_salon(message):
    """Tell the salon a client wrote, at the salon's email from the settings page.

    One email until the salon opens the conversation: further messages before that add nothing new to do.
    """
    from apps.salon.models import SalonInfo

    unread_before = message.client.messages.filter(from_client=True, read_at__isnull=True).exclude(pk=message.pk)
    if unread_before.exists():
        return
    salon = SalonInfo.load()
    if salon is None or not salon.email:
        return
    client = message.client
    send_mail(
        subject=f"Ново съобщение от {client.full_name}",
        message=(
            f"{client.full_name} ({client.phone}) писа:\n\n{message.text}\n\n"
            f"Отговорете от календара: {settings.FRONTEND_URL}/personal/saobshtenia"
        ),
        from_email=None,
        recipient_list=[salon.email],
        fail_silently=True,
    )


def mark_read(client, *, by_client, now=None):
    """The reader has opened the conversation: the other side's messages are now read."""
    now = now or timezone.now()
    client.messages.filter(from_client=not by_client, read_at__isnull=True).update(read_at=now)
