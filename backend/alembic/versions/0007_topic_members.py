"""topic-level membership

Revision ID: 0007_topic_members
Revises: 0006_sharing
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007_topic_members"
down_revision: Union[str, Sequence[str], None] = "0006_sharing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "topic_members",
        sa.Column("topic_node_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(), server_default="member", nullable=False),
        sa.Column("invited_by", sa.UUID(), nullable=True),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["topic_node_id"], ["topology_nodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("topic_node_id", "user_id"),
    )
    op.create_index("ix_topic_members_topic_node_id", "topic_members", ["topic_node_id"])


def downgrade() -> None:
    op.drop_index("ix_topic_members_topic_node_id", table_name="topic_members")
    op.drop_table("topic_members")
