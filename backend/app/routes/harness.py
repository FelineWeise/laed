from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_project_role
from app.models import User, ProjectMember, get_db
from app.models.harness import HarnessDocument
from app.schemas.harness import (
    HarnessDocumentCreate,
    HarnessDocumentResponse,
    HarnessDocumentUpdate,
)

router = APIRouter(tags=["harness"])


def _doc_response(row: HarnessDocument) -> HarnessDocumentResponse:
    return HarnessDocumentResponse.model_validate(row)


async def _get_owned_document(
    db: AsyncSession,
    *,
    doc_id: UUID,
    user_id: UUID,
    project_id: UUID | None,
) -> HarnessDocument:
    row = await db.get(HarnessDocument, doc_id)
    if not row or row.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if row.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return row


@router.get("/api/harness/documents", response_model=list[HarnessDocumentResponse])
async def list_global_harness_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(HarnessDocument)
        .where(
            HarnessDocument.user_id == current_user.id,
            HarnessDocument.project_id.is_(None),
        )
        .order_by(HarnessDocument.slug)
    )
    return [_doc_response(row) for row in result.scalars().all()]


@router.post(
    "/api/harness/documents",
    response_model=HarnessDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_global_harness_document(
    body: HarnessDocumentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = HarnessDocument(
        user_id=current_user.id,
        project_id=None,
        slug=body.slug,
        filename=body.filename,
        content=body.content,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A document with this slug already exists",
        )
    await db.refresh(row)
    return _doc_response(row)


@router.get("/api/harness/documents/{doc_id}", response_model=HarnessDocumentResponse)
async def get_global_harness_document(
    doc_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_document(
        db, doc_id=doc_id, user_id=current_user.id, project_id=None
    )
    return _doc_response(row)


@router.put("/api/harness/documents/{doc_id}", response_model=HarnessDocumentResponse)
async def update_global_harness_document(
    doc_id: UUID,
    body: HarnessDocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_document(
        db, doc_id=doc_id, user_id=current_user.id, project_id=None
    )
    if body.filename is not None:
        row.filename = body.filename
    if body.content is not None:
        row.content = body.content
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _doc_response(row)


@router.delete("/api/harness/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_global_harness_document(
    doc_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_document(
        db, doc_id=doc_id, user_id=current_user.id, project_id=None
    )
    await db.delete(row)
    await db.commit()


@router.get(
    "/api/projects/{project_id}/harness/documents",
    response_model=list[HarnessDocumentResponse],
)
async def list_project_harness_documents(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(HarnessDocument)
        .where(
            HarnessDocument.user_id == current_user.id,
            HarnessDocument.project_id == project_id,
        )
        .order_by(HarnessDocument.slug)
    )
    return [_doc_response(row) for row in result.scalars().all()]


@router.post(
    "/api/projects/{project_id}/harness/documents",
    response_model=HarnessDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_harness_document(
    project_id: UUID,
    body: HarnessDocumentCreate,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    row = HarnessDocument(
        user_id=current_user.id,
        project_id=project_id,
        slug=body.slug,
        filename=body.filename,
        content=body.content,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A document with this slug already exists",
        )
    await db.refresh(row)
    return _doc_response(row)


@router.get(
    "/api/projects/{project_id}/harness/documents/{doc_id}",
    response_model=HarnessDocumentResponse,
)
async def get_project_harness_document(
    project_id: UUID,
    doc_id: UUID,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_document(
        db, doc_id=doc_id, user_id=current_user.id, project_id=project_id
    )
    return _doc_response(row)


@router.put(
    "/api/projects/{project_id}/harness/documents/{doc_id}",
    response_model=HarnessDocumentResponse,
)
async def update_project_harness_document(
    project_id: UUID,
    doc_id: UUID,
    body: HarnessDocumentUpdate,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_document(
        db, doc_id=doc_id, user_id=current_user.id, project_id=project_id
    )
    if body.filename is not None:
        row.filename = body.filename
    if body.content is not None:
        row.content = body.content
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _doc_response(row)


@router.delete(
    "/api/projects/{project_id}/harness/documents/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_project_harness_document(
    project_id: UUID,
    doc_id: UUID,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned_document(
        db, doc_id=doc_id, user_id=current_user.id, project_id=project_id
    )
    await db.delete(row)
    await db.commit()
