from django.conf import settings
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services


class PushStatusView(APIView):
    """Whether the server sends notifications, and the key the browser needs to subscribe."""

    authentication_classes = []

    def get(self, request):
        enabled = services.is_enabled()
        return Response({"enabled": enabled, "public_key": settings.PUSH["PUBLIC_KEY"] if enabled else ""})


class KeysSerializer(serializers.Serializer):
    p256dh = serializers.CharField(max_length=200)
    auth = serializers.CharField(max_length=100)


class SubscriptionSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=1000)
    keys = KeysSerializer()


class EndpointSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=1000)


class SubscribeView(APIView):
    """This browser shows notifications for the logged-in client or team member."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = SubscriptionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        services.subscribe(
            request.user,
            endpoint=v["endpoint"],
            p256dh=v["keys"]["p256dh"],
            auth=v["keys"]["auth"],
            user_agent=request.headers.get("User-Agent", ""),
        )
        return Response({"subscribed": True}, status=201)


class UnsubscribeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = EndpointSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.unsubscribe(request.user, data.validated_data["endpoint"])
        return Response({"subscribed": False})
