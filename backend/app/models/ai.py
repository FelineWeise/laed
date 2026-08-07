from sqlalchemy import String, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from typing import Any
from sqlalchemy.dialects.postgresql import JSONB
import uuid

from app.models.base import Base, BaseMixin


class AIConversation(BaseMixin, Base):
    __tablename__ = "ai_conversations"
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, server_default="true")
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    topic_node_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("topology_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )
    linked_thread_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("thread_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )


class AIMessage(BaseMixin, Base):
    __tablename__ = "ai_messages"
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai_conversations.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_chunks: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
