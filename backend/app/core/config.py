from functools import lru_cache
import json
from typing import Annotated, Any, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "DEMSTA"
    app_full_name: str = "Dental Electronic Management System for Treatment & Administration"
    environment: Literal["development", "staging", "production"] = "development"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    # Database — SQLite for quick local; PostgreSQL for Docker / Render
    database_url: str = "sqlite+aiosqlite:///./demsta.db"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_recycle_seconds: int = 1800
    db_pool_timeout_seconds: int = 30
    auto_migrate: bool = True
    enable_rls: bool = True  # Postgres Row-Level Security (no-op on SQLite)

    # Security
    secret_key: str = "demsta-dev-change-me-in-production-use-openssl-rand"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    algorithm: str = "HS256"
    # NoDecode: skip the source-level JSON decode so parse_cors_origins can accept
    # a comma-separated string ("https://a,https://b") as well as a JSON list
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
        ]
    )
    # Render / production: set to the static site origin (https://….onrender.com)
    frontend_origin: str | None = None

    # Redis — shared rate-limit / cache / future job broker (falls back in-process)
    redis_url: str = "redis://localhost:6379/0"
    redis_enabled: bool = False

    # Rate limiting (Redis-backed when available)
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 120
    rate_limit_window_seconds: int = 60
    rate_limit_auth_requests: int = 20
    rate_limit_auth_window_seconds: int = 60

    seed_force: bool = False  # wipe demo data and reseed when True
    allow_demo_reseed: bool = True  # POST /owner/reseed-demo in non-production

    # Default clinic bootstrap
    default_clinic_name: str = "DEMSTA Dental Care"
    default_clinic_code: str = "MAIN"
    # ISO 4217 — Tanzanian Shilling (displayed as TSh / TSH in UI locales)
    default_currency: str = "TZS"

    # MFA
    mfa_issuer: str = "DEMSTA"

    # Object storage (imaging / consents) — local encrypted filesystem by default
    # On Render, mount a disk at /var/data and set OBJECT_STORAGE_PATH=/var/data/object_store
    object_storage_path: str = "./data/object_store"
    imaging_max_upload_bytes: int = 15 * 1024 * 1024  # 15 MB

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: Any) -> Any:
        if not isinstance(v, str) or not v:
            return v
        url = v.strip()
        # Render / Heroku style → SQLAlchemy asyncpg
        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://") :]
        elif url.startswith("postgresql://") and "+asyncpg" not in url:
            url = "postgresql+asyncpg://" + url[len("postgresql://") :]
        # Remote Postgres (Render) requires TLS
        if (
            "+asyncpg://" in url
            and "ssl=" not in url
            and "localhost" not in url
            and "127.0.0.1" not in url
            and "@db:" not in url  # docker-compose service name
        ):
            url += ("&" if "?" in url else "?") + "ssl=require"
        return url

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:
        if v is None or v == "":
            return []
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("["):
                return json.loads(s)
            return [part.strip() for part in s.split(",") if part.strip()]
        return v

    @model_validator(mode="after")
    def production_defaults(self) -> "Settings":
        if self.environment == "production" and self.debug:
            object.__setattr__(self, "debug", False)
        origins = list(self.cors_origins)
        if self.frontend_origin:
            fo = self.frontend_origin.strip().rstrip("/")
            if fo and fo not in origins:
                origins.append(fo)
            object.__setattr__(self, "cors_origins", origins)
        return self

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_postgres(self) -> bool:
        return "postgresql" in self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
