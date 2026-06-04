"""Project share grants and linked retrieval expansion."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sharing import ProjectShareGrant, ShareGrantAuditLog, UserConnection
from app.services.retrieval.scope import RetrievalScope



async def expand_scope_with_grants(
    scope: RetrievalScope,
    user_id: UUID,
    db: AsyncSession,
) -> RetrievalScope:
    """Populate linked_project_ids / linked_folder_ids from active grants."""
    if not scope.include_linked:
        return scope

    result = await db.execute(
        select(ProjectShareGrant).where(
            ProjectShareGrant.grantee_user_id == user_id,
            ProjectShareGrant.revoked_at.is_(None),
        )
    )
    grants = list(result.scalars().all())

    linked_projects: list[UUID] = []
    linked_folders: list[UUID] = []
    primary_set = set(scope.primary_project_ids())

    for grant in grants:
        if grant.project_id in primary_set:
            continue
        linked_projects.append(grant.project_id)
        linked_folders.extend(grant.folder_ids or [])

    return scope.model_copy(
        update={
            "linked_project_ids": linked_projects,
            "linked_folder_ids": list(dict.fromkeys(linked_folders)),
        }
    )


async def list_grants_for_user(
    db: AsyncSession,
    user_id: UUID,
    *,
    as_grantee: bool = True,
) -> list[ProjectShareGrant]:
    col = (
        ProjectShareGrant.grantee_user_id
        if as_grantee
        else ProjectShareGrant.grantor_user_id
    )
    result = await db.execute(
        select(ProjectShareGrant).where(
            col == user_id,
            ProjectShareGrant.revoked_at.is_(None),
        )
    )
    return list(result.scalars().all())


async def list_grants_for_project(
    db: AsyncSession,
    project_id: UUID,
) -> list[ProjectShareGrant]:
    result = await db.execute(
        select(ProjectShareGrant).where(
            ProjectShareGrant.project_id == project_id,
            ProjectShareGrant.revoked_at.is_(None),
        )
    )
    return list(result.scalars().all())


async def _require_connection(
    db: AsyncSession,
    user_a: UUID,
    user_b: UUID,
) -> UserConnection | None:
    result = await db.execute(
        select(UserConnection).where(
            UserConnection.status == "active",
            (
                (UserConnection.user_a_id == user_a)
                & (UserConnection.user_b_id == user_b)
            )
            | (
                (UserConnection.user_a_id == user_b)
                & (UserConnection.user_b_id == user_a)
            ),
        )
    )
    return result.scalar_one_or_none()


async def create_share_grant(
    db: AsyncSession,
    *,
    grantor_user_id: UUID,
    grantee_user_id: UUID,
    project_id: UUID,
    folder_ids: list[UUID] | None = None,
) -> ProjectShareGrant:
    connection = await _require_connection(db, grantor_user_id, grantee_user_id)
    if connection is None:
        msg = "Users must have an active connection before sharing"
        raise ValueError(msg)

    grant = ProjectShareGrant(
        grantor_user_id=grantor_user_id,
        grantee_user_id=grantee_user_id,
        project_id=project_id,
        folder_ids=folder_ids or [],
    )
    db.add(grant)
    await db.flush()
    db.add(
        ShareGrantAuditLog(
            grant_id=grant.id,
            action="created",
            actor_user_id=grantor_user_id,
            details={"folder_ids": [str(f) for f in (folder_ids or [])]},
        )
    )
    return grant


async def revoke_share_grant(
    db: AsyncSession,
    grant_id: UUID,
    *,
    actor_user_id: UUID,
) -> ProjectShareGrant | None:
    grant = await db.get(ProjectShareGrant, grant_id)
    if not grant or grant.revoked_at is not None:
        return None
    if grant.grantor_user_id != actor_user_id:
        msg = "Only the grantor may revoke"
        raise ValueError(msg)

    grant.revoked_at = datetime.now(timezone.utc)
    db.add(
        ShareGrantAuditLog(
            grant_id=grant.id,
            action="revoked",
            actor_user_id=actor_user_id,
            details={},
        )
    )
    return grant
