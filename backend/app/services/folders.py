"""Folder path helpers and CRUD logic."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.folder import Folder, FolderInclusionSetting


def build_folder_path(parent_path: str | None, name: str) -> str:
    if not parent_path or parent_path == "/":
        return f"/{name}"
    return f"{parent_path.rstrip('/')}/{name}"


async def get_folder(
    db: AsyncSession,
    project_id: UUID,
    folder_id: UUID,
) -> Folder | None:
    row = await db.get(Folder, folder_id)
    if not row or row.project_id != project_id:
        return None
    return row


async def list_folders(
    db: AsyncSession,
    project_id: UUID,
    *,
    parent_id: UUID | None = None,
) -> list[Folder]:
    q = select(Folder).where(Folder.project_id == project_id)
    if parent_id is not None:
        q = q.where(Folder.parent_id == parent_id)
    result = await db.execute(q.order_by(Folder.path))
    return list(result.scalars().all())


async def ensure_default_uploads_folder(
    db: AsyncSession,
    project_id: UUID,
) -> Folder:
    result = await db.execute(
        select(Folder).where(
            Folder.project_id == project_id,
            Folder.path == "/Uploads",
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    folder = Folder(
        project_id=project_id,
        name="Uploads",
        path="/Uploads",
    )
    db.add(folder)
    await db.flush()
    db.add(
        FolderInclusionSetting(
            folder_id=folder.id,
            project_id=project_id,
            included=True,
        )
    )
    return folder


async def create_folder(
    db: AsyncSession,
    *,
    project_id: UUID,
    name: str,
    parent_id: UUID | None,
    topic_node_id: UUID | None,
) -> Folder:
    parent_path = "/"
    if parent_id is not None:
        parent = await get_folder(db, project_id, parent_id)
        if not parent:
            msg = "Parent folder not found"
            raise ValueError(msg)
        parent_path = parent.path

    path = build_folder_path(parent_path, name)
    folder = Folder(
        project_id=project_id,
        name=name,
        path=path,
        parent_id=parent_id,
        topic_node_id=topic_node_id,
    )
    db.add(folder)
    await db.flush()
    db.add(
        FolderInclusionSetting(
            folder_id=folder.id,
            project_id=project_id,
            included=True,
        )
    )
    return folder
