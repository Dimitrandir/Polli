"""Django settings for the SIS Esthetics booking platform.

Configuration comes from environment variables so the same code runs locally,
in CI and in production.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [h for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h]

# Origins allowed to send unsafe requests with the session cookie (the frontend).
_DEFAULT_FRONTEND = "http://localhost:3000,http://127.0.0.1:3000"
CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", _DEFAULT_FRONTEND).split(",") if o]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "apps.catalog",
    "apps.staff",
    "apps.clients",
    "apps.bookings",
    "apps.salon",
    "apps.content",
    "apps.accounts",
    "apps.assistant",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "sis"),
        "USER": os.environ.get("POSTGRES_USER", "sis"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "sis"),
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "bg"
# 13.10.2026, 15:05 instead of Django's "3:05 след обяд" (config/formats/bg/formats.py).
FORMAT_MODULE_PATH = ["config.formats"]
TIME_ZONE = "Europe/Sofia"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Uploaded files such as specialists' photos.
MEDIA_URL = "media/"
MEDIA_ROOT = Path(os.environ.get("DJANGO_MEDIA_ROOT", BASE_DIR / "media"))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "bookings": os.environ.get("BOOKING_CREATE_RATE", "30/hour"),
        "staff_login": os.environ.get("STAFF_LOGIN_RATE", "10/minute"),
        "login_code": os.environ.get("LOGIN_CODE_RATE", "10/hour"),
        "login": os.environ.get("LOGIN_RATE", "20/hour"),
        "messages": os.environ.get("CLIENT_MESSAGE_RATE", "30/hour"),
        "assistant": os.environ.get("ASSISTANT_MESSAGE_RATE", "60/hour"),
    },
}

# --- Client accounts ---------------------------------------------------------
# Clients log in without a password: with Google or with a one-time code sent by email.
# The OAuth client ID comes from Google Cloud Console (APIs & Services → Credentials → Web client).
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
LOGIN_CODE_TTL_MINUTES = 10
LOGIN_CODE_MAX_ATTEMPTS = 5
# Bump when the privacy policy changes; every consent records the version it was given for.
PRIVACY_POLICY_VERSION = os.environ.get("PRIVACY_POLICY_VERSION", "2026-10")
# Public address of the site, used in links inside emails.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")

EMAIL_BACKEND = os.environ.get("DJANGO_EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", 587))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "SIS Esthetics <no-reply@sisesthetics.com>")

# --- Booking rules -----------------------------------------------------------
# All durations are in minutes.
BOOKING = {
    # Granularity of the start times offered to clients.
    "SLOT_STEP_MINUTES": int(os.environ.get("BOOKING_SLOT_STEP_MINUTES", 15)),
    # Clients cannot book a start time sooner than this from now.
    "MIN_NOTICE_MINUTES": int(os.environ.get("BOOKING_MIN_NOTICE_MINUTES", 60)),
    # How far ahead the calendar is open.
    "MAX_DAYS_AHEAD": int(os.environ.get("BOOKING_MAX_DAYS_AHEAD", 60)),
    # Clients may cancel online only this many hours before the appointment.
    "CANCELLATION_HOURS": int(os.environ.get("BOOKING_CANCELLATION_HOURS", 24)),
    # Maximum number of days returned by one availability request (week view).
    "MAX_AVAILABILITY_DAYS": 14,
}

# --- AI assistant ------------------------------------------------------------
# The chat on the website answers from the salon's articles and books appointments through
# the Claude API. Without ANTHROPIC_API_KEY the chat button is simply not shown.
ASSISTANT = {
    "API_KEY": os.environ.get("ANTHROPIC_API_KEY", ""),
    "MODEL": os.environ.get("ASSISTANT_MODEL", "claude-opus-5-5"),
    # low | medium | high: how much the model thinks before answering (more = slower and dearer).
    "EFFORT": os.environ.get("ASSISTANT_EFFORT", "low"),
    "MAX_TOOL_ROUNDS": 8,
    "MAX_MESSAGE_CHARS": 1000,
    # Visitor messages per conversation; after that the visitor starts a new one.
    "MAX_TURNS": 30,
    # `purge_assistant_conversations` deletes conversations older than this.
    "RETENTION_DAYS": int(os.environ.get("ASSISTANT_RETENTION_DAYS", 90)),
}
