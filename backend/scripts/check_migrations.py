"""Prove the Alembic history and the model metadata agree.

Revision 001 builds the schema with ``Base.metadata.create_all``, so three different
routes can land a database at head:

* empty database — ``run_migrations`` creates the schema from models and stamps head
* database stamped at an old revision — the remaining revisions are applied
* empty database with revisions replayed one by one

All three must produce the same schema, and every revision must tolerate objects that
already exist. Run as a script (exit code 0 on success) or via ``tests/test_migrations.py``.

Each scenario clears ``app`` from ``sys.modules`` because ``get_settings`` is cached and
``app.db.session`` builds its engine at import time.
"""

from __future__ import annotations

import os
import pathlib
import sys
import tempfile

BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

REQUIRED_TABLES = {
    "clinical_visits",
    "fee_schedule_items",
    "notification_outbox",
    "patient_insurance_plans",
    "restorations",
}
REQUIRED_PATIENT_COLUMNS = {
    "hospital_reg_number",
    "hygiene_recall_due",
    "perio_risk_band",
    "portal_enabled",
    "primary_dentist_id",
}
HEAD_REVISION = "011_portal_notifications"


def _use_database(db_path: pathlib.Path) -> None:
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    for module in [name for name in sys.modules if name == "app" or name.startswith("app.")]:
        del sys.modules[module]


def _sync_engine(db_path: pathlib.Path):
    import sqlalchemy as sa

    return sa.create_engine(f"sqlite:///{db_path.as_posix()}")


def _check_at_head(label: str, db_path: pathlib.Path) -> None:
    import sqlalchemy as sa

    engine = _sync_engine(db_path)
    inspector = sa.inspect(engine)
    tables = set(inspector.get_table_names())
    patient_columns = {col["name"] for col in inspector.get_columns("patients")}
    patient_indexes = {ix["name"] for ix in inspector.get_indexes("patients")}
    with engine.connect() as conn:
        revision = conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar()
    engine.dispose()

    assert REQUIRED_TABLES <= tables, f"{label}: missing tables {sorted(REQUIRED_TABLES - tables)}"
    assert REQUIRED_PATIENT_COLUMNS <= patient_columns, (
        f"{label}: missing patient columns {sorted(REQUIRED_PATIENT_COLUMNS - patient_columns)}"
    )
    assert "ix_patients_clinic_name" in patient_indexes, f"{label}: missing composite index"
    assert revision == HEAD_REVISION, f"{label}: at revision {revision}, expected {HEAD_REVISION}"
    print(f"OK  {label}: {len(tables)} tables at {revision}")


def _snapshot(db_path: pathlib.Path) -> dict[str, dict[str, set[str]]]:
    import sqlalchemy as sa

    engine = _sync_engine(db_path)
    inspector = sa.inspect(engine)
    snapshot = {}
    for table in sorted(inspector.get_table_names()):
        if table == "alembic_version":
            continue
        snapshot[table] = {
            "columns": {col["name"] for col in inspector.get_columns(table)},
            "indexes": {ix["name"] for ix in inspector.get_indexes(table)},
            "foreign keys": {fk["name"] for fk in inspector.get_foreign_keys(table)},
        }
    engine.dispose()
    return snapshot


def _empty_database(db_path: pathlib.Path) -> None:
    """Schema created from models, then stamped head — the boot path for a new deploy."""
    _use_database(db_path)
    from app.db.migrate import run_migrations

    run_migrations()
    _check_at_head("empty database", db_path)
    run_migrations()
    _check_at_head("empty database, second boot", db_path)


def _stamped_at_first_revision(db_path: pathlib.Path) -> None:
    """A database whose schema came from create_all but whose version row says 001."""
    _use_database(db_path)
    import sqlalchemy as sa
    from alembic import command

    from app.db.migrate import _alembic_config, _create_all

    _create_all()
    engine = _sync_engine(db_path)
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        conn.execute(sa.text("INSERT INTO alembic_version VALUES ('001_initial_schema')"))
    engine.dispose()

    command.upgrade(_alembic_config(), "head")
    _check_at_head("stamped at 001", db_path)


def _full_replay(db_path: pathlib.Path) -> None:
    _use_database(db_path)
    from alembic import command

    from app.db.migrate import _alembic_config

    command.upgrade(_alembic_config(), "head")
    _check_at_head("full replay", db_path)


def _compare(paths: dict[str, pathlib.Path]) -> list[str]:
    baseline_label, baseline_path = next(iter(paths.items()))
    baseline = _snapshot(baseline_path)
    problems = []
    for label, path in list(paths.items())[1:]:
        other = _snapshot(path)
        for table in sorted(set(baseline) | set(other)):
            if table not in baseline:
                problems.append(f"table {table}: absent from '{baseline_label}'")
                continue
            if table not in other:
                problems.append(f"table {table}: absent from '{label}'")
                continue
            for kind in ("columns", "indexes", "foreign keys"):
                for missing in sorted(other[table][kind] - baseline[table][kind]):
                    problems.append(f"{table}.{missing}: {kind} only in '{label}'")
                for extra in sorted(baseline[table][kind] - other[table][kind]):
                    problems.append(f"{table}.{extra}: {kind} only in '{baseline_label}'")
    return problems


def main() -> int:
    work = pathlib.Path(tempfile.mkdtemp(prefix="demsta_migrations_"))
    paths = {
        "empty database": work / "empty.db",
        "stamped at 001": work / "stamped.db",
        "full replay": work / "replay.db",
    }
    _empty_database(paths["empty database"])
    _stamped_at_first_revision(paths["stamped at 001"])
    _full_replay(paths["full replay"])

    problems = _compare(paths)
    for problem in problems:
        print(f"MISMATCH  {problem}")
    if problems:
        print(f"{len(problems)} schema mismatch(es)")
        return 1
    print("OK  all routes to head produce the same schema")
    return 0


if __name__ == "__main__":
    sys.exit(main())
