from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import text
import uuid
from datetime import datetime

from app.models.base import Base, BaseMixin


class Project(BaseMixin, Base):
    __tablename__ = "projects"
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    ownership_model: Mapped[str] = mapped_column(String, server_default="owned")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProjectMember(Base):
    """Composite PK — uses project_id + user_id instead of UUID."""
    __tablename__ = "project_members"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String, server_default="member")
    invited_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
