"""Passwordless login for clients: a one-time code by email, or Google."""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.models import F
from django.utils import timezone

from apps.clients.services import link_by_email

from .models import LoginCode

# A new code is not sent to the same address more often than this.
RESEND_SECONDS = 60


class AuthError(Exception):
    """A login attempt failed; the message is shown to the client."""


def normalize_email(email):
    return (email or "").strip().lower()


def _hash(email, code):
    return hmac.new(settings.SECRET_KEY.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def any_code_allowed():
    """Testing mode: every code logs in. Follows DEBUG unless LOGIN_ANY_CODE is set."""
    flag = settings.LOGIN_ANY_CODE
    return settings.DEBUG if flag is None else flag


def send_login_code(email, now=None):
    now = now or timezone.now()
    email = normalize_email(email)
    if LoginCode.objects.filter(email=email, created_at__gte=now - timedelta(seconds=RESEND_SECONDS)).exists():
        return
    code = f"{secrets.randbelow(10**6):06d}"
    LoginCode.objects.create(email=email, code_hash=_hash(email, code))
    minutes = settings.LOGIN_CODE_TTL_MINUTES
    send_mail(
        subject=f"Код за вход: {code}",
        message=(
            f"Вашият код за вход в sisesthetics.com е {code}.\n\n"
            f"Кодът важи {minutes} минути. Ако не сте го поискали вие, просто игнорирайте това писмо.\n\n"
            "SIS Esthetics Hair"
        ),
        from_email=None,
        recipient_list=[email],
    )


def verify_login_code(email, code, now=None):
    """Check the code and return the user it logs in (created on first login)."""
    now = now or timezone.now()
    email = normalize_email(email)
    code = (code or "").strip()
    if any_code_allowed():
        if not code:
            raise AuthError("Въведете код.")
        return user_for_email(email)
    ttl = timedelta(minutes=settings.LOGIN_CODE_TTL_MINUTES)
    login_code = LoginCode.objects.filter(email=email, used_at__isnull=True, created_at__gte=now - ttl).first()
    if login_code is None:
        raise AuthError("Кодът е изтекъл или вече е използван. Поискайте нов.")
    if login_code.attempts >= settings.LOGIN_CODE_MAX_ATTEMPTS:
        raise AuthError("Твърде много грешни опити. Поискайте нов код.")
    if not hmac.compare_digest(_hash(email, code), login_code.code_hash):
        LoginCode.objects.filter(pk=login_code.pk).update(attempts=F("attempts") + 1)
        raise AuthError("Грешен код. Проверете писмото и опитайте отново.")
    login_code.used_at = now
    login_code.save(update_fields=["used_at"])
    return user_for_email(email)


def user_for_email(email, first_name="", last_name=""):
    """The client account for a verified email address."""
    email = normalize_email(email)
    User = get_user_model()
    user = User.objects.filter(email__iexact=email).order_by("pk").first()
    if user is None:
        username = email[:150]
        if User.objects.filter(username=username).exists():
            username = f"{email[:140]}-{secrets.token_hex(4)}"
        user = User.objects.create_user(
            username=username, email=email, first_name=first_name[:150], last_name=last_name[:150]
        )
    if user.is_staff:
        raise AuthError("Служителите влизат от страницата за персонала.")
    if not user.is_active:
        raise AuthError("Този профил е деактивиран. Моля, свържете се със салона.")
    link_client(user)
    return user


def link_client(user):
    """Attach the salon's existing client record (earlier bookings as a guest) to the account."""
    return link_by_email(user)
