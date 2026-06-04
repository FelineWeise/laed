from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class UserConnectionCreate(BaseModel):
    other_user_id: UUID


class UserConnectionResponse(BaseModel):
    id: UUID
    user_a_id: UUID
    user_b_id: UUID
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ShareGrantCreate(BaseModel):
    grantee_user_id: UUID
    folder_ids: list[UUID] = Field(default_factory=list)


class ShareGrantResponse(BaseModel):
    id: UUID
    grantor_user_id: UUID
    grantee_user_id: UUID
    project_id: UUID
    folder_ids: list[UUID]
    revoked_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
