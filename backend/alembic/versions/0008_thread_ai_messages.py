"""thread AI fields on messages

Revision ID: 0008_thread_ai
Revises: 0007_topic_members
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0008_thread_ai"
down_revision: Union[str, Sequence[str], None] = "0007_topic_members"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("reply_to_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_messages_reply_to_id",
        "messages",
        "messages",
        ["reply_to_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "messages",
        sa.Column("triggered_ai", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "messages",
        sa.Column("source_chunks", postgresql.JSONB(), nullable=True),
    )
    op.create_table(
        "message_context_attachments",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("message_id", sa.UUID(), nullable=True),
        sa.Column("attachment_type", sa.String(), nullable=False),
        sa.Column("ref_id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("message_context_attachments")
    op.drop_column("messages", "source_chunks")
    op.drop_column("messages", "triggered_ai")
    op.drop_constraint("fk_messages_reply_to_id", "messages", type_="foreignkey")
    op.drop_column("messages", "reply_to_id")
