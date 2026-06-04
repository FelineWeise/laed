from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class MentionSnapshot(BaseModel):
    user_id: UUID
    display_name: str


class ReplyPreview(BaseModel):
    id: UUID
    content: str
    sender_label: str


class InboxMentionResponse(BaseModel):
    id: UUID
    message_id: UUID
    project_id: UUID
    project_name: str
    topic_node_id: UUID | None
    thread_session_id: UUID | None
    thread_title: str
    sender_label: str
    excerpt: str
    created_at: datetime
    read_at: datetime | None = None
