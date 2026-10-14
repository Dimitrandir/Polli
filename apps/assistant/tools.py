"""The tools the assistant may call: article search, the service menu, free times and a booking proposal.

Every handler takes the tool input from the model and returns JSON-serialisable data. Mistakes the
visitor or the model can fix (an unknown service, a time that is no longer free) are raised as
ToolError and sent back to the model as an error result, so it can explain or try again.
"""

from datetime import date, datetime, timedelta

from django.db.models import Prefetch
from django.utils import timezone

from apps.bookings.availability import AvailabilityEngine, BookingError, ItemRequest
from apps.catalog.models import Service
from apps.staff.models import Specialist, SpecialistService

from .models import BookingProposal
from .search import search_articles, tokens

WEEKDAYS = ["понеделник", "вторник", "сряда", "четвъртък", "петък", "събота", "неделя"]
MAX_SLOT_DAYS = 7
MAX_SLOTS_PER_DAY = 20
PASSAGE_PREVIEW_CHARS = 1500


class ToolError(Exception):
    """Sent back to the model as an error result."""


_SERVICE_ITEMS = {
    "type": "array",
    "minItems": 1,
    "maxItems": 6,
    "description": "The services to book, in the order they are done.",
    "items": {
        "type": "object",
        "properties": {
            "service_id": {"type": "integer", "description": "id from list_services"},
            "specialist_id": {
                "type": "integer",
                "description": "id of the specialist the visitor wants; omit when anyone will do",
            },
        },
        "required": ["service_id"],
        "additionalProperties": False,
    },
}

_PARALLEL = {
    "type": "boolean",
    "description": "true only when the visitor wants two services at the same time by different specialists "
    "(e.g. manicure while the colour sets). Default false: the services follow each other.",
}

TOOLS = [
    {
        "name": "search_articles",
        "description": "Full-text search in the salon's own articles about hair care, colouring, scalp and hair "
        "loss, treatments and products. Returns the best matching passages with the article title and link. "
        "Use it for every question about hair or beauty advice, and answer only from what it returns. Search "
        "with the key words of the question in Bulgarian; search again with other words if nothing fits.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Key words in Bulgarian"}},
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "list_services",
        "description": "The salon's services that can be booked online: id, group, name and option, price in EUR, "
        "duration, and which specialists do each one (with their own price when it differs). Pass a query to "
        "narrow the list (e.g. 'кичури', 'маникюр'); without it you get the whole menu.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Optional words to filter by"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "find_free_slots",
        "description": "Free start times for one or more services, from a date for up to 7 days. Each slot says "
        "which specialist does each service and the total price. Always call it before offering a time; never "
        "guess free times.",
        "input_schema": {
            "type": "object",
            "properties": {
                "services": _SERVICE_ITEMS,
                "parallel": _PARALLEL,
                "date": {"type": "string", "description": "First day to look at, YYYY-MM-DD"},
                "days": {"type": "integer", "minimum": 1, "maximum": MAX_SLOT_DAYS, "description": "Default 1"},
            },
            "required": ["services", "date"],
            "additionalProperties": False,
        },
    },
    {
        "name": "propose_booking",
        "description": "Show the visitor a booking card for one exact free time so they can confirm it. This does "
        "NOT book: the visitor checks the details, enters name and phone on the card and presses the button. "
        "Call it only after the visitor has chosen the services and the time, with the same services and a "
        "start value returned by find_free_slots.",
        "input_schema": {
            "type": "object",
            "properties": {
                "services": _SERVICE_ITEMS,
                "parallel": _PARALLEL,
                "start": {"type": "string", "description": "The slot's start exactly as find_free_slots gave it"},
                "note": {"type": "string", "description": "Optional note for the salon from the visitor"},
            },
            "required": ["services", "start"],
            "additionalProperties": False,
        },
    },
]


# --- helpers -----------------------------------------------------------------------------------


def _money(value):
    return f"{value:.2f}"


def _item_requests(raw):
    if not isinstance(raw, list) or not raw:
        raise ToolError("Посочете поне една услуга.")
    service_ids = {i.get("service_id") for i in raw if isinstance(i, dict)}
    specialist_ids = {i.get("specialist_id") for i in raw if isinstance(i, dict) and i.get("specialist_id")}
    services = Service.objects.in_bulk([s for s in service_ids if isinstance(s, int)])
    specialists = Specialist.objects.in_bulk([s for s in specialist_ids if isinstance(s, int)])
    requests = []
    for item in raw:
        service = services.get(item.get("service_id")) if isinstance(item, dict) else None
        if service is None:
            raise ToolError(f"Няма услуга с id {item.get('service_id') if isinstance(item, dict) else item}.")
        specialist = None
        if item.get("specialist_id"):
            specialist = specialists.get(item["specialist_id"])
            if specialist is None:
                raise ToolError(f"Няма специалист с id {item['specialist_id']}.")
        requests.append(ItemRequest(service=service, specialist=specialist))
    return requests


def _engine(tool_input):
    requests = _item_requests(tool_input.get("services"))
    try:
        return AvailabilityEngine(requests, parallel=bool(tool_input.get("parallel")))
    except BookingError as exc:
        raise ToolError(str(exc)) from exc


def _local(dt):
    return timezone.localtime(dt)


def describe_slot(slot):
    start = _local(slot.start)
    return {
        "start": start.isoformat(),
        "date": start.date().isoformat(),
        "weekday": WEEKDAYS[start.weekday()],
        "time": f"{start:%H:%M}",
        "end": f"{_local(slot.end):%H:%M}",
        "total_price": _money(slot.total_price),
        "items": [
            {
                "service_id": item.service.pk,
                "service": item.service.display_name,
                "specialist_id": item.specialist.pk,
                "specialist": item.specialist.name,
                "start": f"{_local(item.start):%H:%M}",
                "end": f"{_local(item.end):%H:%M}",
                "price": _money(item.price),
            }
            for item in slot.items
        ],
    }


# --- handlers --------------------------------------------------------------------------------


def search_articles_tool(tool_input, **_):
    query = str(tool_input.get("query", "")).strip()
    if not query:
        raise ToolError("Празна заявка за търсене.")
    passages = search_articles(query)
    if not passages:
        return {"results": [], "note": "Няма статии по тази тема. Опитайте с други думи."}
    return {
        "results": [
            {
                "title": p.title,
                "url": f"/statii/{p.slug}",
                "section": p.heading,
                "text": p.text[:PASSAGE_PREVIEW_CHARS],
            }
            for p in passages
        ]
    }


def list_services_tool(tool_input, **_):
    offers = SpecialistService.objects.filter(
        specialist__is_active=True, specialist__is_online_bookable=True
    ).select_related("specialist", "service")
    services = (
        Service.objects.filter(is_active=True, is_online_bookable=True, group__is_active=True)
        .select_related("group__category")
        .prefetch_related(Prefetch("specialist_services", queryset=offers, to_attr="offers"))
    )
    query_terms = set(tokens(str(tool_input.get("query") or "")))
    result = []
    for service in services:
        if not service.offers:
            continue
        if query_terms:
            haystack = set(tokens(f"{service.group.category.name} {service.group.name} {service.display_name}"))
            if not query_terms & haystack:
                continue
        result.append(
            {
                "id": service.pk,
                "group": f"{service.group.category.name} / {service.group.name}",
                "name": service.display_name,
                "price": _money(service.price),
                "duration_minutes": service.duration_minutes,
                "specialists": [
                    {
                        "id": o.specialist.pk,
                        "name": o.specialist.name,
                        **({"price": _money(o.price)} if o.price != service.price else {}),
                    }
                    for o in sorted(service.offers, key=lambda o: (o.specialist.order, o.specialist.name))
                ],
            }
        )
    if not result and query_terms:
        return {"services": [], "note": "Нищо не съвпада. Извикайте list_services без query за цялото меню."}
    return {"services": result}


def find_free_slots_tool(tool_input, **_):
    try:
        first_day = date.fromisoformat(str(tool_input.get("date")))
    except ValueError as exc:
        raise ToolError("Датата трябва да е във вида YYYY-MM-DD.") from exc
    days = max(1, min(int(tool_input.get("days") or 1), MAX_SLOT_DAYS))
    today = timezone.localdate()
    if first_day < today:
        first_day = today
    engine = _engine(tool_input)
    result = []
    for day, slots in engine.slots(first_day, days).items():
        entry = {"date": day.isoformat(), "weekday": WEEKDAYS[day.weekday()]}
        if not slots:
            entry["slots"] = []
        else:
            # Spread the offered times over the day instead of only the first ones.
            step = max(1, -(-len(slots) // MAX_SLOTS_PER_DAY))
            entry["slots"] = [describe_slot(s) for s in slots[::step]]
            if step > 1:
                entry["note"] = f"Показан е всеки {step}-и от {len(slots)} свободни часа."
        result.append(entry)
    if not any(d["slots"] for d in result):
        last = first_day + timedelta(days=days - 1)
        return {"days": result, "note": f"Няма свободни часове от {first_day} до {last}. Опитайте следващите дни."}
    return {"days": result}


def propose_booking_tool(tool_input, *, conversation, created_proposals, **_):
    try:
        start = datetime.fromisoformat(str(tool_input.get("start")))
    except ValueError as exc:
        raise ToolError("Началото трябва да е във вида от find_free_slots.") from exc
    if timezone.is_naive(start):
        start = timezone.make_aware(start)
    engine = _engine(tool_input)
    slot = engine.plan_at(start)
    if slot is None:
        raise ToolError("Този час не е свободен. Проверете отново с find_free_slots.")
    summary = describe_slot(slot)
    proposal = BookingProposal.objects.create(
        conversation=conversation,
        items=[{"service": i.service.pk, "specialist": i.specialist.pk} for i in slot.items],
        parallel=engine.parallel,
        start_at=slot.start,
        note=str(tool_input.get("note") or "")[:1000],
        summary=summary,
    )
    created_proposals.append(str(proposal.pk))
    return {
        "proposal_id": str(proposal.pk),
        "booking_card": summary,
        "next_step": "The card is now shown under your reply. Tell the visitor to check it, fill in name and phone "
        "and press „Потвърди часа“. The booking is NOT made until they do.",
    }


HANDLERS = {
    "search_articles": search_articles_tool,
    "list_services": list_services_tool,
    "find_free_slots": find_free_slots_tool,
    "propose_booking": propose_booking_tool,
}
