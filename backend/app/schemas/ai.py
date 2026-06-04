from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.context import ExplicitContextItem
from app.schemas.retrieval import RetrievalScopePayload


class ConversationCreate(BaseModel):
    is_private: bool = True
    topic_node_id: UUID | None = None


class ConversationUpdate(BaseModel):
    title: str | None = None
    topic_node_id: UUID | None = None
    is_private: bool | None = None


class ConversationResponse(BaseModel):
    id: UUID
    project_id: UUID | None
    user_id: UUID
    is_private: bool
    title: str | None = None
    topic_node_id: UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str
    topic_node_id: UUID | None = None
    retrieval_scope: RetrievalScopePayload | None = None
    explicit_context: list[ExplicitContextItem] = Field(default_factory=list)
    model: str | None = None


class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    source_chunks: list[dict[str, Any]] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
