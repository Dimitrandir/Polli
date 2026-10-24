"""Client login API: who is logged in, a code by email, Google, logout."""

from django.conf import settings
from django.contrib.auth import login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.clients.models import Client

from .google import verify_google_credential
from .services import AuthError, any_code_allowed, send_login_code, user_for_email, verify_login_code

BACKEND = "django.contrib.auth.backends.ModelBackend"


class IsClientUser(permissions.BasePermission):
    """A logged-in client. Staff accounts use the staff side (/personal) instead."""

    message = "Моля, влезте в профила си."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and not user.is_staff)


def session_payload(user):
    payload = {"authenticated": False, "user": None, "google_client_id": settings.GOOGLE_CLIENT_ID}
    if not (user.is_authenticated and not user.is_staff):
        return payload
    client = Client.objects.filter(user=user).first()
    unread = client.messages.filter(from_client=False, read_at__isnull=True).count() if client else 0
    payload["authenticated"] = True
    payload["user"] = {
        "email": user.email,
        "name": client.full_name if client else user.get_full_name(),
        "has_profile": client is not None,
        "unread_messages": unread,
    }
    return payload


def _error(exc):
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    """Who is logged in. Also sets the CSRF cookie the login forms need."""

    def get(self, request):
        return Response(session_payload(request.user))


class EmailSerializer(serializers.Serializer):
    email = serializers.EmailField()


class CodeSerializer(EmailSerializer):
    code = serializers.CharField(max_length=12)


class GoogleSerializer(serializers.Serializer):
    credential = serializers.CharField(max_length=4096)


class EmailCodeRequestView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login_code"

    def post(self, request):
        data = EmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if any_code_allowed():
            return Response({"detail": "Тестов режим: въведете който и да е 6-цифрен код."})
        send_login_code(data.validated_data["email"])
        return Response({"detail": "Изпратихме ви код за вход. Проверете пощата си (и папка „Спам“)."})


class EmailCodeLoginView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        data = CodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            user = verify_login_code(data.validated_data["email"], data.validated_data["code"])
        except AuthError as exc:
            return _error(exc)
        login(request, user, backend=BACKEND)
        return Response(session_payload(user))


class GoogleLoginView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        data = GoogleSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            info = verify_google_credential(data.validated_data["credential"])
            user = user_for_email(**info)
        except AuthError as exc:
            return _error(exc)
        login(request, user, backend=BACKEND)
        return Response(session_payload(user))


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(session_payload(request.user))
