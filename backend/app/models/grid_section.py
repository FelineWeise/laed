from __future__ import annotations

from typing import Any
import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class UserGridSection(BaseMixin, Base):
    __tablename__ = "user_grid_sections"
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")
    tag_filters: Mapped[list[str]] = mapped_column(ARRAY(String), server_default="{}")
    bounds: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
