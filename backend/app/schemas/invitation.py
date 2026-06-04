from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class InvitationCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: str = "member"


class InvitationResponse(BaseModel):
    id: UUID
    project_id: UUID
    inviter_id: UUID
    invitee_email: str
    invitee_user_id: UUID | None
    role: str
    status: str
    created_at: datetime
    responded_at: datetime | None
    project_name: str | None = None

    model_config = {"from_attributes": True}
