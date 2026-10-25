import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from pywebpush import WebPushException
from rest_framework.test import APIClient

from apps.clients.models import Client
from apps.clients.services import post_message

from .models import PushSubscription

KEYS = {"PUBLIC_KEY": "BPublic", "PRIVATE_KEY": "private", "CONTACT": "info@sisesthetics.com"}
NO_KEYS = {"PUBLIC_KEY": "", "PRIVATE_KEY": "", "CONTACT": "info@sisesthetics.com"}


def subscription(user, n=1):
    return PushSubscription.objects.create(
        user=user, endpoint=f"https://push.example.com/{user.pk}-{n}", p256dh="p", auth="a"
    )


@override_settings(PUSH=KEYS)
class PushApiTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.user = get_user_model().objects.create_user("maria@example.com", email="maria@example.com")

    def test_status_gives_the_key(self):
        self.assertEqual(self.api.get(reverse("api:push-status")).json(), {"enabled": True, "public_key": "BPublic"})
        with override_settings(PUSH=NO_KEYS):
            self.assertEqual(self.api.get(reverse("api:push-status")).json(), {"enabled": False, "public_key": ""})

    def test_subscribe_and_unsubscribe(self):
        payload = {"endpoint": "https://push.example.com/abc", "keys": {"p256dh": "key", "auth": "secret"}}
        self.assertEqual(self.api.post(reverse("api:push-subscribe"), payload, format="json").status_code, 403)

        self.api.force_authenticate(self.user)
        response = self.api.post(reverse("api:push-subscribe"), payload, format="json", HTTP_USER_AGENT="iPhone")
        self.assertEqual(response.status_code, 201)
        saved = PushSubscription.objects.get()
        self.assertEqual(
            (saved.user, saved.p256dh, saved.auth, saved.user_agent), (self.user, "key", "secret", "iPhone")
        )

        # The same browser again only refreshes its keys.
        payload["keys"]["auth"] = "new"
        self.api.post(reverse("api:push-subscribe"), payload, format="json")
        self.assertEqual(PushSubscription.objects.get().auth, "new")

        self.api.post(reverse("api:push-unsubscribe"), {"endpoint": payload["endpoint"]}, format="json")
        self.assertFalse(PushSubscription.objects.exists())


@override_settings(PUSH=KEYS)
@mock.patch("apps.push.services.webpush")
class MessagePushTests(TestCase):
    def setUp(self):
        users = get_user_model().objects
        self.client_user = users.create_user("maria@example.com", email="maria@example.com")
        self.staff = users.create_user("poli", is_staff=True)
        self.former = users.create_user("old", is_staff=True, is_active=False)
        self.client_obj = Client.objects.create(
            first_name="Мария", last_name="Иванова", phone="0888 123 456", user=self.client_user
        )

    def sent(self, webpush):
        calls = webpush.call_args_list
        return [(c.kwargs["subscription_info"]["endpoint"], json.loads(c.kwargs["data"])) for c in calls]

    def test_client_message_goes_to_the_team(self, webpush):
        subscription(self.staff)
        subscription(self.former)
        subscription(self.client_user)
        with self.captureOnCommitCallbacks(execute=True):
            post_message(self.client_obj, "Може ли в петък?", from_client=True)
        [(endpoint, payload)] = self.sent(webpush)
        self.assertEqual(endpoint, f"https://push.example.com/{self.staff.pk}-1")
        self.assertEqual(payload["title"], "Мария Иванова")
        self.assertEqual(payload["body"], "Може ли в петък?")
        self.assertEqual(payload["url"], f"/personal/saobshtenia?client={self.client_obj.pk}")

    def test_salon_message_goes_to_every_device_of_the_client(self, webpush):
        subscription(self.client_user, 1)
        subscription(self.client_user, 2)
        subscription(self.staff)
        with self.captureOnCommitCallbacks(execute=True):
            post_message(self.client_obj, "Да, в 10:00.", sender=self.staff)
        sent = self.sent(webpush)
        self.assertEqual(len(sent), 2)
        self.assertEqual(sent[0][1]["url"], "/profil/saobshtenia")
        self.assertIn("SIS Esthetics", sent[0][1]["title"])

    def test_gone_device_is_forgotten(self, webpush):
        gone = subscription(self.client_user)
        webpush.side_effect = WebPushException("Gone", response=mock.Mock(status_code=410))
        with self.captureOnCommitCallbacks(execute=True):
            post_message(self.client_obj, "Здравейте", sender=self.staff)
        self.assertFalse(PushSubscription.objects.filter(pk=gone.pk).exists())

    def test_other_failures_keep_the_device_and_the_message(self, webpush):
        subscription(self.client_user)
        webpush.side_effect = WebPushException("Server error", response=mock.Mock(status_code=500))
        with self.assertLogs("apps.push.services", "WARNING"), self.captureOnCommitCallbacks(execute=True):
            message = post_message(self.client_obj, "Здравейте", sender=self.staff)
        self.assertTrue(PushSubscription.objects.exists())
        self.assertTrue(message.pk)

    @override_settings(PUSH=NO_KEYS)
    def test_off_without_keys(self, webpush):
        subscription(self.client_user)
        with self.captureOnCommitCallbacks(execute=True):
            post_message(self.client_obj, "Здравейте", sender=self.staff)
        webpush.assert_not_called()
