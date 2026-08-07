from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File as UploadFileParam, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_project_role
from app.models import User, ProjectMember, get_db
from app.models.file import File
from app.models.file_grant import file_is_visible_to, list_grant_user_ids
from app.schemas.files import FileDetailResponse, FileResponse, FileUpdate
from app.services.file_service import download_bytes, new_file_id, upload_bytes
from app.services.file_visibility import apply_file_visibility
from app.services.folders import get_folder
from app.services.ingestion import ingest_file

router = APIRouter(prefix="/api/projects", tags=["files"])


def _file_response(row: File, *, shared_with: list[UUID] | None = None) -> FileResponse:
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
        shared_with_user_ids=shared_with or [],
        metadata=row.file_metadata or {},
        created_at=row.created_at,
    )


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
    rows: list[File] = []
    for r in result.scalars().all():
        if await file_is_visible_to(db, r, current_user.id):
            rows.append(r)
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
    if body.is_private is None and body.share_with_user_ids is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_private or share_with_user_ids required",
        )
    is_private = row.is_private if body.is_private is None else body.is_private
    share_ids = body.share_with_user_ids
    if is_private:
        share_ids = []
    await apply_file_visibility(
        db,
        row,
        is_private=is_private,
        share_with_user_ids=share_ids,
        trigger_ingest=True,
    )
    await db.commit()
    await db.refresh(row)
    grants = await list_grant_user_ids(db, row.id)
    return _file_response(row, shared_with=grants)


@router.get("/{project_id}/files/{file_id}", response_model=FileDetailResponse)
async def get_file(
    project_id: UUID,
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(File, file_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if not await file_is_visible_to(db, row, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    grants = await list_grant_user_ids(db, row.id)
    base = _file_response(row, shared_with=grants)
    return FileDetailResponse(
        **base.model_dump(),
        download_url=f"/api/projects/{project_id}/files/{file_id}/download",
    )


@router.get("/{project_id}/files/{file_id}/download")
async def download_file(
    project_id: UUID,
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(File, file_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if not await file_is_visible_to(db, row, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    data = download_bytes(row.minio_key)
    media_type = row.file_type or "application/octet-stream"
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{row.filename}"',
        },
    )
