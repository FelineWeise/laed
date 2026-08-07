"""Widen file_chunks.embedding for Scaleway qwen3-embedding-8b (4096-dim).

Revision ID: 0016_embedding_dim_qwen3
Revises: 0015_ai_thread_link
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "0016_embedding_dim_qwen3"
down_revision: Union[str, Sequence[str], None] = "0015_ai_thread_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# App-DB legacy column; primary vectors live in rag.chunks_qwen3 (already 4096).
NEW_DIM = 4096
OLD_DIM = 768


def upgrade() -> None:
    # Existing 768-dim vectors are incompatible; drop and recreate.
    op.execute(sa.text("UPDATE file_chunks SET embedding = NULL"))
    op.alter_column(
        "file_chunks",
        "embedding",
        existing_type=Vector(OLD_DIM),
        type_=Vector(NEW_DIM),
        existing_nullable=True,
        postgresql_using="NULL",
    )


def downgrade() -> None:
    op.execute(sa.text("UPDATE file_chunks SET embedding = NULL"))
    op.alter_column(
        "file_chunks",
        "embedding",
        existing_type=Vector(NEW_DIM),
        type_=Vector(OLD_DIM),
        existing_nullable=True,
        postgresql_using="NULL",
    )
