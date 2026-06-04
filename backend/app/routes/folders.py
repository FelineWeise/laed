from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_project_role
from app.models import User, ProjectMember, get_db
from app.models.folder import Folder, FolderInclusionSetting
from app.schemas.folders import (
    FolderCreate,
    FolderInclusionResponse,
    FolderInclusionUpdate,
    FolderResponse,
    FolderUpdate,
)
from app.services.folders import create_folder, get_folder, list_folders

router = APIRouter(prefix="/api/projects", tags=["folders"])


def _folder_response(row: Folder) -> FolderResponse:
    return FolderResponse.model_validate(row)


@router.get("/{project_id}/folders", response_model=list[FolderResponse])
async def list_project_folders(
    project_id: UUID,
    parent_id: UUID | None = None,
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    rows = await list_folders(db, project_id, parent_id=parent_id)
    return [_folder_response(r) for r in rows]


@router.post(
    "/{project_id}/folders",
    response_model=FolderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_folder(
    project_id: UUID,
    body: FolderCreate,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    try:
        folder = await create_folder(
            db,
            project_id=project_id,
            name=body.name,
            parent_id=body.parent_id,
            topic_node_id=body.topic_node_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await db.commit()
    await db.refresh(folder)
    return _folder_response(folder)


@router.get("/{project_id}/folders/{folder_id}", response_model=FolderResponse)
async def get_project_folder(
    project_id: UUID,
    folder_id: UUID,
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    folder = await get_folder(db, project_id, folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return _folder_response(folder)


@router.patch("/{project_id}/folders/{folder_id}", response_model=FolderResponse)
async def update_project_folder(
    project_id: UUID,
    folder_id: UUID,
    body: FolderUpdate,
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    folder = await get_folder(db, project_id, folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    if body.name is not None:
        folder.name = body.name
    if body.parent_id is not None:
        folder.parent_id = body.parent_id
    if body.topic_node_id is not None:
        folder.topic_node_id = body.topic_node_id
    await db.commit()
    await db.refresh(folder)
    return _folder_response(folder)


@router.delete("/{project_id}/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_folder(
    project_id: UUID,
    folder_id: UUID,
    _member: ProjectMember = Depends(require_project_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    folder = await get_folder(db, project_id, folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    await db.delete(folder)
    await db.commit()


@router.patch(
    "/{project_id}/folders/{folder_id}/inclusion",
    response_model=FolderInclusionResponse,
)
async def update_folder_inclusion(
    project_id: UUID,
    folder_id: UUID,
    body: FolderInclusionUpdate,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    folder = await get_folder(db, project_id, folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    result = await db.execute(
        select(FolderInclusionSetting).where(FolderInclusionSetting.folder_id == folder_id)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        setting = FolderInclusionSetting(
            folder_id=folder_id,
            project_id=project_id,
            included=body.included,
            updated_by=current_user.id,
        )
        db.add(setting)
    else:
        setting.included = body.included
        setting.updated_by = current_user.id

    await db.commit()
    await db.refresh(setting)
    return FolderInclusionResponse.model_validate(setting)
