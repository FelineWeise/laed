from sqlalchemy import String, Text, BigInteger, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
import uuid

from app.models.base import Base, BaseMixin


class File(BaseMixin, Base):
    __tablename__ = "files"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    filename: Mapped[str] = mapped_column(String, nullable=False)
    file_type: Mapped[str | None] = mapped_column(String)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    minio_key: Mapped[str] = mapped_column(String, nullable=False)
    ingestion_status: Mapped[str] = mapped_column(String, server_default="pending")


class FileChunk(BaseMixin, Base):
    """Text chunks + vector embeddings for RAG."""
    __tablename__ = "file_chunks"
    file_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("files.id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(Vector(768), nullable=True)
    token_count: Mapped[int | None] = mapped_column(Integer)
