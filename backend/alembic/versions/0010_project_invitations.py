"""project invitations

Revision ID: 0010_project_invitations
Revises: 0009_home_grid
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010_project_invitations"
down_revision: Union[str, Sequence[str], None] = "0009_home_grid"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_invitations",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("inviter_id", sa.UUID(), nullable=False),
        sa.Column("invitee_email", sa.String(), nullable=False),
        sa.Column("invitee_user_id", sa.UUID(), nullable=True),
        sa.Column("role", sa.String(), server_default="member", nullable=False),
        sa.Column("status", sa.String(), server_default="pending", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inviter_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["invitee_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_project_invitations_pending_email",
        "project_invitations",
        ["project_id", "invitee_email"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("ix_project_invitations_pending_email", table_name="project_invitations")
    op.drop_table("project_invitations")
