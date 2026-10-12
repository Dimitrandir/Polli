"""The salon team's side of clients: the client card, private notes and messages."""

from django.db.models import Count, Max, OuterRef, Q, Subquery
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.staff_api import IsSalonStaff

from .api import MESSAGE_MAX_LENGTH, MessageSerializer, NewMessageSerializer, conversation
from .models import Client, ClientNote, Message
from .services import mark_read, post_message

INBOX_LIMIT = 50
CARD_BOOKINGS = 10
NO_ACCOUNT = "Клиентът няма профил на сайта, затова не може да получава съобщения. Обадете се по телефона."


class ClientNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientNote
        fields = ["id", "text", "created_at", "updated_at"]


class NoteInputSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=MESSAGE_MAX_LENGTH)


class ClientUpdateSerializer(serializers.Serializer):
    nickname = serializers.CharField(max_length=100, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000)


def client_card(client, user):
    bookings = client.bookings.prefetch_related("items__service").order_by("-start_at")[:CARD_BOOKINGS]
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
        "has_account": client.user_id is not None,
        "preferred_specialist": client.preferred_specialist.name if client.preferred_specialist else None,
        "my_notes": ClientNoteSerializer(client.private_notes.filter(author=user), many=True).data,
        "bookings": [
            {
                "id": b.pk,
                "start": b.start_at,
                "status": b.status,
                "services": ", ".join(item.service.name for item in b.items.all()),
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
        for field, value in data.validated_data.items():
            setattr(client, field, value.strip())
        client.save()
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
