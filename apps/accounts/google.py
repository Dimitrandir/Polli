"""Check a "Sign in with Google" credential (an ID token) with Google."""

import json
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from django.conf import settings

from .services import AuthError

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


def fetch_token_info(credential):
    with urlopen(f"{TOKENINFO_URL}?{urlencode({'id_token': credential})}", timeout=5) as response:
        return json.load(response)


def verify_google_credential(credential):
    """Return the verified email and names from the token, or raise AuthError."""
    if not settings.GOOGLE_CLIENT_ID:
        raise AuthError("Входът с Google още не е настроен.")
    try:
        info = fetch_token_info(credential)
    except (URLError, ValueError, TimeoutError):  # HTTPError (invalid/expired token) is a URLError
        raise AuthError("Входът с Google не успя. Опитайте отново.") from None
    if (
        info.get("aud") != settings.GOOGLE_CLIENT_ID
        or info.get("iss") not in ISSUERS
        or str(info.get("email_verified")).lower() != "true"
        or not info.get("email")
    ):
        raise AuthError("Входът с Google не успя. Опитайте отново.")
    return {
        "email": info["email"].strip().lower(),
        "first_name": info.get("given_name", ""),
        "last_name": info.get("family_name", ""),
    }
