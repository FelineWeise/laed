from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Project, ProjectMember, get_db
from app.auth.dependencies import get_current_user, require_project_role
from app.services.project_hooks import on_project_created
from app.services.project_delete import delete_project_completely
from app.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    MemberAdd, MemberResponse,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(
        name=body.name,
        description=body.description,
        created_by=current_user.id,
        ownership_model=body.ownership_model,
    )
    db.add(project)
    await db.flush()

    membership = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(membership)
    await db.flush()
    await on_project_created(db, project, current_user)
    await db.commit()
    await db.refresh(project)

    return project


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == current_user.id)
        .where(Project.archived_at.is_(None))
    )
    return result.scalars().all()


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    _member: ProjectMember = Depends(require_project_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    updates = body.model_dump(exclude_unset=True)
    if "archived" in updates:
        archived = updates.pop("archived")
        if archived is True:
            project.archived_at = datetime.now(timezone.utc)
        elif archived is False:
            project.archived_at = None
    for field, value in updates.items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    _member: ProjectMember = Depends(require_project_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    await delete_project_completely(db, project_id)
    await db.commit()


# ── Membership ───────────────────────────────────────────

@router.post("/{project_id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: UUID,
    body: MemberAdd,
    _member: ProjectMember = Depends(require_project_role("admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email))
    invitee = result.scalar_one_or_none()
    if not invitee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.get(ProjectMember, (project_id, invitee.id))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")

    membership = ProjectMember(
        project_id=project_id,
        user_id=invitee.id,
        role=body.role,
        invited_by=current_user.id,
    )
    db.add(membership)
    await db.commit()
    await db.refresh(membership)

    return MemberResponse(
        user_id=membership.user_id,
        role=membership.role,
        joined_at=membership.joined_at,
        display_name=invitee.display_name,
        email=invitee.email,
    )


@router.get("/{project_id}/members", response_model=list[MemberResponse])
async def list_members(
    project_id: UUID,
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectMember, User.display_name, User.email)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
    )
    rows = result.all()
    return [
        MemberResponse(
            user_id=pm.user_id,
            role=pm.role,
            joined_at=pm.joined_at,
            display_name=name,
            email=email,
        )
        for pm, name, email in rows
    ]


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    project_id: UUID,
    user_id: UUID,
    _member: ProjectMember = Depends(require_project_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    membership = await db.get(ProjectMember, (project_id, user_id))
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if membership.role == "owner":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the owner")

    await db.delete(membership)
    await db.commit()
