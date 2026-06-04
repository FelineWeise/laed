from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class Position(BaseModel):
    x: float
    y: float


class TopologyNodeCreate(BaseModel):
    label: str
    position: Position | None = None


class TopologyNodeUpdate(BaseModel):
    label: str | None = None
    position: Position | None = None
    metadata: dict[str, Any] | None = None


class TopologyNodeResponse(BaseModel):
    id: UUID
    scope_type: str
    scope_id: UUID | None
    node_type: str
    ref_id: UUID | None
    label: str
    position: dict[str, float]
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str

    model_config = {"from_attributes": True}


class TopologyEdgeCreate(BaseModel):
    source_node_id: UUID
    target_node_id: UUID
    relation_type: str = "related_to"


class TopologyEdgeResponse(BaseModel):
    id: UUID
    source_node_id: UUID
    target_node_id: UUID
    relation_type: str
    scope_type: str
    scope_id: UUID | None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str

    model_config = {"from_attributes": True}


class TopologyGraphResponse(BaseModel):
    nodes: list[TopologyNodeResponse]
    edges: list[TopologyEdgeResponse]
