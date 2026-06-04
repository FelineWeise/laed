from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_project_role
from app.models import User, Project, ProjectMember, get_db
from app.models.project_invitation import ProjectInvitation
from app.schemas.invitation import InvitationCreate, InvitationResponse

router = APIRouter(tags=["invitations"])

INVITE_ROLES = frozenset({"member", "admin"})


def _to_response(inv: ProjectInvitation, project_name: str | None = None) -> InvitationResponse:
    return InvitationResponse(
        id=inv.id,
        project_id=inv.project_id,
        inviter_id=inv.inviter_id,
        invitee_email=inv.invitee_email,
        invitee_user_id=inv.invitee_user_id,
        role=inv.role,
        status=inv.status,
        created_at=inv.created_at,
        responded_at=inv.responded_at,
        project_name=project_name,
    )


@router.post(
    "/api/projects/{project_id}/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_invitation(
    project_id: UUID,
    body: InvitationCreate,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    if body.role not in INVITE_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    email = str(body.email).strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    invitee = result.scalar_one_or_none()

    if invitee:
        existing_member = await db.get(ProjectMember, (project_id, invitee.id))
        if existing_member:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member",
            )

    pending = await db.execute(
        select(ProjectInvitation).where(
            ProjectInvitation.project_id == project_id,
            ProjectInvitation.invitee_email == email,
            ProjectInvitation.status == "pending",
        )
    )
    if pending.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invitation already pending",
        )

    inv = ProjectInvitation(
        project_id=project_id,
        inviter_id=current_user.id,
        invitee_email=email,
        invitee_user_id=invitee.id if invitee else None,
        role=body.role,
        status="pending",
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return _to_response(inv, project.name)


@router.get(
    "/api/projects/{project_id}/invitations",
    response_model=list[InvitationResponse],
)
async def list_project_invitations(
    project_id: UUID,
    _member: ProjectMember = Depends(require_project_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    result = await db.execute(
        select(ProjectInvitation)
        .where(
            ProjectInvitation.project_id == project_id,
            ProjectInvitation.status == "pending",
        )
        .order_by(ProjectInvitation.created_at.desc())
    )
    return [_to_response(i, project.name) for i in result.scalars().all()]


@router.delete(
    "/api/projects/{project_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_invitation(
    project_id: UUID,
    invitation_id: UUID,
    _member: ProjectMember = Depends(require_project_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    inv = await db.get(ProjectInvitation, invitation_id)
    if not inv or inv.project_id != project_id or inv.status != "pending":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    inv.status = "rejected"
    inv.responded_at = datetime.now(timezone.utc)
    await db.commit()


@router.get("/api/users/me/invitations", response_model=list[InvitationResponse])
async def list_my_invitations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    email = current_user.email.lower()
    result = await db.execute(
        select(ProjectInvitation, Project.name)
        .join(Project, Project.id == ProjectInvitation.project_id)
        .where(
            ProjectInvitation.status == "pending",
            or_(
                ProjectInvitation.invitee_user_id == current_user.id,
                ProjectInvitation.invitee_email == email,
            ),
        )
        .order_by(ProjectInvitation.created_at.desc())
    )
    return [_to_response(inv, name) for inv, name in result.all()]


async def _get_pending_for_user(
    db: AsyncSession, invitation_id: UUID, user: User
) -> tuple[ProjectInvitation, Project]:
    inv = await db.get(ProjectInvitation, invitation_id)
    if not inv or inv.status != "pending":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if inv.invitee_user_id != user.id and inv.invitee_email.lower() != user.email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your invitation")
    project = await db.get(Project, inv.project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return inv, project


@router.post("/api/invitations/{invitation_id}/accept", response_model=InvitationResponse)
async def accept_invitation(
    invitation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    inv, project = await _get_pending_for_user(db, invitation_id, current_user)

    existing = await db.get(ProjectMember, (inv.project_id, current_user.id))
    if not existing:
        db.add(
            ProjectMember(
                project_id=inv.project_id,
                user_id=current_user.id,
                role=inv.role,
                invited_by=inv.inviter_id,
            )
        )

    inv.status = "accepted"
    inv.invitee_user_id = current_user.id
    inv.responded_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inv)
    return _to_response(inv, project.name)


@router.post("/api/invitations/{invitation_id}/reject", response_model=InvitationResponse)
async def reject_invitation(
    invitation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    inv, project = await _get_pending_for_user(db, invitation_id, current_user)
    inv.status = "rejected"
    inv.responded_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inv)
    return _to_response(inv, project.name)
