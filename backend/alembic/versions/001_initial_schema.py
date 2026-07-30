"""Initial DEMSTA schema + scalability indexes.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-07-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from app.db.session import Base
    import app.models  # noqa: F401

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)

    op.create_index(
        "ix_patients_clinic_name",
        "patients",
        ["clinic_id", "last_name", "first_name"],
        unique=False,
    )
    op.create_index(
        "ix_appointments_clinic_starts",
        "appointments",
        ["clinic_id", "starts_at"],
        unique=False,
    )
    op.create_index(
        "ix_invoices_clinic_status",
        "invoices",
        ["clinic_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_audit_logs_clinic_created",
        "audit_logs",
        ["clinic_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_audit_logs_clinic_created", table_name="audit_logs")
    op.drop_index("ix_invoices_clinic_status", table_name="invoices")
    op.drop_index("ix_appointments_clinic_starts", table_name="appointments")
    op.drop_index("ix_patients_clinic_name", table_name="patients")

    from app.db.session import Base
    import app.models  # noqa: F401

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
