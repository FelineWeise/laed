from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


# ── Auth ─────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: str
    password: str
    display_name: str


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: UUID
    email: str
    display_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Projects ─────────────────────────────────────────────

class ProjectBase(BaseModel):
    name: str
    description: str | None = None


class ProjectCreate(ProjectBase):
    ownership_model: str = "owned"


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    archived: bool | None = None


class ProjectResponse(ProjectBase):
    id: UUID
    created_at: datetime
    ownership_model: str
    created_by: UUID
    tags: list[str] = []

    model_config = {"from_attributes": True}


class ProjectDetailResponse(ProjectResponse):
    members: list["MemberResponse"]


# ── Members ──────────────────────────────────────────────

class MemberAdd(BaseModel):
    email: str
    role: str = "member"


class MemberResponse(BaseModel):
    user_id: UUID
    role: str
    joined_at: datetime
    display_name: str | None = None
    email: str | None = None

    model_config = {"from_attributes": True}
