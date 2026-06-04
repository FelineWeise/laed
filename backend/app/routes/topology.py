from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_project_role
from app.models import User, Project, ProjectMember, get_db
from app.models.topology import TopologyEdge, TopologyNode
from app.schemas.topology import (
    TopologyEdgeCreate,
    TopologyEdgeResponse,
    TopologyGraphResponse,
    TopologyNodeCreate,
    TopologyNodeResponse,
    TopologyNodeUpdate,
)
from app.services.topology_service import (
    _topic_position,
    bootstrap_project_topology,
    sync_global_topology_for_user,
)

router = APIRouter(tags=["topology"])


def _node_response(node: TopologyNode) -> TopologyNodeResponse:
    return TopologyNodeResponse(
        id=node.id,
        scope_type=node.scope_type,
        scope_id=node.scope_id,
        node_type=node.node_type,
        ref_id=node.ref_id,
        label=node.label,
        position=node.position,
        metadata=node.node_metadata,
        created_at=node.created_at.isoformat(),
    )


def _edge_response(edge: TopologyEdge) -> TopologyEdgeResponse:
    return TopologyEdgeResponse(
        id=edge.id,
        source_node_id=edge.source_node_id,
        target_node_id=edge.target_node_id,
        relation_type=edge.relation_type,
        scope_type=edge.scope_type,
        scope_id=edge.scope_id,
        metadata=edge.edge_metadata,
        created_at=edge.created_at.isoformat(),
    )


@router.get("/api/topology/global", response_model=TopologyGraphResponse)
async def get_global_topology(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await sync_global_topology_for_user(db, current_user.id)
    await db.commit()

    nodes_result = await db.execute(
        select(TopologyNode).where(TopologyNode.scope_type == "global")
    )
    nodes = nodes_result.scalars().all()
    node_ids = [n.id for n in nodes]
    edges: list[TopologyEdge] = []
    if node_ids:
        edges_result = await db.execute(
            select(TopologyEdge).where(
                TopologyEdge.scope_type == "global",
                TopologyEdge.source_node_id.in_(node_ids),
            )
        )
        edges = list(edges_result.scalars().all())

    return TopologyGraphResponse(
        nodes=[_node_response(n) for n in nodes],
        edges=[_edge_response(e) for e in edges],
    )


@router.get("/api/projects/{project_id}/topology", response_model=TopologyGraphResponse)
async def get_project_topology(
    project_id: UUID,
    _member: ProjectMember = Depends(require_project_role("observer")),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    await bootstrap_project_topology(db, project, created_by=_member.user_id)
    await db.commit()

    nodes_result = await db.execute(
        select(TopologyNode).where(
            TopologyNode.scope_type == "project",
            TopologyNode.scope_id == project_id,
        )
    )
    nodes = list(nodes_result.scalars().all())
    node_ids = [n.id for n in nodes]

    edges_result = await db.execute(
        select(TopologyEdge).where(
            TopologyEdge.scope_type == "project",
            TopologyEdge.scope_id == project_id,
        )
    )
    edges = list(edges_result.scalars().all())

    center = next((n for n in nodes if n.node_type == "project"), None)
    topics = [n for n in nodes if n.node_type == "topic"]
    if center and topics:
        existing_contains = {
            (e.source_node_id, e.target_node_id)
            for e in edges
            if e.relation_type == "contains"
        }
        for topic in topics:
            pair = (center.id, topic.id)
            if pair not in existing_contains:
                edge = TopologyEdge(
                    source_node_id=center.id,
                    target_node_id=topic.id,
                    relation_type="contains",
                    scope_type="project",
                    scope_id=project_id,
                )
                db.add(edge)
                edges.append(edge)
        await db.commit()

    return TopologyGraphResponse(
        nodes=[_node_response(n) for n in nodes],
        edges=[_edge_response(e) for e in edges],
    )


@router.post(
    "/api/projects/{project_id}/topology/nodes",
    response_model=TopologyNodeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_topic_node(
    project_id: UUID,
    body: TopologyNodeCreate,
    current_user: User = Depends(get_current_user),
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    center = await bootstrap_project_topology(db, project, created_by=current_user.id)
    topic_count = await db.execute(
        select(TopologyNode).where(
            TopologyNode.scope_type == "project",
            TopologyNode.scope_id == project_id,
            TopologyNode.node_type == "topic",
        )
    )
    index = len(list(topic_count.scalars().all()))
    position = body.position.model_dump() if body.position else _topic_position(index)

    topic = TopologyNode(
        scope_type="project",
        scope_id=project_id,
        node_type="topic",
        ref_id=None,
        label=body.label,
        position=position,
        node_metadata={},
        created_by=current_user.id,
    )
    db.add(topic)
    await db.flush()

    edge = TopologyEdge(
        source_node_id=center.id,
        target_node_id=topic.id,
        relation_type="contains",
        scope_type="project",
        scope_id=project_id,
    )
    db.add(edge)
    await db.commit()
    await db.refresh(topic)
    return _node_response(topic)


@router.patch("/api/topology/nodes/{node_id}", response_model=TopologyNodeResponse)
async def update_topology_node(
    node_id: UUID,
    body: TopologyNodeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await db.get(TopologyNode, node_id)
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    if node.node_type == "project":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify system project nodes",
        )

    if node.scope_type == "project" and node.scope_id:
        await require_project_role("member")(
            project_id=node.scope_id,
            current_user=current_user,
            db=db,
        )

    if body.label is not None:
        node.label = body.label
    if body.position is not None:
        node.position = body.position.model_dump()
    if body.metadata is not None:
        node.node_metadata = body.metadata

    await db.commit()
    await db.refresh(node)
    return _node_response(node)


@router.delete("/api/topology/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_topology_node(
    node_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await db.get(TopologyNode, node_id)
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    if node.node_type != "topic":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only topic nodes can be deleted",
        )
    if node.scope_type == "project" and node.scope_id:
        member = await require_project_role("admin")(
            project_id=node.scope_id,
            current_user=current_user,
            db=db,
        )
        _ = member

    await db.delete(node)
    await db.commit()


@router.post(
    "/api/projects/{project_id}/topology/edges",
    response_model=TopologyEdgeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_topology_edge(
    project_id: UUID,
    body: TopologyEdgeCreate,
    _member: ProjectMember = Depends(require_project_role("member")),
    db: AsyncSession = Depends(get_db),
):
    edge = TopologyEdge(
        source_node_id=body.source_node_id,
        target_node_id=body.target_node_id,
        relation_type=body.relation_type,
        scope_type="project",
        scope_id=project_id,
    )
    db.add(edge)
    await db.commit()
    await db.refresh(edge)
    return _edge_response(edge)
