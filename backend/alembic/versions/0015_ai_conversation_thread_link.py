"""Link AI conversations to thread sessions for unified history delete

Revision ID: 0015_ai_thread_link
Revises: 0014_capture_private
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0015_ai_thread_link"
down_revision: Union[str, Sequence[str], None] = "0014_capture_private"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_conversations",
        sa.Column("linked_thread_session_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_ai_conversations_linked_thread_session_id",
        "ai_conversations",
        "thread_sessions",
        ["linked_thread_session_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_ai_conversations_linked_thread_session_id",
        "ai_conversations",
        type_="foreignkey",
    )
    op.drop_column("ai_conversations", "linked_thread_session_id")
