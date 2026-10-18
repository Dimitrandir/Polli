"""The salon team's side of clients: the client card, private notes and messages."""

from django.db.models import Count, Max, OuterRef, Q, Subquery, Sum
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.models import BookingItem, BookingStatus
from apps.bookings.staff_api import IsSalonStaff

from .api import MESSAGE_MAX_LENGTH, MessageSerializer, NewMessageSerializer, conversation
from .models import Client, ClientNote, Message
from .phone import normalize_phone
from .services import mark_read, post_message

INBOX_LIMIT = 50
CARD_BOOKINGS = 100
NO_ACCOUNT = "Клиентът няма профил на сайта, затова не може да получава съобщения. Обадете се по телефона."


class ClientNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientNote
        fields = ["id", "text", "created_at", "updated_at"]


class NoteInputSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=MESSAGE_MAX_LENGTH)


class ClientUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100, required=False)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    nickname = serializers.CharField(max_length=100, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    is_blocked = serializers.BooleanField(required=False)
    blocked_reason = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_first_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Въведете име.")
        return value

    def validate_phone(self, value):
        phone = normalize_phone(value)
        if len(phone) < 8:
            raise serializers.ValidationError("Въведете валиден телефон.")
        return phone


def client_card(client, user):
    bookings = client.bookings.prefetch_related("items__service", "items__specialist").order_by("-start_at")[
        :CARD_BOOKINGS
    ]
    counts = client.bookings.aggregate(
        visits=Count("pk", filter=Q(status=BookingStatus.COMPLETED)),
        no_shows=Count("pk", filter=Q(status=BookingStatus.NO_SHOW)),
        cancelled=Count("pk", filter=Q(status=BookingStatus.CANCELLED)),
        last_visit=Max("start_at", filter=Q(status=BookingStatus.COMPLETED)),
    )
    spent = BookingItem.objects.filter(booking__client=client, booking__status=BookingStatus.COMPLETED).aggregate(
        total=Sum("price")
    )["total"]
    return {
        "id": client.pk,
        "name": client.full_name,
        "first_name": client.first_name,
        "last_name": client.last_name,
        "nickname": client.nickname,
        "phone": client.phone,
        "email": client.email,
        "notes": client.notes,
        "is_blocked": client.is_blocked,
        "blocked_reason": client.blocked_reason,
        "created_at": client.created_at,
        "stats": {**counts, "spent": f"{spent or 0:.2f}"},
        "has_account": client.user_id is not None,
        "preferred_specialist": client.preferred_specialist.name if client.preferred_specialist else None,
        "my_notes": ClientNoteSerializer(client.private_notes.filter(author=user), many=True).data,
        "bookings": [
            {
                "id": b.pk,
                "start": b.start_at,
                "status": b.status,
                "services": ", ".join(item.service.display_name for item in b.items.all()),
                "specialists": ", ".join(dict.fromkeys(item.specialist.name for item in b.items.all())),
                "total": f"{sum((item.price for item in b.items.all()), start=0):.2f}",
            }
            for b in bookings
        ],
        "unread_messages": client.messages.filter(from_client=True, read_at__isnull=True).count(),
    }


class StaffClientDetailView(APIView):
    """The client card: contacts, nickname, salon notes, my own notes and recent visits."""

    permission_classes = [IsSalonStaff]

    def get(self, request, pk):
        client = get_object_or_404(Client.objects.select_related("preferred_specialist"), pk=pk)
        return Response(client_card(client, request.user))

    def patch(self, request, pk):
        client = get_object_or_404(Client, pk=pk)
        data = ClientUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if "phone" in v and Client.objects.filter(phone=v["phone"]).exclude(pk=client.pk).exists():
            return Response(
                {"detail": "Друг клиент вече е с този телефон. Потърсете го в клиентите."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        blocked = v.pop("is_blocked", None)
        reason = v.pop("blocked_reason", None)
        for field, value in v.items():
            setattr(client, field, value.strip())
        client.save()
        if blocked is True and not client.is_blocked:
            client.block(reason or "")
        elif blocked is False and client.is_blocked:
            client.unblock()
        elif reason is not None and client.is_blocked:
            client.blocked_reason = reason
            client.save(update_fields=["blocked_reason"])
        return Response(client_card(client, request.user))


class StaffClientNotesView(APIView):
    """My private notes about a client. Other team members do not see them."""

    permission_classes = [IsSalonStaff]

    def get(self, request, pk):
        notes = ClientNote.objects.filter(client_id=pk, author=request.user)
        return Response(ClientNoteSerializer(notes, many=True).data)

    def post(self, request, pk):
        client = get_object_or_404(Client, pk=pk)
        data = NoteInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        note = ClientNote.objects.create(client=client, author=request.user, text=data.validated_data["text"])
        return Response(ClientNoteSerializer(note).data, status=status.HTTP_201_CREATED)


class StaffNoteDetailView(APIView):
    permission_classes = [IsSalonStaff]

    def patch(self, request, pk):
        note = get_object_or_404(ClientNote, pk=pk, author=request.user)
        data = NoteInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        note.text = data.validated_data["text"]
        note.save()
        return Response(ClientNoteSerializer(note).data)

    def delete(self, request, pk):
        get_object_or_404(ClientNote, pk=pk, author=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffClientMessagesView(APIView):
    """The conversation with one client. Opening it marks the client's messages as read."""

    permission_classes = [IsSalonStaff]

    def get(self, request, pk):
        client = get_object_or_404(Client, pk=pk)
        mark_read(client, by_client=False)
        return Response(MessageSerializer(conversation(client), many=True).data)

    def post(self, request, pk):
        client = get_object_or_404(Client, pk=pk)
        if client.user_id is None:
            return Response({"detail": NO_ACCOUNT}, status=status.HTTP_400_BAD_REQUEST)
        data = NewMessageSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        message = post_message(client, data.validated_data["text"], sender=request.user)
        message = conversation(client).get(pk=message.pk)
        return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)


class StaffInboxView(APIView):
    """Conversations with clients, the most recent first, with the number of unread messages."""

    permission_classes = [IsSalonStaff]

    def get(self, request):
        last = Message.objects.filter(client=OuterRef("pk")).order_by("-created_at", "-pk")
        clients = (
            Client.objects.annotate(
                last_message_at=Max("messages__created_at"),
                unread=Count("messages", filter=Q(messages__from_client=True, messages__read_at__isnull=True)),
                last_text=Subquery(last.values("text")[:1]),
                last_from_client=Subquery(last.values("from_client")[:1]),
            )
            .filter(last_message_at__isnull=False)
            .order_by("-last_message_at")[:INBOX_LIMIT]
        )
        conversations = [
            {
                "client": {"id": c.pk, "name": c.full_name, "nickname": c.nickname, "phone": c.phone},
                "last_message": {
                    "text": c.last_text,
                    "from_client": c.last_from_client,
                    "created_at": c.last_message_at,
                },
                "unread": c.unread,
            }
            for c in clients
        ]
        unread_total = Message.objects.filter(from_client=True, read_at__isnull=True).count()
        return Response({"unread_total": unread_total, "conversations": conversations})
