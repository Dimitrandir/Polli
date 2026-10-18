from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.bookings.api import BookingWithTokenSerializer, ClientInputSerializer, _booking_queryset
from apps.bookings.availability import BookingError, ItemRequest
from apps.bookings.services import create_booking, resolve_client
from apps.catalog.models import Service
from apps.staff.models import Specialist

from .agent import AssistantUnavailable, run_turn
from .models import BookingProposal, Conversation


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def proposal_payload(proposal):
    data = {"id": str(proposal.pk), **proposal.summary, "note": proposal.note, "booking": None}
    if proposal.booking_id:
        booking = _booking_queryset().get(pk=proposal.booking_id)
        data["booking"] = BookingWithTokenSerializer(booking).data
    return data


def conversation_payload(conversation):
    proposals = {str(p.pk): p for p in conversation.proposals.all()}
    messages = []
    for entry in conversation.transcript:
        message = {"role": entry["role"], "text": entry["text"]}
        if entry.get("proposals"):
            message["proposals"] = [proposal_payload(proposals[i]) for i in entry["proposals"] if i in proposals]
        messages.append(message)
    return {"id": str(conversation.pk), "messages": messages}


def _conversation_for(request, pk):
    conversation = Conversation.objects.filter(pk=pk).first()
    # A conversation that belongs to an account is only shown to that account.
    if conversation is None or (conversation.user_id is not None and conversation.user_id != request.user.pk):
        raise Conversation.DoesNotExist
    return conversation


class StatusView(APIView):
    """Whether the assistant is switched on, so the site shows the chat button only then."""

    authentication_classes = []

    def get(self, request):
        return Response({"enabled": bool(settings.ASSISTANT["API_KEY"])})


class ChatSerializer(serializers.Serializer):
    conversation = serializers.UUIDField(required=False, allow_null=True, default=None)
    message = serializers.CharField(max_length=settings.ASSISTANT["MAX_MESSAGE_CHARS"], trim_whitespace=True)


class ChatView(APIView):
    """Send the visitor's message; returns the whole conversation with the assistant's answer."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "assistant"

    def post(self, request):
        data = ChatSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if not settings.ASSISTANT["API_KEY"]:
            return _error("Асистентът не е включен.", status.HTTP_503_SERVICE_UNAVAILABLE)
        if v["conversation"]:
            try:
                conversation = _conversation_for(request, v["conversation"])
            except Conversation.DoesNotExist:
                return _error("Разговорът не е намерен. Започнете нов.", status.HTTP_404_NOT_FOUND)
        else:
            conversation = Conversation.objects.create(
                user=request.user if request.user.is_authenticated and not request.user.is_staff else None
            )
        try:
            run_turn(conversation, v["message"], user=request.user)
        except AssistantUnavailable as exc:
            return _error(str(exc), status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(conversation_payload(conversation))


class ConversationView(APIView):
    def get(self, request, pk):
        try:
            conversation = _conversation_for(request, pk)
        except Conversation.DoesNotExist:
            return _error("Разговорът не е намерен.", status.HTTP_404_NOT_FOUND)
        return Response(conversation_payload(conversation))


class ConfirmSerializer(serializers.Serializer):
    client = ClientInputSerializer()
    consent = serializers.BooleanField()

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("Необходимо е съгласие с политиката за поверителност.")
        return value


class ConfirmProposalView(APIView):
    """The visitor confirms a time the assistant offered: the booking is made with the usual checks."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "bookings"

    def post(self, request, pk):
        proposal = get_object_or_404(BookingProposal.objects.select_related("conversation"), pk=pk)
        conversation = proposal.conversation
        if conversation.user_id is not None and conversation.user_id != request.user.pk:
            return _error("Предложението не е намерено.", status.HTTP_404_NOT_FOUND)
        if proposal.booking_id:
            return _error("Този час вече е потвърден.")
        data = ConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data

        services = Service.objects.in_bulk([i["service"] for i in proposal.items])
        specialists = Specialist.objects.in_bulk([i["specialist"] for i in proposal.items])
        try:
            requests = [ItemRequest(services[i["service"]], specialists.get(i["specialist"])) for i in proposal.items]
        except KeyError:
            return _error("Услугата вече не се предлага. Моля, попитайте асистента за друг час.")
        try:
            client = resolve_client(**v["client"], user=request.user, consent=v["consent"])
            booking = create_booking(
                client=client,
                requests=requests,
                start=proposal.start_at,
                parallel=proposal.parallel,
                note=proposal.note,
                who="клиентът чрез асистента на сайта",
            )
        except BookingError as exc:
            return _error(str(exc))
        proposal.booking = booking
        proposal.save(update_fields=["booking"])

        start = timezone.localtime(booking.start_at)
        conversation.pending_notes = [
            *conversation.pending_notes,
            f"The visitor confirmed the booking card: booking #{booking.pk} on {start:%d.%m.%Y} at {start:%H:%M} "
            "is now made. If they ask, it can be cancelled from the link on the confirmation screen.",
        ]
        conversation.save(update_fields=["pending_notes", "updated_at"])
        return Response(proposal_payload(proposal), status=status.HTTP_201_CREATED)
