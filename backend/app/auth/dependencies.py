from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
import jwt

from app.models import User, ProjectMember, get_db
from app.auth.jwt import decode_access_token

security = HTTPBearer()

ROLE_HIERARCHY = ["observer", "member", "admin", "owner"]


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extracts user from JWT token."""
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await db.get(User, UUID(payload["sub"]))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_project_role(*min_roles: str):
    """
    Dependency factory — checks that the current user has at least the given role
    in the project identified by the path parameter `project_id`.
    """
    min_level = max(ROLE_HIERARCHY.index(r) for r in min_roles)

    async def check(
        project_id: UUID,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> ProjectMember:
        member = await db.get(ProjectMember, (project_id, current_user.id))
        if not member:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")
        if ROLE_HIERARCHY.index(member.role) < min_level:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return member

    return check
