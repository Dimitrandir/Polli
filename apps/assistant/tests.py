from datetime import timedelta
from types import SimpleNamespace
from unittest import mock

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from apps.bookings.models import Booking
from apps.bookings.tests.factories import SalonTestCase, at
from apps.content.models import Article

from . import agent
from .models import BookingProposal, Conversation
from .search import search_articles, stem
from .tools import find_free_slots_tool, list_services_tool, propose_booking_tool

ASSISTANT_ON = {
    "API_KEY": "test-key",
    "MODEL": "claude-test",
    "EFFORT": "low",
    "MAX_TOOL_ROUNDS": 4,
    "MAX_MESSAGE_CHARS": 1000,
    "MAX_TURNS": 3,
    "RETENTION_DAYS": 90,
}


class Block(SimpleNamespace):
    def to_dict(self, mode="python"):
        return dict(vars(self))


def text(value):
    return Block(type="text", text=value)


def tool_use(name, tool_input, id="tu_1"):
    return Block(type="tool_use", id=id, name=name, input=tool_input)


class FakeClient:
    """Plays back prepared responses and records every request."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.requests.append({**kwargs, "messages": list(kwargs["messages"])})
        stop_reason, content = self.responses.pop(0)
        return SimpleNamespace(stop_reason=stop_reason, content=content)


def article(**kwargs):
    defaults = {"published_at": timezone.now(), "is_published": True}
    return Article.objects.create(**{**defaults, **kwargs})


class SearchTests(TestCase):
    def setUp(self):
        article(
            title="Как да спрете косопада",
            slug="kosopad",
            body="## Причини\nКосопадът често идва от стрес и липса на желязо.\n\n## Грижа\nМасажирайте скалпа.",
        )
        article(title="Защита от преса", slug="presa", body="Винаги ползвайте термозащита преди преса и маша.")
        article(title="Чернова", slug="draft", body="Косопад и косопад.", is_published=False)

    def test_word_forms_share_a_stem(self):
        self.assertEqual(stem("косата"), stem("коса"))
        self.assertEqual(stem("коси"), stem("коса"))

    def test_finds_the_matching_passage_with_its_heading(self):
        results = search_articles("защо имам косопад")
        self.assertEqual(results[0].slug, "kosopad")
        self.assertIn(results[0].heading, {"Причини", "Грижа"})
        self.assertNotIn("draft", [r.slug for r in results])

    def test_index_follows_article_changes(self):
        self.assertEqual(search_articles("кератин"), [])
        article(title="Кератинова терапия", slug="keratin", body="Кератинът изглажда косъма.")
        self.assertEqual(search_articles("кератин")[0].slug, "keratin")


class ToolTests(SalonTestCase):
    def test_list_services_filters_by_query(self):
        names = [s["name"] for s in list_services_tool({"query": "маникюр"})["services"]]
        self.assertEqual(names, ["Маникюр с гел лак"])
        colour = next(s for s in list_services_tool({})["services"] if s["id"] == self.colour.pk)
        poli = next(s for s in colour["specialists"] if s["id"] == self.poli.pk)
        self.assertEqual(poli["price"], "80.00")  # her own price

    def test_free_slots_come_from_the_booking_engine(self):
        self.book(self.poli, self.cut, at(self.day, 9), minutes=60)
        result = find_free_slots_tool(
            {"services": [{"service_id": self.cut.pk, "specialist_id": self.poli.pk}], "date": self.day.isoformat()}
        )
        times = [s["time"] for s in result["days"][0]["slots"]]
        self.assertNotIn("09:00", times)
        self.assertEqual(result["days"][0]["weekday"], "понеделник")

    def test_proposal_does_not_book(self):
        conversation = Conversation.objects.create()
        created = []
        start = at(self.day, 11).isoformat()
        result = propose_booking_tool(
            {"services": [{"service_id": self.cut.pk}], "start": start},
            conversation=conversation,
            created_proposals=created,
        )
        proposal = BookingProposal.objects.get()
        self.assertEqual(created, [str(proposal.pk)])
        self.assertEqual(result["booking_card"]["time"], "11:00")
        self.assertEqual(Booking.objects.count(), 0)


@override_settings(ASSISTANT=ASSISTANT_ON)
class ChatApiTests(SalonTestCase):
    def setUp(self):
        super().setUp()
        self.fake = None
        patcher = mock.patch.object(agent, "get_client", side_effect=lambda: self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def chat(self, message, conversation=None):
        body = {"message": message, **({"conversation": conversation} if conversation else {})}
        return self.client.post(reverse("api:assistant-chat"), body, content_type="application/json")

    def test_status(self):
        self.assertEqual(self.client.get(reverse("api:assistant-status")).json(), {"enabled": True})
        with override_settings(ASSISTANT={**ASSISTANT_ON, "API_KEY": ""}):
            self.assertEqual(self.client.get(reverse("api:assistant-status")).json(), {"enabled": False})
            self.assertEqual(self.chat("Здравейте").status_code, 503)

    def test_answer_with_article_search(self):
        article(title="Как да спрете косопада", slug="kosopad", body="Косопадът често идва от стрес.")
        self.fake = FakeClient(
            ("tool_use", [tool_use("search_articles", {"query": "косопад"})]),
            ("end_turn", [text("Често е от стрес. [Как да спрете косопада](/statii/kosopad)")]),
        )
        response = self.chat("Защо ми пада косата?")
        self.assertEqual(response.status_code, 200)
        messages = response.json()["messages"]
        self.assertEqual([m["role"] for m in messages], ["user", "assistant"])
        self.assertIn("/statii/kosopad", messages[1]["text"])

        second = self.fake.requests[1]
        result = second["messages"][-1]["content"][0]
        self.assertEqual(result["type"], "tool_result")
        self.assertIn("/statii/kosopad", result["content"])
        self.assertEqual(second["model"], "claude-test")
        self.assertEqual(second["fallbacks"], "default")
        self.assertIn("Днес е", second["system"])

    def test_book_through_chat_after_the_visitor_confirms(self):
        start = at(self.day, 10).isoformat()
        services = [{"service_id": self.colour.pk, "specialist_id": self.poli.pk}]
        self.fake = FakeClient(
            ("tool_use", [tool_use("find_free_slots", {"services": services, "date": self.day.isoformat()})]),
            ("end_turn", [text("Свободно е в 10:00 при Поли. Да го запазя ли?")]),
            ("tool_use", [tool_use("propose_booking", {"services": services, "start": start}, id="tu_2")]),
            ("end_turn", [text("Проверете картата и натиснете „Потвърди часа“.")]),
        )
        conversation = self.chat("Искам боядисване на корени при Поли в понеделник").json()["id"]
        payload = self.chat("Да, в 10:00", conversation).json()
        card = payload["messages"][-1]["proposals"][0]
        self.assertEqual(card["time"], "10:00")
        self.assertEqual(card["total_price"], "80.00")
        self.assertIsNone(card["booking"])
        self.assertEqual(Booking.objects.count(), 0)

        url = reverse("api:assistant-confirm", args=[card["id"]])
        body = {"client": {"first_name": "Ана", "phone": "0888 999 111"}, "consent": True}
        response = self.client.post(url, body, content_type="application/json")
        self.assertEqual(response.status_code, 201, response.content)
        booking = Booking.objects.get()
        self.assertEqual(booking.start_at, at(self.day, 10))
        self.assertEqual(booking.items.get().specialist, self.poli)
        self.assertEqual(response.json()["booking"]["cancel_token"], str(booking.cancel_token))

        # A second press does not book twice.
        self.assertEqual(self.client.post(url, body, content_type="application/json").status_code, 400)

        # The model hears about the confirmation on the next turn.
        self.fake = FakeClient(("end_turn", [text("Чакаме ви!")]))
        self.chat("Благодаря", conversation)
        sent = self.fake.requests[0]["messages"]
        self.assertEqual(sent[-1]["role"], "system")
        self.assertIn(f"booking #{booking.pk}", sent[-1]["content"])
        self.assertEqual(Conversation.objects.get().pending_notes, [])

    def test_confirm_uses_the_usual_booking_rules(self):
        conversation = Conversation.objects.create()
        proposal = BookingProposal.objects.create(
            conversation=conversation,
            items=[{"service": self.cut.pk, "specialist": self.poli.pk}],
            start_at=at(self.day, 12),
            summary={},
        )
        self.book(self.poli, self.cut, at(self.day, 12))  # someone took the time meanwhile
        url = reverse("api:assistant-confirm", args=[proposal.pk])
        body = {"client": {"first_name": "Ана", "phone": "0888 999 111"}, "consent": True}
        response = self.client.post(url, body, content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("не е свободен", response.json()["detail"])

        response = self.client.post(url, {**body, "consent": False}, content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_tool_errors_go_back_to_the_model(self):
        self.fake = FakeClient(
            ("tool_use", [tool_use("propose_booking", {"services": [{"service_id": 9999}], "start": "x"})]),
            ("end_turn", [text("Нещо не е наред.")]),
        )
        self.chat("Запиши ме")
        result = self.fake.requests[1]["messages"][-1]["content"][0]
        self.assertTrue(result["is_error"])

    def test_refusal_and_runaway_tool_calls(self):
        self.fake = FakeClient(("refusal", []))
        self.assertEqual(self.chat("...").json()["messages"][-1]["text"], agent.DECLINED)

        loop = ("tool_use", [tool_use("list_services", {})])
        self.fake = FakeClient(*[loop] * ASSISTANT_ON["MAX_TOOL_ROUNDS"])
        conversation = Conversation.objects.latest("created_at")
        response = self.chat("Какви услуги има?", str(conversation.pk))
        self.assertEqual(response.status_code, 200)
        conversation.refresh_from_db()
        self.assertEqual(conversation.messages[-1]["role"], "assistant")

    def test_conversation_limits_and_ownership(self):
        self.fake = FakeClient(*[("end_turn", [text("Добре.")])] * 3)
        conversation = self.chat("1").json()["id"]
        self.chat("2", conversation)
        self.chat("3", conversation)
        last = self.chat("4", conversation).json()["messages"][-1]["text"]
        self.assertEqual(last, agent.TOO_LONG)

        self.assertEqual(self.chat("x", "00000000-0000-0000-0000-000000000000").status_code, 404)
        url = reverse("api:assistant-conversation", args=[conversation])
        self.assertEqual(len(self.client.get(url).json()["messages"]), 7)

    def test_api_failure_keeps_the_conversation_unchanged(self):
        import anthropic

        class Failing(FakeClient):
            def create(self, **kwargs):
                raise anthropic.APIConnectionError(request=mock.Mock())

        self.fake = Failing()
        response = self.chat("Здравейте")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(Conversation.objects.get().transcript, [])


class PurgeTests(TestCase):
    def test_old_conversations_are_deleted(self):
        from django.core.management import call_command

        old = Conversation.objects.create()
        Conversation.objects.filter(pk=old.pk).update(updated_at=timezone.now() - timedelta(days=200))
        Conversation.objects.create()
        call_command("purge_assistant_conversations", stdout=mock.Mock())
        self.assertEqual(Conversation.objects.count(), 1)
