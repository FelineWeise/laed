"""Topology graph bootstrap and layout helpers."""

from __future__ import annotations

import hashlib
import math
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project, ProjectMember
from app.models.topology import TopologyEdge, TopologyNode


def _global_position(project_id: uuid.UUID) -> dict[str, float]:
    digest = hashlib.sha256(str(project_id).encode()).digest()
    angle = (int.from_bytes(digest[:4], "big") % 360) * (math.pi / 180)
    radius = 120 + (int.from_bytes(digest[4:6], "big") % 80)
    return {
        "x": round(math.cos(angle) * radius, 1),
        "y": round(math.sin(angle) * radius, 1),
    }


def _project_center_position() -> dict[str, float]:
    return {"x": 0.0, "y": 0.0}


def _topic_position(index: int) -> dict[str, float]:
    angle = (index % 8) * (math.pi / 4)
    radius = 100.0
    return {
        "x": round(math.cos(angle) * radius, 1),
        "y": round(math.sin(angle) * radius, 1),
    }


async def bootstrap_project_topology(
    db: AsyncSession,
    project: Project,
    *,
    created_by: uuid.UUID | None,
) -> TopologyNode:
    """Create global mirror + project-scope center nodes (idempotent)."""
    global_existing = await db.execute(
        select(TopologyNode).where(
            TopologyNode.scope_type == "global",
            TopologyNode.node_type == "project",
            TopologyNode.ref_id == project.id,
        )
    )
    global_node = global_existing.scalar_one_or_none()
    if global_node is None:
        global_node = TopologyNode(
            scope_type="global",
            scope_id=None,
            node_type="project",
            ref_id=project.id,
            label=project.name,
            position=_global_position(project.id),
            node_metadata={"subtitle": project.description or ""},
            created_by=created_by,
        )
        db.add(global_node)
        await db.flush()

    project_existing = await db.execute(
        select(TopologyNode).where(
            TopologyNode.scope_type == "project",
            TopologyNode.scope_id == project.id,
            TopologyNode.node_type == "project",
            TopologyNode.ref_id == project.id,
        )
    )
    center = project_existing.scalar_one_or_none()
    if center is None:
        center = TopologyNode(
            scope_type="project",
            scope_id=project.id,
            node_type="project",
            ref_id=project.id,
            label=project.name,
            position=_project_center_position(),
            node_metadata={},
            created_by=created_by,
        )
        db.add(center)
        await db.flush()

    return center


async def sync_global_topology_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> None:
    """Ensure each member project has a global topology node."""
    result = await db.execute(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user_id)
        .where(Project.archived_at.is_(None))
    )
    projects = result.scalars().all()
    for project in projects:
        await bootstrap_project_topology(db, project, created_by=user_id)


def node_to_dict(node: TopologyNode) -> dict[str, Any]:
    return {
        "id": str(node.id),
        "scope_type": node.scope_type,
        "scope_id": str(node.scope_id) if node.scope_id else None,
        "node_type": node.node_type,
        "ref_id": str(node.ref_id) if node.ref_id else None,
        "label": node.label,
        "position": node.position,
        "metadata": node.node_metadata,
        "created_at": node.created_at.isoformat(),
    }


def edge_to_dict(edge: TopologyEdge) -> dict[str, Any]:
    return {
        "id": str(edge.id),
        "source_node_id": str(edge.source_node_id),
        "target_node_id": str(edge.target_node_id),
        "relation_type": edge.relation_type,
        "scope_type": edge.scope_type,
        "scope_id": str(edge.scope_id) if edge.scope_id else None,
        "metadata": edge.edge_metadata,
        "created_at": edge.created_at.isoformat(),
    }
