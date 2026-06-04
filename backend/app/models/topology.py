from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class TopologyNode(BaseMixin, Base):
    __tablename__ = "topology_nodes"
    scope_type: Mapped[str] = mapped_column(String, nullable=False)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    node_type: Mapped[str] = mapped_column(String, nullable=False)
    ref_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    position: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    node_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, server_default="{}")
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class TopologyEdge(BaseMixin, Base):
    __tablename__ = "topology_edges"
    source_node_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("topology_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_node_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("topology_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )
    relation_type: Mapped[str] = mapped_column(String, nullable=False)
    scope_type: Mapped[str] = mapped_column(String, nullable=False)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    edge_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, server_default="{}")
