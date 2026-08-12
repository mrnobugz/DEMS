"""Database migration helpers (Alembic) for scalable deploys."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

logger = logging.getLogger("demsta.migrate")

# Any of these means the database already holds a DEMSTA schema
SCHEMA_MARKER_TABLES = ("alembic_version", "clinics", "users", "patients")


def _alembic_config() -> Config:
    # backend/ is the cwd when running uvicorn from backend/
    root = Path(__file__).resolve().parents[2]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
    return cfg


async def _with_connection(fn):
    """Run ``fn`` on a throwaway engine so we never touch the app's pooled loop."""
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            return await conn.run_sync(fn)
    finally:
        await engine.dispose()


def _existing_tables() -> set[str]:
    return asyncio.run(_with_connection(lambda conn: set(sa.inspect(conn).get_table_names())))


def _create_all() -> None:
    from app.db.session import Base
    import app.models  # noqa: F401 — register models

    asyncio.run(_with_connection(Base.metadata.create_all))


def run_migrations() -> None:
    """Bring the schema to head. Safe to call on every boot when AUTO_MIGRATE=true."""
    settings = get_settings()
    logger.info("Running Alembic migrations (%s)", "postgres" if settings.is_postgres else "sqlite")

    cfg = _alembic_config()
    if _existing_tables().isdisjoint(SCHEMA_MARKER_TABLES):
        # Revision 001 builds the schema from live model metadata, so an empty database
        # is already at head once created. Replaying revisions on top of it would only
        # re-add columns that create_all just made.
        logger.info("Empty database — creating schema from models and stamping head")
        _create_all()
        command.stamp(cfg, "head")
        return

    command.upgrade(cfg, "head")
