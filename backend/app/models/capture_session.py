from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class CaptureSession(BaseMixin, Base):
    __tablename__ = "capture_sessions"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, server_default="", nullable=False)
    status: Mapped[str] = mapped_column(String, server_default="active", nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    topic_node_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("topology_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )
    transcript: Mapped[str] = mapped_column(Text, server_default="", nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
    session_metadata: Mapped[dict[str, Any]] = mapped_column(
        "session_metadata",
        JSONB,
        server_default="{}",
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CaptureAsset(BaseMixin, Base):
    __tablename__ = "capture_assets"
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("capture_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("files.id", ondelete="CASCADE"),
        nullable=True,
    )
    minio_key: Mapped[str | None] = mapped_column(String, nullable=True)
    derived_minio_key: Mapped[str | None] = mapped_column(String, nullable=True)
    filename: Mapped[str | None] = mapped_column(String, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String, nullable=True)
    source_mime: Mapped[str | None] = mapped_column(String, nullable=True)
    asset_kind: Mapped[str] = mapped_column(String, server_default="image", nullable=False)
