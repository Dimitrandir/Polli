"""Days without online booking: which days are closed for clients, and what they are told.

A block for the whole salon closes the day for every specialist; a block for one specialist only
takes them out of the online calendar. The team keeps booking from the calendar as usual.
"""

from dataclasses import dataclass, field

from .models import DEFAULT_ONLINE_BLOCK_MESSAGE, OnlineBlock, SalonInfo


def default_message():
    """The salon's text for a closed day, else the built-in one."""
    value = SalonInfo.objects.order_by("pk").values_list("online_block_message", flat=True).first()
    return (value or "").strip() or DEFAULT_ONLINE_BLOCK_MESSAGE


@dataclass
class DayBlocks:
    salon: OnlineBlock | None = None
    specialists: dict[int, OnlineBlock] = field(default_factory=dict)

    def is_blocked(self, specialist_id):
        return self.salon is not None or specialist_id in self.specialists

    def message_for(self, specialist_ids, default):
        """The text for clients when none of `specialist_ids` can be booked online that day, else None."""
        if self.salon is not None:
            return self.salon.message or default
        ids = list(specialist_ids)
        if not ids or not all(sid in self.specialists for sid in ids):
            return None
        return next((self.specialists[sid].message for sid in ids if self.specialists[sid].message), default)


def blocks_between(first, last):
    """{date: DayBlocks} for the days from `first` to `last` (both included) that have a block."""
    result = {}
    for block in OnlineBlock.objects.filter(date__gte=first, date__lte=last):
        day = result.setdefault(block.date, DayBlocks())
        if block.specialist_id is None:
            day.salon = block
        else:
            day.specialists[block.specialist_id] = block
    return result
