"""File grants for selective member sharing.

Revision ID: 0018_file_grants
Revises: 0017_capture_asset_blobs
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018_file_grants"
down_revision: Union[str, Sequence[str], None] = "0017_capture_asset_blobs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "file_grants",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("file_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("file_id", "user_id", name="uq_file_grants_file_user"),
    )
    op.create_index("ix_file_grants_file_id", "file_grants", ["file_id"])
    op.create_index("ix_file_grants_user_id", "file_grants", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_file_grants_user_id", table_name="file_grants")
    op.drop_index("ix_file_grants_file_id", table_name="file_grants")
    op.drop_table("file_grants")
