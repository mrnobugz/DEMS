from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "DEMSTA"
    app_full_name: str = "Dental Electronic Management System for Treatment & Administration"
    environment: Literal["development", "staging", "production"] = "development"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    # Database — SQLite for quick local; PostgreSQL for scalable / Docker
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
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
        ]
    )

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

    # MFA
    mfa_issuer: str = "DEMSTA"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")


@lru_cache
def get_settings() -> Settings:
    return Settings()
