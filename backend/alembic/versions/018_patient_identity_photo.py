"""Store an encrypted identity photo on the patient file.

Revision ID: 018_patient_identity_photo
Revises: 017_user_permission_overrides
Create Date: 2026-08-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from app.db.migration_ops import add_columns_if_missing, drop_columns_if_present

revision: str = "018_patient_identity_photo"
down_revision: Union[str, None] = "017_user_permission_overrides"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_columns_if_missing(
        "patients",
        sa.Column("photo_storage_key", sa.String(length=500), nullable=True),
        sa.Column("photo_content_type", sa.String(length=80), nullable=True),
    )


def downgrade() -> None:
    drop_columns_if_present("patients", "photo_storage_key", "photo_content_type")
