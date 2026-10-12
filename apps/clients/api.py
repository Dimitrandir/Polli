"""The logged-in client's own data: profile, messages with the salon, export and deletion."""

import json

from django.contrib.auth import logout
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.api import IsClientUser
from apps.staff.models import Specialist

from .models import Message, ReminderChannel
from .services import (
    ProfileError,
    client_for,
    delete_account,
    export_data,
    mark_read,
    post_message,
    staff_display_name,
    update_profile,
)

MESSAGE_MAX_LENGTH = 2000


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": str(message)}, status=code)


def profile_payload(user):
    client = client_for(user)
    if client is None:
        return {
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone": "",
            "preferred_specialist": None,
            "reminder_channel": ReminderChannel.EMAIL,
            "privacy_consent": False,
            "marketing_consent": False,
            "complete": False,
        }
    return {
        "email": user.email,
        "first_name": client.first_name,
        "last_name": client.last_name,
        "phone": client.phone,
        "preferred_specialist": client.preferred_specialist_id,
        "reminder_channel": client.reminder_channel,
        "privacy_consent": client.privacy_consent_at is not None,
        "marketing_consent": client.marketing_consent_at is not None,
        "complete": True,
    }


class ProfileSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100, required=False)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False)
    preferred_specialist = serializers.PrimaryKeyRelatedField(
        queryset=Specialist.objects.filter(is_active=True), required=False, allow_null=True
    )
    reminder_channel = serializers.ChoiceField(choices=ReminderChannel.choices, required=False)
    marketing_consent = serializers.BooleanField(required=False)
    privacy_consent = serializers.BooleanField(required=False)


class ProfileView(APIView):
    """GET the profile, PATCH it (the first PATCH creates it), DELETE the account."""

    permission_classes = [IsClientUser]

    def get(self, request):
        return Response(profile_payload(request.user))

    def patch(self, request):
        data = ProfileSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            update_profile(request.user, data.validated_data)
        except ProfileError as exc:
            return _error(exc)
        return Response(profile_payload(request.user))

    def delete(self, request):
        user = request.user
        logout(request)
        delete_account(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExportView(APIView):
    """Download all personal data as a JSON file."""

    permission_classes = [IsClientUser]

    def get(self, request):
        body = json.dumps(export_data(request.user), ensure_ascii=False, indent=2)
        response = HttpResponse(body, content_type="application/json; charset=utf-8")
        filename = f"sis-esthetics-danni-{timezone.localdate():%Y-%m-%d}.json"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "text", "from_client", "sender_name", "created_at", "read_at"]

    def get_sender_name(self, message):
        return message.client.full_name if message.from_client else staff_display_name(message.sender)


class NewMessageSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=MESSAGE_MAX_LENGTH)


def conversation(client):
    return client.messages.select_related("client", "sender__specialist")


class MyMessagesView(APIView):
    """The conversation with the salon. Opening it marks the salon's messages as read."""

    permission_classes = [IsClientUser]

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "messages"
            return [ScopedRateThrottle()]
        return []

    def get(self, request):
        client = client_for(request.user)
        if client is None:
            return Response([])
        mark_read(client, by_client=True)
        return Response(MessageSerializer(conversation(client), many=True).data)

    def post(self, request):
        client = client_for(request.user)
        if client is None:
            return _error("Попълнете профила си (име и телефон), за да пишете на салона.")
        data = NewMessageSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        message = post_message(client, data.validated_data["text"], sender=request.user, from_client=True)
        message = conversation(client).get(pk=message.pk)
        return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)
