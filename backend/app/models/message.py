from sqlalchemy import String, Text, Boolean, ForeignKey
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
