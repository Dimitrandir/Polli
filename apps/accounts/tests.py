import re
from datetime import timedelta
from unittest import mock
from urllib.error import HTTPError

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.bookings.tests.factories import SalonTestCase
from apps.clients.models import Client

from .models import LoginCode

User = get_user_model()


class AccountTestCase(SalonTestCase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()

    def request_code(self, email="petya@example.com"):
        return self.api.post(reverse("api:auth-email"), {"email": email}, format="json")

    def sent_code(self):
        return re.search(r"\d{6}", mail.outbox[-1].subject).group()

    def verify(self, code, email="petya@example.com"):
        return self.api.post(reverse("api:auth-email-verify"), {"email": email, "code": code}, format="json")

    def session(self):
        return self.api.get(reverse("api:auth-session")).json()


class EmailCodeLoginTests(AccountTestCase):
    def test_login_with_code_creates_the_account(self):
        self.assertFalse(self.session()["authenticated"])
        self.assertEqual(self.request_code("Petya@Example.com ").status_code, 200)
        self.assertEqual(mail.outbox[0].to, ["petya@example.com"])

        response = self.verify(self.sent_code())
        self.assertEqual(response.status_code, 200, response.content)
        session = self.session()
        self.assertTrue(session["authenticated"])
        self.assertEqual(session["user"]["email"], "petya@example.com")
        self.assertFalse(session["user"]["has_profile"])
        self.assertEqual(User.objects.get(email="petya@example.com").has_usable_password(), False)

    def test_code_works_once(self):
        self.request_code()
        code = self.sent_code()
        self.verify(code)
        self.api.post(reverse("api:auth-logout"))
        self.assertEqual(self.verify(code).status_code, 400)

    def test_no_new_code_within_a_minute(self):
        self.request_code()
        self.request_code()
        self.assertEqual(len(mail.outbox), 1)

    def test_wrong_code_and_attempt_limit(self):
        self.request_code()
        code = self.sent_code()
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            response = self.verify(wrong)
            self.assertEqual(response.status_code, 400)
        self.assertIn("Грешен код", response.json()["detail"])
        response = self.verify(code)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Твърде много", response.json()["detail"])
        self.assertFalse(self.session()["authenticated"])

    def test_expired_code(self):
        self.request_code()
        LoginCode.objects.update(created_at=timezone.now() - timedelta(minutes=11))
        response = self.verify(self.sent_code())
        self.assertEqual(response.status_code, 400)
        self.assertIn("изтекъл", response.json()["detail"])

    def test_staff_cannot_use_client_login(self):
        User.objects.create_user("poli", email="poli@example.com", password="x", is_staff=True)
        self.request_code("poli@example.com")
        response = self.verify(self.sent_code(), "poli@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Служителите", response.json()["detail"])

    def test_logout(self):
        self.request_code()
        self.verify(self.sent_code())
        self.api.post(reverse("api:auth-logout"))
        self.assertFalse(self.session()["authenticated"])


class AnyCodeLoginTests(AccountTestCase):
    @override_settings(LOGIN_ANY_CODE=True)
    def test_any_code_logs_in_without_email(self):
        response = self.request_code()
        self.assertIn("Тестов режим", response.json()["detail"])
        self.assertEqual(len(mail.outbox), 0)
        response = self.verify("123456")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(self.session()["authenticated"])

    @override_settings(LOGIN_ANY_CODE=True)
    def test_staff_still_cannot_use_client_login(self):
        User.objects.create_user("poli", email="poli@example.com", password="x", is_staff=True)
        response = self.verify("123456", "poli@example.com")
        self.assertEqual(response.status_code, 400)

    @override_settings(LOGIN_ANY_CODE=None, DEBUG=True)
    def test_follows_debug_when_not_set(self):
        self.assertEqual(self.verify("123456").status_code, 200)

    @override_settings(LOGIN_ANY_CODE=False, DEBUG=True)
    def test_can_be_turned_off(self):
        self.assertEqual(self.verify("123456").status_code, 400)


class LinkGuestBookingsTests(AccountTestCase):
    def test_earlier_guest_record_is_linked_by_verified_email(self):
        self.client_obj.email = "maria@example.com"
        self.client_obj.save()
        self.request_code("maria@example.com")
        self.verify(self.sent_code(), "maria@example.com")
        self.client_obj.refresh_from_db()
        self.assertEqual(self.client_obj.user.email, "maria@example.com")
        self.assertTrue(self.session()["user"]["has_profile"])

    def test_ambiguous_email_is_not_linked(self):
        self.client_obj.email = "family@example.com"
        self.client_obj.save()
        Client.objects.create(first_name="Иван", phone="0899 000 000", email="family@example.com")
        self.request_code("family@example.com")
        self.verify(self.sent_code(), "family@example.com")
        self.assertFalse(Client.objects.filter(user__isnull=False).exists())


@override_settings(GOOGLE_CLIENT_ID="salon.apps.googleusercontent.com")
class GoogleLoginTests(AccountTestCase):
    TOKEN = {
        "aud": "salon.apps.googleusercontent.com",
        "iss": "https://accounts.google.com",
        "email": "Petya@Gmail.com",
        "email_verified": "true",
        "given_name": "Петя",
        "family_name": "Петрова",
    }

    def google(self, info):
        with mock.patch("apps.accounts.google.fetch_token_info", return_value=info):
            return self.api.post(reverse("api:auth-google"), {"credential": "token"}, format="json")

    def test_login_with_google(self):
        self.assertEqual(self.session()["google_client_id"], "salon.apps.googleusercontent.com")
        response = self.google(self.TOKEN)
        self.assertEqual(response.status_code, 200, response.content)
        user = User.objects.get(email="petya@gmail.com")
        self.assertEqual((user.first_name, user.last_name), ("Петя", "Петрова"))
        self.assertTrue(self.session()["authenticated"])

    def test_token_for_another_app_is_refused(self):
        response = self.google({**self.TOKEN, "aud": "someone-else"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.exists())

    def test_unverified_email_is_refused(self):
        self.assertEqual(self.google({**self.TOKEN, "email_verified": "false"}).status_code, 400)

    def test_invalid_token(self):
        error = HTTPError("https://oauth2.googleapis.com/tokeninfo", 400, "Bad Request", {}, None)
        with mock.patch("apps.accounts.google.fetch_token_info", side_effect=error):
            response = self.api.post(reverse("api:auth-google"), {"credential": "bad"}, format="json")
        self.assertEqual(response.status_code, 400)

    @override_settings(GOOGLE_CLIENT_ID="")
    def test_not_configured(self):
        response = self.google(self.TOKEN)
        self.assertEqual(response.status_code, 400)
        self.assertIn("не е настроен", response.json()["detail"])
