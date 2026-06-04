from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_project_role
from app.models import User, ProjectMember, get_db
from app.models.sharing import ProjectShareGrant, UserConnection
from app.schemas.sharing import (
    ShareGrantCreate,
    ShareGrantResponse,
    UserConnectionCreate,
    UserConnectionResponse,
)
from app.services.sharing.grants import (
    create_share_grant,
    list_grants_for_project,
    list_grants_for_user,
    revoke_share_grant,
)

router = APIRouter(prefix="/api/sharing", tags=["sharing"])


def _grant_response(grant: ProjectShareGrant) -> ShareGrantResponse:
    return ShareGrantResponse.model_validate(grant)


@router.get("/connections", response_model=list[UserConnectionResponse])
async def list_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserConnection).where(
            UserConnection.status == "active",
            (UserConnection.user_a_id == current_user.id)
            | (UserConnection.user_b_id == current_user.id),
        )
    )
    return [UserConnectionResponse.model_validate(c) for c in result.scalars().all()]


@router.post(
    "/connections",
    response_model=UserConnectionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_connection(
    body: UserConnectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.other_user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot connect to self")
    user_a, user_b = (
        (current_user.id, body.other_user_id)
        if str(current_user.id) < str(body.other_user_id)
        else (body.other_user_id, current_user.id)
    )
    conn = UserConnection(user_a_id=user_a, user_b_id=user_b, status="active")
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return UserConnectionResponse.model_validate(conn)


@router.get("/grants", response_model=list[ShareGrantResponse])
async def list_my_grants(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    grants = await list_grants_for_user(db, current_user.id, as_grantee=True)
    return [_grant_response(g) for g in grants]


@router.get("/projects/{project_id}/grants", response_model=list[ShareGrantResponse])
async def list_project_grants(
    project_id: UUID,
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    grants = await list_grants_for_project(db, project_id)
    return [_grant_response(g) for g in grants]


@router.post(
    "/projects/{project_id}/grants",
    response_model=ShareGrantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_grant(
    project_id: UUID,
    body: ShareGrantCreate,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    try:
        grant = await create_share_grant(
            db,
            grantor_user_id=current_user.id,
            grantee_user_id=body.grantee_user_id,
            project_id=project_id,
            folder_ids=body.folder_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await db.commit()
    await db.refresh(grant)
    return _grant_response(grant)


@router.delete("/grants/{grant_id}", response_model=ShareGrantResponse)
async def revoke_grant(
    grant_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        grant = await revoke_share_grant(db, grant_id, actor_user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if not grant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grant not found")
    await db.commit()
    await db.refresh(grant)
    return _grant_response(grant)
