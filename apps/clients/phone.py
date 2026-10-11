import re


def normalize_phone(raw):
    """Normalise a phone number to E.164-like form, assuming Bulgaria for local numbers.

    "0888 123 456" -> "+359888123456", "00359888..." -> "+359888...".
    """
    if not raw:
        return ""
    raw = raw.strip()
    plus = raw.startswith("+")
    digits = re.sub(r"\D", "", raw)
    if plus:
        return f"+{digits}"
    if digits.startswith("00"):
        return f"+{digits[2:]}"
    if digits.startswith("359"):
        return f"+{digits}"
    if digits.startswith("0"):
        return f"+359{digits[1:]}"
    return f"+{digits}" if digits else ""
