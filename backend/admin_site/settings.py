"""Django admin settings. Clinic rows stay in the same database as the API."""

import os
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get(
    "SECRET_KEY",
    "demsta-dev-change-me-in-production-use-openssl-rand",
)
DEBUG = os.environ.get("DEBUG", "true").lower() in {"1", "true", "yes"}
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "clinic.apps.ClinicConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "admin_site.urls"
WSGI_APPLICATION = "admin_site.wsgi.application"

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


def _sqlite_path(url: str) -> str:
    path = url.split("///", 1)[-1] if "///" in url else ""
    if not path or path == "./demsta.db":
        return str(BASE_DIR / "demsta.db")
    if path.startswith("./"):
        return str(BASE_DIR / path[2:])
    return path


def _clinic_database() -> dict:
    url = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./demsta.db").strip()
    if "sqlite" in url.split(":", 1)[0]:
        return {"ENGINE": "django.db.backends.sqlite3", "NAME": _sqlite_path(url)}

    normalized = url.replace("postgresql+asyncpg://", "postgresql://", 1).replace(
        "postgres://", "postgresql://", 1
    )
    parsed = urlparse(normalized)
    query = parse_qs(parsed.query)
    host = parsed.hostname or ""
    config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": host,
        "PORT": str(parsed.port or ""),
        "CONN_MAX_AGE": 60,
    }
    ssl = (query.get("sslmode") or query.get("ssl") or [""])[0]
    remote = host not in {"", "localhost", "127.0.0.1", "db"}
    if ssl in {"require", "true"} or (remote and os.environ.get("ENVIRONMENT") == "production"):
        config["OPTIONS"] = {"sslmode": "require"}
    return config


def _admin_sqlite() -> Path:
    store = os.environ.get("OBJECT_STORAGE_PATH", "").strip()
    if store:
        path = Path(store).expanduser().resolve().parent / "django.sqlite3"
    else:
        path = BASE_DIR / "data" / "django.sqlite3"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": _admin_sqlite(),
    },
    "clinic": _clinic_database(),
}
DATABASE_ROUTERS = ["clinic.router.ClinicRouter"]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Dar_es_Salaam"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
WHITENOISE_USE_FINDERS = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024

_production = os.environ.get("ENVIRONMENT") == "production"
SESSION_COOKIE_SECURE = _production
CSRF_COOKIE_SECURE = _production
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

_trusted = [
    item.strip().rstrip("/")
    for item in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",")
    if item.strip()
]
_render = os.environ.get("RENDER_EXTERNAL_URL", "").strip().rstrip("/")
if _render:
    _trusted.append(_render)
CSRF_TRUSTED_ORIGINS = _trusted
