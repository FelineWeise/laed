from sqlalchemy import String, ForeignKey, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import INET
import uuid

from app.models.base import Base, BaseMixin


class AccessLog(BaseMixin, Base):
    __tablename__ = "access_log"
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String, nullable=False)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    ip_address = mapped_column(INET, nullable=True)
