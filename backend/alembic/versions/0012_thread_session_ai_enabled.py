"""thread session ai_enabled toggle

Revision ID: 0012_thread_ai_enabled
Revises: 0011_remove_demo_seed
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0012_thread_ai_enabled"
down_revision: Union[str, Sequence[str], None] = "0011_remove_demo_seed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "thread_sessions",
        sa.Column("ai_enabled", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("thread_sessions", "ai_enabled")
