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
TIME_ZONE = "Europe/Sofia"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

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
    },
}

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
