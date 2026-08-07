"""File visibility and selective share grants."""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint, select, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin
from app.models.file import File


class FileGrant(BaseMixin, Base):
    """When a file is shared with specific members (is_private=false + grants)."""

    __tablename__ = "file_grants"
    __table_args__ = (
        UniqueConstraint("file_id", "user_id", name="uq_file_grants_file_user"),
    )

    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


async def list_grant_user_ids(db: AsyncSession, file_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(
        select(FileGrant.user_id).where(FileGrant.file_id == file_id)
    )
    return list(result.scalars().all())


async def replace_file_grants(
    db: AsyncSession,
    file_id: uuid.UUID,
    user_ids: list[uuid.UUID],
) -> None:
    await db.execute(
        text("DELETE FROM file_grants WHERE file_id = :fid"),
        {"fid": str(file_id)},
    )
    for uid in dict.fromkeys(user_ids):
        db.add(FileGrant(file_id=file_id, user_id=uid))


async def clear_file_grants(db: AsyncSession, file_id: uuid.UUID) -> None:
    await db.execute(
        text("DELETE FROM file_grants WHERE file_id = :fid"),
        {"fid": str(file_id)},
    )


async def file_is_visible_to(
    db: AsyncSession,
    row: File,
    user_id: uuid.UUID,
) -> bool:
    """Owner always sees private files; shared files use grants or project-wide."""
    if row.uploaded_by == user_id:
        return True
    if row.is_private:
        return False
    grant_ids = await list_grant_user_ids(db, row.id)
    if not grant_ids:
        return True  # everyone in project (caller must already be a member)
    return user_id in grant_ids


def visibility_scope_for_file(is_private: bool, grant_count: int) -> str:
    if is_private:
        return "private"
    if grant_count > 0:
        return "restricted"
    return "project"
