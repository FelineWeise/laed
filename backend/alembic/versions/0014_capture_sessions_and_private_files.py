"""capture sessions, assets, private files, ai conversation topic

Revision ID: 0014_capture_private
Revises: 0013_message_mentions
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0014_capture_private"
down_revision: Union[str, Sequence[str], None] = "0013_message_mentions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "files",
        sa.Column("is_private", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "ai_conversations",
        sa.Column("topic_node_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_ai_conversations_topic_node_id",
        "ai_conversations",
        "topology_nodes",
        ["topic_node_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "capture_sessions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("title", sa.String(), server_default="", nullable=False),
        sa.Column("status", sa.String(), server_default="active", nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("topic_node_id", sa.UUID(), nullable=True),
        sa.Column("transcript", sa.Text(), server_default="", nullable=False),
        sa.Column("is_private", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("session_metadata", JSONB(), server_default="{}", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["topic_node_id"], ["topology_nodes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_capture_sessions_user_kind", "capture_sessions", ["user_id", "kind"])

    op.create_table(
        "capture_assets",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("file_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["capture_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("capture_assets")
    op.drop_index("ix_capture_sessions_user_kind", table_name="capture_sessions")
    op.drop_table("capture_sessions")
    op.drop_constraint("fk_ai_conversations_topic_node_id", "ai_conversations", type_="foreignkey")
    op.drop_column("ai_conversations", "topic_node_id")
    op.drop_column("files", "is_private")
