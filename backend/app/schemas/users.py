from uuid import UUID

from pydantic import BaseModel


class UserSearchResult(BaseModel):
    id: UUID
    email: str
    display_name: str
