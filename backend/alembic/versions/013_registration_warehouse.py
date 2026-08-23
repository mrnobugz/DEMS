"""Registration checkout: warehouse sale items and patient finalize fields.

Admin-managed warehouse services (consultation fees, etc.) are selected during
patient registration, paid, and consented before the patient is sent to a
clinical department.

Revision ID: 013_registration_warehouse
Revises: 012_specialty_departments
Create Date: 2026-08-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import add_columns_if_missing, drop_columns_if_present

revision: str = "013_registration_warehouse"
down_revision: Union[str, None] = "012_specialty_departments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "inventory_items",
        sa.Column("sale_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("item_kind", sa.String(length=20), nullable=False, server_default="stock"),
        sa.Column(
            "billable_at_registration",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("target_department", sa.String(length=32), nullable=True),
    )
    add_columns_if_missing(
        "patients",
        sa.Column(
            "registration_status",
            sa.String(length=24),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("destination_department", sa.String(length=32), nullable=True),
        sa.Column("registration_finalized_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    drop_columns_if_present(
        "patients",
        "registration_status",
        "destination_department",
        "registration_finalized_at",
    )
    drop_columns_if_present(
        "inventory_items",
        "sale_price",
        "item_kind",
        "billable_at_registration",
        "target_department",
    )
