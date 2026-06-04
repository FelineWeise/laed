"""folders and file folder_id

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_folders"
down_revision: Union[str, Sequence[str], None] = "0004_harness"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "folders",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("topic_node_id", sa.UUID(), nullable=True),
        sa.Column("parent_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["folders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_node_id"], ["topology_nodes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_folders_project_id", "folders", ["project_id"])

    op.create_table(
        "folder_inclusion_settings",
        sa.Column("folder_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("included", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["folder_id"], ["folders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("folder_id", name="uq_folder_inclusion_settings_folder_id"),
    )

    op.add_column("files", sa.Column("folder_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_files_folder_id",
        "files",
        "folders",
        ["folder_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.execute(
        """
        INSERT INTO folders (project_id, name, path)
        SELECT p.id, 'Uploads', '/Uploads'
        FROM projects p
        WHERE NOT EXISTS (
            SELECT 1 FROM folders f
            WHERE f.project_id = p.id AND f.path = '/Uploads'
        )
        """
    )
    op.execute(
        """
        UPDATE files f
        SET folder_id = (
            SELECT fo.id FROM folders fo
            WHERE fo.project_id = f.project_id AND fo.path = '/Uploads'
            LIMIT 1
        )
        WHERE f.folder_id IS NULL
        """
    )
    op.alter_column("files", "folder_id", nullable=False)


def downgrade() -> None:
    op.drop_constraint("fk_files_folder_id", "files", type_="foreignkey")
    op.drop_column("files", "folder_id")
    op.drop_table("folder_inclusion_settings")
    op.drop_table("folders")
