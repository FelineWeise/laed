from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File as UploadFileParam, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_project_role
from app.models import User, ProjectMember, get_db
from app.models.file import File
from app.schemas.files import FileDetailResponse, FileResponse, FileUpdate
from app.services.file_service import new_file_id, presigned_get_url, upload_bytes
from app.services.folders import get_folder
from app.services.ingestion import ingest_file

router = APIRouter(prefix="/api/projects", tags=["files"])


def _file_response(row: File) -> FileResponse:
    return FileResponse(
        id=row.id,
        project_id=row.project_id,
        folder_id=row.folder_id,
        filename=row.filename,
        file_type=row.file_type,
        file_size_bytes=row.file_size_bytes,
        minio_key=row.minio_key,
        ingestion_status=row.ingestion_status,
        is_private=row.is_private,
        metadata=row.file_metadata or {},
        created_at=row.created_at,
    )


def _visible_file(row: File, user_id: UUID) -> bool:
    if not row.is_private:
        return True
    return row.uploaded_by == user_id


@router.post(
    "/{project_id}/files",
    response_model=FileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file(
    project_id: UUID,
    file: UploadFile = UploadFileParam(...),
    folder_id: UUID | None = Form(default=None),
    topic_node_id: UUID | None = Form(default=None),
    is_private: bool = Form(default=False),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    if folder_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="folder_id is required",
        )

    folder = await get_folder(db, project_id, folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    file_id = new_file_id()
    raw = await file.read()
    metadata: dict[str, object] = {
        "folder_id": str(folder_id),
        "folder_path": folder.path,
    }
    if topic_node_id is not None:
        metadata["topic_node_id"] = str(topic_node_id)

    key = upload_bytes(
        project_id,
        file_id,
        file.filename or "upload.bin",
        raw,
        file.content_type,
    )

    row = File(
        id=file_id,
        project_id=project_id,
        folder_id=folder_id,
        uploaded_by=current_user.id,
        filename=file.filename or "upload.bin",
        file_type=file.content_type,
        file_size_bytes=len(raw),
        minio_key=key,
        ingestion_status="pending",
        file_metadata=metadata,
        is_private=is_private,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    ingest_file.delay(str(row.id))
    return _file_response(row)


@router.get("/{project_id}/files", response_model=list[FileResponse])
async def list_files(
    project_id: UUID,
    topic_node_id: UUID | None = Query(default=None),
    folder_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(File).where(File.project_id == project_id))
    rows = [r for r in result.scalars().all() if _visible_file(r, current_user.id)]
    if folder_id is not None:
        rows = [r for r in rows if r.folder_id == folder_id]
    if topic_node_id is None:
        return [_file_response(r) for r in rows]
    tid = str(topic_node_id)
    filtered = [
        r
        for r in rows
        if (r.file_metadata or {}).get("topic_node_id") == tid
    ]
    return [_file_response(r) for r in filtered]


@router.patch("/{project_id}/files/{file_id}", response_model=FileResponse)
async def patch_file(
    project_id: UUID,
    file_id: UUID,
    body: FileUpdate,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(File, file_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if row.uploaded_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your file")
    if body.is_private is not None:
        row.is_private = body.is_private
    await db.commit()
    await db.refresh(row)
    return _file_response(row)


@router.get("/{project_id}/files/{file_id}", response_model=FileDetailResponse)
async def get_file(
    project_id: UUID,
    file_id: UUID,
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(File, file_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    base = _file_response(row)
    return FileDetailResponse(
        **base.model_dump(),
        download_url=presigned_get_url(row.minio_key),
    )
