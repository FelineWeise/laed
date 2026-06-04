"""message mentions and read_at inbox

Revision ID: 0013_message_mentions
Revises: 0012_thread_ai_enabled
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0013_message_mentions"
down_revision: Union[str, Sequence[str], None] = "0012_thread_ai_enabled"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "message_mentions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("message_id", sa.UUID(), nullable=False),
        sa.Column("mentioned_user_id", sa.UUID(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["mentioned_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", "mentioned_user_id", name="uq_message_mention"),
    )
    op.create_index(
        "ix_message_mentions_mentioned_user_id",
        "message_mentions",
        ["mentioned_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_message_mentions_mentioned_user_id", table_name="message_mentions")
    op.drop_table("message_mentions")
