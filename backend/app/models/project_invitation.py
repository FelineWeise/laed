from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class ProjectInvitation(BaseMixin, Base):
    __tablename__ = "project_invitations"
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    inviter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    invitee_email: Mapped[str] = mapped_column(String, nullable=False)
    invitee_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    role: Mapped[str] = mapped_column(String, server_default="member", nullable=False)
    status: Mapped[str] = mapped_column(String, server_default="pending", nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
