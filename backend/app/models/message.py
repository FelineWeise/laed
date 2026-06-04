from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
import uuid

from app.models.base import Base, BaseMixin


class Message(BaseMixin, Base):
    __tablename__ = "messages"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, server_default="false")
    message_type: Mapped[str] = mapped_column(String, server_default="chat")
    topic_node_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("topology_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )
    reply_to_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    triggered_ai: Mapped[bool] = mapped_column(Boolean, server_default="false")
    source_chunks: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    thread_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("thread_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )


class MessageContextAttachment(BaseMixin, Base):
    __tablename__ = "message_context_attachments"
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=True,
    )
    attachment_type: Mapped[str] = mapped_column(String, nullable=False)
    ref_id: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    attachment_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, server_default="{}"
    )
