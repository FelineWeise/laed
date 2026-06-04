from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    is_private: bool = True


class ConversationResponse(BaseModel):
    id: UUID
    project_id: UUID
    user_id: UUID
    is_private: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str
    topic_node_id: UUID | None = None


class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    source_chunks: list[dict[str, Any]] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
