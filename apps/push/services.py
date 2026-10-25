"""Web Push: notifications on the phone or computer, shown by the browser even when the site is closed.

Free and without an app store: the browser's own push service (Google, Apple, Mozilla) delivers them.
Needs VAPID keys (`manage.py generate_vapid_keys`); without them push is simply off.
"""

import json
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from pywebpush import WebPushException, webpush

from .models import PushSubscription

logger = logging.getLogger(__name__)

# The push service keeps an undelivered notification this long (seconds) while the phone is offline.
TTL = 24 * 60 * 60


def is_enabled():
    return bool(settings.PUSH["PUBLIC_KEY"] and settings.PUSH["PRIVATE_KEY"])


def subscribe(user, *, endpoint, p256dh, auth, user_agent=""):
    """Remember this browser for the account. A browser that was someone else's moves to this account."""
    subscription, _ = PushSubscription.objects.update_or_create(
        endpoint=endpoint, defaults={"user": user, "p256dh": p256dh, "auth": auth, "user_agent": user_agent[:300]}
    )
    return subscription


def unsubscribe(user, endpoint):
    PushSubscription.objects.filter(user=user, endpoint=endpoint).delete()


def _send(subscription, payload):
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.PUSH["PRIVATE_KEY"],
            vapid_claims={"sub": f"mailto:{settings.PUSH['CONTACT']}"},
            ttl=TTL,
            timeout=5,
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            # The browser dropped the subscription (notifications turned off, app removed).
            subscription.delete()
        else:
            logger.warning("Push to %s failed: %s", subscription.pk, exc)
    except Exception:
        logger.exception("Push to %s failed", subscription.pk)


def notify(users, *, title, body, url, tag=""):
    """Show a notification on every device of these users, after the current change is saved."""
    if not is_enabled():
        return
    user_ids = [u.pk for u in users if u is not None]
    if not user_ids:
        return
    payload = {"title": title, "body": body[:200], "url": url, "tag": tag}

    def send():
        for subscription in PushSubscription.objects.filter(user_id__in=user_ids):
            _send(subscription, payload)

    transaction.on_commit(send)


def staff_users():
    return get_user_model().objects.filter(is_staff=True, is_active=True)
