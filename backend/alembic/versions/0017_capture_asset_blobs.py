"""Capture assets: user-scoped MinIO blobs and optional file link.

Revision ID: 0017_capture_asset_blobs
Revises: 0016_embedding_dim_qwen3
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_capture_asset_blobs"
down_revision: Union[str, Sequence[str], None] = "0016_embedding_dim_qwen3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("capture_assets", "file_id", existing_type=sa.UUID(), nullable=True)
    op.add_column("capture_assets", sa.Column("minio_key", sa.String(), nullable=True))
    op.add_column(
        "capture_assets", sa.Column("derived_minio_key", sa.String(), nullable=True)
    )
    op.add_column("capture_assets", sa.Column("filename", sa.String(), nullable=True))
    op.add_column("capture_assets", sa.Column("content_type", sa.String(), nullable=True))
    op.add_column("capture_assets", sa.Column("source_mime", sa.String(), nullable=True))
    op.add_column(
        "capture_assets",
        sa.Column("asset_kind", sa.String(), server_default="image", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("capture_assets", "asset_kind")
    op.drop_column("capture_assets", "source_mime")
    op.drop_column("capture_assets", "content_type")
    op.drop_column("capture_assets", "filename")
    op.drop_column("capture_assets", "derived_minio_key")
    op.drop_column("capture_assets", "minio_key")
    op.alter_column("capture_assets", "file_id", existing_type=sa.UUID(), nullable=False)
