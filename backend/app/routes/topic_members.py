from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.access import resolve_topic_project_id
from app.auth.dependencies import get_current_user, require_project_role
from app.models import ProjectMember, User, get_db
from app.models.topic_member import TopicMember
from app.schemas import MemberAdd, MemberResponse

router = APIRouter(prefix="/api/topology/nodes", tags=["topic-members"])


async def _require_topic_admin(
    topic_node_id: UUID,
    current_user: User,
    db: AsyncSession,
) -> tuple[UUID, ProjectMember | None]:
    resolved = await resolve_topic_project_id(db, topic_node_id)
    if not resolved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")
    _node, project_id = resolved
    member = await db.get(ProjectMember, (project_id, current_user.id))
    if member and member.role in ("admin", "owner"):
        return project_id, member
    topic_member = await db.get(TopicMember, (topic_node_id, current_user.id))
    if topic_member and topic_member.role in ("admin", "owner"):
        return project_id, None
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")


@router.post("/{topic_node_id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def add_topic_member(
    topic_node_id: UUID,
    body: MemberAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project_id, _ = await _require_topic_admin(topic_node_id, current_user, db)

    result = await db.execute(select(User).where(User.email == body.email))
    invitee = result.scalar_one_or_none()
    if not invitee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.get(TopicMember, (topic_node_id, invitee.id))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")

    membership = TopicMember(
        topic_node_id=topic_node_id,
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


@router.get("/{topic_node_id}/members", response_model=list[MemberResponse])
async def list_topic_members(
    topic_node_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    resolved = await resolve_topic_project_id(db, topic_node_id)
    if not resolved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")
    _node, project_id = resolved

    if not await db.get(ProjectMember, (project_id, current_user.id)):
        topic_member = await db.get(TopicMember, (topic_node_id, current_user.id))
        if not topic_member:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    result = await db.execute(
        select(TopicMember, User.display_name, User.email)
        .join(User, User.id == TopicMember.user_id)
        .where(TopicMember.topic_node_id == topic_node_id)
    )
    rows = result.all()
    return [
        MemberResponse(
            user_id=tm.user_id,
            role=tm.role,
            joined_at=tm.joined_at,
            display_name=name,
            email=email,
        )
        for tm, name, email in rows
    ]


@router.delete("/{topic_node_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_topic_member(
    topic_node_id: UUID,
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_topic_admin(topic_node_id, current_user, db)

    membership = await db.get(TopicMember, (topic_node_id, user_id))
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    await db.delete(membership)
    await db.commit()
