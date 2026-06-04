"""Hard-delete a project and dependent rows (FK-safe order)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AIConversation,
    AIMessage,
    AccessLog,
    File,
    FileChunk,
    Folder,
    FolderInclusionSetting,
    HarnessDocument,
    Message,
    Project,
    ProjectInvitation,
    ProjectMember,
    ProjectShareGrant,
    ShareGrantAuditLog,
    ThreadSession,
    TopicMember,
    TopologyEdge,
    TopologyNode,
)

_DEMO_NAME = "demo project"
_DEMO_DESCRIPTION_MARKERS = (
    "%seeded for test%",
    "%first app demo%",
    "%demo login%",
)


async def delete_project_completely(db: AsyncSession, project_id: UUID) -> None:
    conv_ids = select(AIConversation.id).where(AIConversation.project_id == project_id)
    await db.execute(
        delete(AIMessage).where(AIMessage.conversation_id.in_(conv_ids))
    )
    await db.execute(
        delete(AIConversation).where(AIConversation.project_id == project_id)
    )

    file_ids = select(File.id).where(File.project_id == project_id)
    await db.execute(delete(FileChunk).where(FileChunk.file_id.in_(file_ids)))
    await db.execute(delete(FileChunk).where(FileChunk.project_id == project_id))
    await db.execute(delete(File).where(File.project_id == project_id))

    await db.execute(delete(Message).where(Message.project_id == project_id))
    await db.execute(delete(ThreadSession).where(ThreadSession.project_id == project_id))

    project_node_ids = select(TopologyNode.id).where(
        or_(
            and_(
                TopologyNode.scope_type == "project",
                TopologyNode.scope_id == project_id,
            ),
            and_(
                TopologyNode.scope_type == "global",
                TopologyNode.node_type == "project",
                TopologyNode.ref_id == project_id,
            ),
        )
    )
    await db.execute(
        delete(TopologyEdge).where(
            or_(
                TopologyEdge.source_node_id.in_(project_node_ids),
                TopologyEdge.target_node_id.in_(project_node_ids),
            )
        )
    )
    await db.execute(
        delete(TopicMember).where(TopicMember.topic_node_id.in_(project_node_ids))
    )
    await db.execute(
        delete(TopologyNode).where(
            or_(
                and_(
                    TopologyNode.scope_type == "project",
                    TopologyNode.scope_id == project_id,
                ),
                and_(
                    TopologyNode.scope_type == "global",
                    TopologyNode.node_type == "project",
                    TopologyNode.ref_id == project_id,
                ),
            )
        )
    )

    await db.execute(
        delete(FolderInclusionSetting).where(
            FolderInclusionSetting.project_id == project_id
        )
    )
    await db.execute(delete(Folder).where(Folder.project_id == project_id))
    await db.execute(
        delete(HarnessDocument).where(HarnessDocument.project_id == project_id)
    )

    grant_ids = select(ProjectShareGrant.id).where(
        ProjectShareGrant.project_id == project_id
    )
    await db.execute(
        delete(ShareGrantAuditLog).where(
            ShareGrantAuditLog.grant_id.in_(grant_ids)
        )
    )
    await db.execute(
        delete(ProjectShareGrant).where(ProjectShareGrant.project_id == project_id)
    )

    await db.execute(
        delete(ProjectInvitation).where(ProjectInvitation.project_id == project_id)
    )
    await db.execute(
        delete(ProjectMember).where(ProjectMember.project_id == project_id)
    )
    await db.execute(delete(AccessLog).where(AccessLog.project_id == project_id))
    await db.execute(delete(Project).where(Project.id == project_id))


def _is_seed_demo_project(name: str, description: str | None) -> bool:
    lowered_name = name.strip().lower()
    if lowered_name == _DEMO_NAME or lowered_name.startswith("demo project"):
        return True
    desc = (description or "").lower()
    return any(
        marker.strip("%") in desc
        for marker in _DEMO_DESCRIPTION_MARKERS
    )


async def purge_seed_demo_projects(db: AsyncSession) -> int:
    """Remove legacy DEMO PROJECT rows and orphan canvas nodes (idempotent)."""
    result = await db.execute(select(Project))
    projects = [
        p
        for p in result.scalars().all()
        if _is_seed_demo_project(p.name, p.description)
    ]
    for project in projects:
        await delete_project_completely(db, project.id)

    demo_nodes = await db.execute(
        select(TopologyNode).where(
            TopologyNode.scope_type == "global",
            TopologyNode.node_type == "project",
            func.lower(TopologyNode.label).like("%demo project%"),
        )
    )
    orphan_nodes = list(demo_nodes.scalars().all())
    for node in orphan_nodes:
        await db.execute(
            delete(TopologyEdge).where(
                or_(
                    TopologyEdge.source_node_id == node.id,
                    TopologyEdge.target_node_id == node.id,
                )
            )
        )
        await db.execute(delete(TopologyNode).where(TopologyNode.id == node.id))

    if projects or orphan_nodes:
        await db.commit()
    return len(projects)
