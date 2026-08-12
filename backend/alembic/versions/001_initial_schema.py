"""Initial DEMSTA schema + scalability indexes.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-07-19
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from app.db.migration_ops import create_index_if_missing, drop_index_if_present

revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from app.db.session import Base
    import app.models  # noqa: F401

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)

    create_index_if_missing(
        "ix_patients_clinic_name",
        "patients",
        ["clinic_id", "last_name", "first_name"],
    )
    create_index_if_missing(
        "ix_appointments_clinic_starts",
        "appointments",
        ["clinic_id", "starts_at"],
    )
    create_index_if_missing(
        "ix_invoices_clinic_status",
        "invoices",
        ["clinic_id", "status"],
    )
    create_index_if_missing(
        "ix_audit_logs_clinic_created",
        "audit_logs",
        ["clinic_id", "created_at"],
    )


def downgrade() -> None:
    drop_index_if_present("ix_audit_logs_clinic_created", "audit_logs")
    drop_index_if_present("ix_invoices_clinic_status", "invoices")
    drop_index_if_present("ix_appointments_clinic_starts", "appointments")
    drop_index_if_present("ix_patients_clinic_name", "patients")

    from app.db.session import Base
    import app.models  # noqa: F401

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
