# Day 3: Database, Auth & Core API

## What You're Building

The data foundation and authentication layer that everything else depends on. By the end of this day:
- All 8 database tables created via Alembic migration
- Users can register, log in, and receive JWT tokens
- Projects can be created with role-based membership
- Every endpoint is protected by auth + project-scoped access control

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│  API Request Flow                                              │
│                                                                │
│  Client → Bearer Token → get_current_user() → Route Handler   │
│                              │                      │          │
│                              ▼                      ▼          │
│                     Decode JWT token        require_project_role()
│                     Look up user in DB          │              │
│                     Raise 401 if invalid        ▼              │
│                                          Check membership      │
│                                          Check role level      │
│                                          Raise 403 if denied   │
└────────────────────────────────────────────────────────────────┘
```

---

## 1. Database Engine & Session — `backend/app/models/base.py`

The async engine, session factory, and shared mixin all live here. Every other module imports from this file.

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import text, DateTime, UUID
import uuid
from datetime import datetime

from app.config import settings

engine = create_async_engine(settings.database_url)
async_session = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class BaseMixin:
    """Shared columns for all tables — inherit once, used by all 8 models."""
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

async def get_db():
    """FastAPI dependency — yields a DB session per request, auto-closes."""
    async with async_session() as session:
        yield session
```

### Why BaseMixin?

Every table needs `id` (UUID) and `created_at` (timestamp). Without the mixin, you'd copy-paste these 2 column definitions across all 8 models. With it, each model inherits them:

```python
class User(BaseMixin, Base):         # automatically has id + created_at
class Project(BaseMixin, Base):      # automatically has id + created_at
class AccessLog(BaseMixin, Base):    # automatically has id + created_at
```

To add `updated_at` to every table later, you modify one line in `BaseMixin`.

---

## 2. SQLAlchemy Models

All 8 tables are defined upfront so the initial Alembic migration creates the full schema. Future sprint days add services and routes, not schema changes.

### `backend/app/models/user.py`
```python
class User(BaseMixin, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
```

### `backend/app/models/project.py`
```python
class Project(BaseMixin, Base):
    __tablename__ = "projects"
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    ownership_model: Mapped[str] = mapped_column(String, server_default="owned")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class ProjectMember(Base):
    """Composite PK — no BaseMixin (uses project_id + user_id as PK instead of UUID)."""
    __tablename__ = "project_members"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String, server_default="member")
    invited_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
```

### Other models (message.py, file.py, ai.py, access_log.py)

Same pattern — inherit `BaseMixin, Base`, define only the entity-specific columns. See the SQL schema in section 5.4 of the Architecture doc for all column definitions.

### `backend/app/models/__init__.py`
```python
from app.models.base import Base, BaseMixin, engine, async_session, get_db
from app.models.user import User
from app.models.project import Project, ProjectMember
from app.models.message import Message
from app.models.file import File
from app.models.ai import AIConversation, AIMessage
from app.models.access_log import AccessLog
```

Re-exporting everything here means the rest of the app can do `from app.models import User, Project, get_db`.

---

## 3. Pydantic Schemas — `backend/app/schemas.py`

Schemas define the API contract — what the client sends and receives. They are separate from SQLAlchemy models because:
- The DB has `password_hash`; the API never exposes it
- The API may return computed fields (`member_count`, `my_role`) that aren't DB columns
- Create/update/response shapes differ even for the same entity

### Schema inheritance pattern

```python
# Shared input fields
class ProjectBase(BaseModel):
    name: str
    description: str | None = None

# What the client sends to create a project
class ProjectCreate(ProjectBase):
    ownership_model: str = "owned"

# What the client sends to update a project
class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None

# What the API returns
class ProjectResponse(ProjectBase):
    id: uuid.UUID
    created_at: datetime
    ownership_model: str

    model_config = {"from_attributes": True}
```

`from_attributes = True` lets Pydantic read directly from SQLAlchemy objects:

```python
db_project = await db.get(Project, project_id)
return ProjectResponse.model_validate(db_project)
```

No manual field-by-field mapping. If you need extra computed fields:

```python
class ProjectDetailResponse(ProjectResponse):
    members: list[MemberResponse]
    file_count: int

# In the route:
return ProjectDetailResponse.model_validate(db_project, update={
    "members": [...],
    "file_count": 42,
})
```

### OpenAPI → TypeScript type generation

FastAPI auto-generates an OpenAPI spec from these schemas at `/api/openapi.json`. To generate TypeScript interfaces for the frontend (works for both Expo/React Native and web):

```bash
npx openapi-typescript http://localhost:8000/api/openapi.json -o src/api/types.ts
```

This produces:
```typescript
interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  ownership_model: string;
  created_at: string;
}
```

Re-run the command whenever the backend schemas change — types can never drift out of sync.

---

## 4. Alembic Setup

### Initialize (run once)

```bash
cd backend
alembic init alembic
```

### Configure for async — `backend/alembic/env.py`

Modify the generated `env.py` to use the async engine:

```python
from app.models import Base          # imports all models via __init__.py
from app.config import settings

config.set_main_option("sqlalchemy.url", settings.database_url)
target_metadata = Base.metadata

# Replace run_migrations_online() with async version:
async def run_async_migrations():
    connectable = create_async_engine(settings.database_url)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()
```

### Generate and run the initial migration

```bash
# Generate migration from model definitions
alembic revision --autogenerate -m "initial schema"

# Apply it (requires PostgreSQL to be running)
alembic upgrade head
```

This creates all 8 tables in one migration. Future schema changes produce incremental migrations.

---

## 5. Auth Module

### `backend/app/auth/passwords.py` — Password hashing

```python
import bcrypt

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())
```

### `backend/app/auth/jwt.py` — Token management

```python
from datetime import datetime, timedelta, timezone
import jwt
from uuid import UUID
from app.config import settings

def create_access_token(user_id: UUID) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
```

### `backend/app/auth/dependencies.py` — FastAPI dependencies

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

ROLE_HIERARCHY = ["observer", "member", "admin", "owner"]

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extracts user from JWT token. Use as: Depends(get_current_user)"""
    payload = decode_access_token(credentials.credentials)  # raises on invalid
    user = await db.get(User, UUID(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def require_project_role(*min_roles: str):
    """
    Dependency factory — checks that the current user has at least the given role.
    Usage: Depends(require_project_role("admin"))
    """
    min_level = max(ROLE_HIERARCHY.index(r) for r in min_roles)

    async def check(
        project_id: UUID,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> ProjectMember:
        member = await db.get(ProjectMember, (project_id, current_user.id))
        if not member:
            raise HTTPException(status_code=403, detail="Not a project member")
        if ROLE_HIERARCHY.index(member.role) < min_level:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return member

    return check
```

The role hierarchy is a simple ordered list. Adding a new role (e.g., `"editor"` between `"member"` and `"admin"`) means inserting one string — no code changes.

---

## 6. API Routes

### `backend/app/routes/auth.py`

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/register` | POST | No | Create user, return JWT |
| `/api/auth/login` | POST | No | Verify credentials, return JWT |
| `/api/auth/me` | GET | Yes | Return current user profile |

### `backend/app/routes/projects.py`

| Endpoint | Method | Auth | Min Role | Description |
|----------|--------|------|----------|-------------|
| `/api/projects` | POST | Yes | — | Create project, creator becomes owner |
| `/api/projects` | GET | Yes | — | List user's projects |
| `/api/projects/{id}` | GET | Yes | observer | Get project detail |
| `/api/projects/{id}` | PATCH | Yes | admin | Update project |
| `/api/projects/{id}/members` | POST | Yes | admin | Invite user by email |
| `/api/projects/{id}/members` | GET | Yes | observer | List members |
| `/api/projects/{id}/members/{user_id}` | DELETE | Yes | owner | Remove member |

### Wiring into main.py

```python
# backend/app/main.py — add to lifespan and include routers
from app.routes.auth import router as auth_router
from app.routes.projects import router as projects_router

app.include_router(auth_router)
app.include_router(projects_router)
```

---

## 7. Testing with curl

After `docker compose up -d`:

```bash
# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "feline@laed.eu", "password": "test1234", "display_name": "Feline"}'

# Login (save the token)
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "feline@laed.eu", "password": "test1234"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Create a project
curl -X POST http://localhost:8000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Project Alpha", "description": "M&A deal room"}'

# List projects
curl http://localhost:8000/api/projects \
  -H "Authorization: Bearer $TOKEN"
```

---

## Day 3 Checklist

- [ ] `backend/app/models/base.py` — async engine, session, BaseMixin
- [ ] All 8 models defined (user, project, project_member, message, file, ai_conversation, ai_message, access_log)
- [ ] `backend/app/models/__init__.py` re-exports all models
- [ ] Alembic initialized with async support
- [ ] Initial migration generated and applied
- [ ] `backend/app/auth/` — passwords, JWT, dependencies
- [ ] `backend/app/schemas.py` — all Pydantic request/response schemas
- [ ] `backend/app/routes/auth.py` — register, login, me
- [ ] `backend/app/routes/projects.py` — CRUD + membership
- [ ] `backend/app/main.py` — lifespan updated, routers included
- [ ] All endpoints tested with curl
- [ ] OpenAPI docs accessible at `/api/docs`
