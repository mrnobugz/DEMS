"""Idempotent DDL helpers for Alembic revisions.

Revision ``001_initial_schema`` builds the schema with ``Base.metadata.create_all``,
so a database created from scratch already carries every table, column and index
that later revisions add. These helpers let those revisions no-op on such a
database while still upgrading one that is stamped at an older revision.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector


def _inspector() -> Inspector:
    # Built per call so DDL emitted earlier in the same migration is visible.
    return sa.inspect(op.get_bind())


def has_table(table: str) -> bool:
    return _inspector().has_table(table)


def has_column(table: str, column: str) -> bool:
    insp = _inspector()
    if not insp.has_table(table):
        return False
    return any(col["name"] == column for col in insp.get_columns(table))


def has_index(table: str, name: str) -> bool:
    insp = _inspector()
    if not insp.has_table(table):
        return False
    if any(ix["name"] == name for ix in insp.get_indexes(table)):
        return True
    # Postgres backs a UNIQUE constraint with an index reflected separately
    return any(uq["name"] == name for uq in insp.get_unique_constraints(table))


def has_constraint(table: str, name: str) -> bool:
    insp = _inspector()
    if not insp.has_table(table):
        return False
    names: set[str | None] = {fk["name"] for fk in insp.get_foreign_keys(table)}
    names |= {uq["name"] for uq in insp.get_unique_constraints(table)}
    try:
        names |= {ck["name"] for ck in insp.get_check_constraints(table)}
    except NotImplementedError:
        pass
    return name in names


def create_table_if_missing(table: str, *columns: sa.schema.SchemaItem) -> None:
    if has_table(table):
        return
    op.create_table(table, *columns)


def drop_table_if_present(table: str) -> None:
    if has_table(table):
        op.drop_table(table)


def add_columns_if_missing(table: str, *columns: sa.Column) -> None:
    if not has_table(table):
        return
    missing = [col for col in columns if not has_column(table, col.name)]
    if not missing:
        return
    with op.batch_alter_table(table) as batch:
        for column in missing:
            batch.add_column(column)


def drop_columns_if_present(table: str, *names: str) -> None:
    if not has_table(table):
        return
    present = [name for name in names if has_column(table, name)]
    if not present:
        return
    with op.batch_alter_table(table) as batch:
        for name in present:
            batch.drop_column(name)


def create_index_if_missing(
    name: str,
    table: str,
    columns: Sequence[str],
    *,
    unique: bool = False,
) -> None:
    if not has_table(table) or has_index(table, name):
        return
    op.create_index(name, table, list(columns), unique=unique)


def drop_index_if_present(name: str, table: str) -> None:
    if has_index(table, name):
        op.drop_index(name, table_name=table)


def create_foreign_key_if_missing(
    name: str,
    table: str,
    referent: str,
    local_cols: Sequence[str],
    remote_cols: Sequence[str],
    **kwargs: object,
) -> None:
    if not has_table(table) or not has_table(referent) or has_constraint(table, name):
        return
    if any(not has_column(table, col) for col in local_cols):
        return
    with op.batch_alter_table(table) as batch:
        batch.create_foreign_key(name, referent, list(local_cols), list(remote_cols), **kwargs)


def drop_constraint_if_present(name: str, table: str, *, type_: str = "foreignkey") -> None:
    if not has_constraint(table, name):
        return
    with op.batch_alter_table(table) as batch:
        batch.drop_constraint(name, type_=type_)


def set_column_nullable(
    table: str,
    column: str,
    *,
    nullable: bool,
    existing_type: sa.types.TypeEngine,
) -> None:
    insp = _inspector()
    if not insp.has_table(table):
        return
    current = next((col for col in insp.get_columns(table) if col["name"] == column), None)
    if current is None or bool(current["nullable"]) is nullable:
        return
    with op.batch_alter_table(table) as batch:
        batch.alter_column(column, existing_type=existing_type, nullable=nullable)
