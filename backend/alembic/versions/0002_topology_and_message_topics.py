"""topology and message topics

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "topology_nodes",
        sa.Column("scope_type", sa.String(), nullable=False),
        sa.Column("scope_id", sa.UUID(), nullable=True),
        sa.Column("node_type", sa.String(), nullable=False),
        sa.Column("ref_id", sa.UUID(), nullable=True),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("position", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_topology_nodes_scope", "topology_nodes", ["scope_type", "scope_id"])
    op.create_index(
        "ix_topology_nodes_project_ref",
        "topology_nodes",
        ["scope_type", "ref_id"],
        unique=True,
        postgresql_where=sa.text("node_type = 'project' AND scope_type = 'global'"),
    )

    op.create_table(
        "topology_edges",
        sa.Column("source_node_id", sa.UUID(), nullable=False),
        sa.Column("target_node_id", sa.UUID(), nullable=False),
        sa.Column("relation_type", sa.String(), nullable=False),
        sa.Column("scope_type", sa.String(), nullable=False),
        sa.Column("scope_id", sa.UUID(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["source_node_id"], ["topology_nodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_node_id"], ["topology_nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_topology_edges_scope", "topology_edges", ["scope_type", "scope_id"])

    op.add_column(
        "messages",
        sa.Column("topic_node_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_messages_topic_node_id",
        "messages",
        "topology_nodes",
        ["topic_node_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "files",
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("files", "metadata")
    op.drop_constraint("fk_messages_topic_node_id", "messages", type_="foreignkey")
    op.drop_column("messages", "topic_node_id")
    op.drop_table("topology_edges")
    op.drop_table("topology_nodes")
