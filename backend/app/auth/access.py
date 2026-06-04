from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import ROLE_HIERARCHY
from app.models.project import ProjectMember
from app.models.topic_member import TopicMember
from app.models.topology import TopologyNode


async def get_project_member(
    db: AsyncSession, project_id: UUID, user_id: UUID
) -> ProjectMember | None:
    return await db.get(ProjectMember, (project_id, user_id))


async def has_project_access(
    db: AsyncSession,
    project_id: UUID,
    user_id: UUID,
    *,
    min_role: str = "observer",
) -> bool:
    member = await get_project_member(db, project_id, user_id)
    if not member:
        return False
    return ROLE_HIERARCHY.index(member.role) >= ROLE_HIERARCHY.index(min_role)


async def get_topic_member(
    db: AsyncSession, topic_node_id: UUID, user_id: UUID
) -> TopicMember | None:
    return await db.get(TopicMember, (topic_node_id, user_id))


async def has_topic_access(
    db: AsyncSession,
    project_id: UUID,
    topic_node_id: UUID | None,
    user_id: UUID,
    *,
    min_role: str = "observer",
) -> bool:
    if await has_project_access(db, project_id, user_id, min_role=min_role):
        return True
    if topic_node_id is None:
        return False
    topic_member = await get_topic_member(db, topic_node_id, user_id)
    if not topic_member:
        return False
    return ROLE_HIERARCHY.index(topic_member.role) >= ROLE_HIERARCHY.index(min_role)


async def has_any_topic_access_in_project(
    db: AsyncSession, project_id: UUID, user_id: UUID
) -> bool:
    from sqlalchemy import select

    result = await db.execute(
        select(TopicMember.topic_node_id)
        .join(TopologyNode, TopologyNode.id == TopicMember.topic_node_id)
        .where(
            TopicMember.user_id == user_id,
            TopologyNode.scope_type == "project",
            TopologyNode.scope_id == project_id,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def resolve_topic_project_id(
    db: AsyncSession, topic_node_id: UUID
) -> tuple[TopologyNode, UUID] | None:
    node = await db.get(TopologyNode, topic_node_id)
    if not node or node.node_type != "topic" or node.scope_type != "project":
        return None
    if node.scope_id is None:
        return None
    return node, node.scope_id
