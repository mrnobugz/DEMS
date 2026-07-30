"""Database migration helpers (Alembic) for scalable deploys."""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.core.config import get_settings

logger = logging.getLogger("demsta.migrate")


def _alembic_config() -> Config:
    # backend/ is the cwd when running uvicorn from backend/
    root = Path(__file__).resolve().parents[2]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
    return cfg


def run_migrations() -> None:
    """Upgrade schema to head. Safe to call on every boot when AUTO_MIGRATE=true."""
    settings = get_settings()
    logger.info("Running Alembic migrations (%s)", "postgres" if settings.is_postgres else "sqlite")
    command.upgrade(_alembic_config(), "head")
