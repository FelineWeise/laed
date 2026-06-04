"""home grid, thread sessions, ai conversation titles

Revision ID: 0009_home_grid
Revises: 0008_thread_ai
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0009_home_grid"
down_revision: Union[str, Sequence[str], None] = "0008_thread_ai"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ai_conversations", sa.Column("title", sa.String(), nullable=True))

    op.create_table(
        "thread_sessions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("topic_node_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(), server_default="Main", nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["topic_node_id"], ["topology_nodes.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_thread_sessions_project_topic",
        "thread_sessions",
        ["project_id", "topic_node_id"],
    )

    op.add_column(
        "messages",
        sa.Column("thread_session_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_messages_thread_session_id",
        "messages",
        "thread_sessions",
        ["thread_session_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        """
        INSERT INTO thread_sessions (id, project_id, topic_node_id, title, created_by, created_at)
        SELECT
            gen_random_uuid(),
            m.project_id,
            m.topic_node_id,
            'Main',
            COALESCE(
                (SELECT p.created_by FROM projects p WHERE p.id = m.project_id LIMIT 1),
                (SELECT u.id FROM users u LIMIT 1)
            ),
            MIN(m.created_at)
        FROM messages m
        GROUP BY m.project_id, m.topic_node_id
        """
    )

    op.execute(
        """
        UPDATE messages m
        SET thread_session_id = ts.id
        FROM thread_sessions ts
        WHERE m.project_id = ts.project_id
          AND (
            (m.topic_node_id IS NULL AND ts.topic_node_id IS NULL)
            OR m.topic_node_id = ts.topic_node_id
          )
        """
    )

    op.add_column(
        "projects",
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.String()),
            server_default="{}",
            nullable=False,
        ),
    )

    op.create_table(
        "user_grid_sections",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "tag_filters",
            postgresql.ARRAY(sa.String()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("bounds", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("user_grid_sections")
    op.drop_column("projects", "tags")
    op.drop_constraint("fk_messages_thread_session_id", "messages", type_="foreignkey")
    op.drop_column("messages", "thread_session_id")
    op.drop_index("ix_thread_sessions_project_topic", table_name="thread_sessions")
    op.drop_table("thread_sessions")
    op.drop_column("ai_conversations", "title")
