# LAED — Sprint Guide (from current state)

*Updated: April 5, 2026*

---

## 0. Current State — What Exists

### On the Scaleway server (`ssh scw`)
- Ubuntu 24.04, hardened (root disabled, SSH key-only, UFW active)
- Docker 29.3.0 + Compose v5.1.0 installed
- Block storage mounted at `/opt/projectspace-data`
- `.env` with generated secrets (DB_PASSWORD, JWT_SECRET, MINIO keys)
- Domain `laed.eu` pointing to `51.15.207.5`
- **No Docker services running yet** — docker-compose was never deployed
- GPU instance exists but separate (private network, Ollama setup from GPU guide)

### In local repo (`~/Desktop/Repositories/laed`)
```
├── .env.example
├── .cursorrules
├── Caddyfile                    ← reverse proxy config
├── docker-compose.yml           ← existing, needs updates
├── backend/
│   ├── Dockerfile               ← multi-stage, Poetry-based ✅
│   ├── pyproject.toml           ← Poetry config ✅
│   ├── poetry.lock              ✅
│   └── app/
│       ├── __init__.py
│       ├── main.py              ← FastAPI app, health endpoint ✅
│       ├── config.py            ← Settings with pydantic-settings ✅
│       ├── worker.py            ← Celery app configured ✅
│       ├── auth/__init__.py     ← empty
│       ├── models/__init__.py   ← empty
│       ├── routes/__init__.py   ← empty
│       ├── services/__init__.py ← empty
│       └── services/llm.py      ← OllamaProvider with chat/stream/embed ✅
├── infrastructure/
│   ├── gpu-compose.yml          ← Ollama on GPU
│   ├── gpu-setup.sh
│   └── pull-models.sh
├── docs/                        ← architecture docs
└── mobile/                      ← empty placeholder
```

### What's built vs. what's not

| Component | Status |
|-----------|--------|
| FastAPI skeleton + health endpoint | ✅ Done |
| Settings/config (pydantic-settings) | ✅ Done |
| Dockerfile (multi-stage, Poetry) | ✅ Done |
| Celery worker config | ✅ Done |
| LLM provider (Ollama client) | ✅ Done |
| Docker Compose (base services) | ⚠️ Exists but needs updates |
| SQLAlchemy models | ❌ Not started |
| Alembic migrations | ❌ Not started |
| Auth (JWT, passwords, dependencies) | ❌ Not started |
| Pydantic schemas | ❌ Not started |
| API routes (auth, projects) | ❌ Not started |
| LiteLLM gateway | ❌ Not in current setup |
| pgvector (replacing ChromaDB) | ❌ Not in current setup |
| Parakeet STT | ❌ Not in current setup |
| OpenClaw | ❌ Not in current setup |
| Tailscale | ❌ Not installed |
| Frontend | ❌ Not started |

---

## 1. Architecture Changes from Original Plan

### 1a. LiteLLM Gateway — replaces direct Ollama calls
Your `services/llm.py` currently talks to Ollama directly. We'll keep that code as a fallback but add LiteLLM as the primary gateway. This lets all consumers (your app, OpenClaw, future BOB) share one model router with cost tracking.

**Config change**: `OLLAMA_URL` → `LLM_GATEWAY_URL` pointing to LiteLLM, which routes to Ollama.

### 1b. pgvector — replaces ChromaDB
Vector embeddings stored as a PostgreSQL column alongside your relational data. One database, one backup, fewer containers.

**Compose change**: Remove `chromadb` service. Change `postgres:16-alpine` → `pgvector/pgvector:pg16`.

### 1c. Parakeet TDT 0.6B v3 — replaces Whisper
600M parameter model, beats Whisper Large v3 on quality, runs fast on CPU. Deploys on the base server (always available, no GPU needed). OpenAI-compatible API at `/v1/audio/transcriptions`. Automatic language detection for DE/EN.

**Compose change**: Remove `whisper-service`. Add `parakeet` service built from the community Docker image.

### 1d. OpenClaw — your dev/ops assistant
Runs on the base server, reachable via Telegram. Uses LiteLLM gateway for LLM calls (routes to Claude API for reasoning). Read-only access to your codebase and container logs.

### 1e. Tailscale — secure remote access
Private mesh VPN. Access LiteLLM dashboard, PgAdmin, OpenClaw UI from anywhere without exposing ports.

---

## 2. Step-by-Step: Server Preparation

Do these on the Scaleway server before deploying anything.

### 2.1 Install Tailscale

```bash
ssh scw

# Install
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate (opens a URL — copy/paste to browser)
sudo tailscale up

# Note your Tailscale IP
tailscale ip -4
# → something like 100.64.x.y
```

On your Mac:
```bash
brew install tailscale
# Or download from https://tailscale.com/download
# Authenticate with the same account
# Verify:
ping 100.64.x.y
```

### 2.2 Update the .env on the server

```bash
ssh scw
cd /opt/projectspace-data
```

Edit `.env` to add new variables and update existing ones:

```bash
cat >> /opt/projectspace-data/.env << 'EOF'

# ── LiteLLM Gateway ────────────────────────────────────
LITELLM_MASTER_KEY=<run: openssl rand -hex 32>

# ── Anthropic (for OpenClaw dev assistant) ──────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── Parakeet STT ────────────────────────────────────────
STT_MODEL=parakeet-tdt-0.6b-v3
EOF
```

Generate the LiteLLM key:
```bash
# Replace the placeholder
LITELLM_KEY=$(openssl rand -hex 32)
sed -i "s|LITELLM_MASTER_KEY=<run: openssl rand -hex 32>|LITELLM_MASTER_KEY=${LITELLM_KEY}|" /opt/projectspace-data/.env
```

Also update the existing STT_URL:
```bash
sed -i 's|STT_URL=http://whisper:8080|STT_URL=http://parakeet:5092|' /opt/projectspace-data/.env
```

And update OLLAMA_URL to point through LiteLLM:
```bash
# Keep the direct Ollama URL for LiteLLM's backend config
# Add a new gateway URL for the app
cat >> /opt/projectspace-data/.env << 'EOF'

# ── LLM Gateway (app uses this instead of direct Ollama) ──
LLM_GATEWAY_URL=http://litellm:4000/v1
EOF
```

### 2.3 Create LiteLLM config on the server

```bash
cat > /opt/projectspace-data/litellm-config.yaml << 'EOF'
model_list:
  # Primary LLM — self-hosted on GPU via Ollama
  - model_name: laed-chat
    litellm_params:
      model: ollama/qwen2.5:14b-instruct-q4_K_M
      api_base: os.environ/OLLAMA_URL

  # Embedding model — self-hosted
  - model_name: laed-embed
    litellm_params:
      model: ollama/nomic-embed-text
      api_base: os.environ/OLLAMA_URL

  # Dev assistant (OpenClaw) — cloud API
  - model_name: dev-assistant
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

litellm_settings:
  drop_params: true
  set_verbose: false
  num_retries: 2

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
EOF
```

---

## 3. Updated docker-compose.yml

Edit this **locally in Cursor**, commit, then deploy to server.

Replace your current `docker-compose.yml` with:

```yaml
services:
  # ── Reverse Proxy ──────────────────────────────────────
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - DOMAIN=${DOMAIN}
    depends_on:
      - app
    networks:
      - frontend
    restart: always

  # ── Application Server ─────────────────────────────────
  app:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql+asyncpg://app:${DB_PASSWORD}@postgres:5432/projectspace
      - REDIS_URL=redis://redis:6379/0
      - LLM_GATEWAY_URL=http://litellm:4000/v1
      - LLM_GATEWAY_KEY=${LITELLM_MASTER_KEY}
      - OLLAMA_URL=${OLLAMA_URL}
      - MINIO_URL=minio:9000
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
      - STT_URL=http://parakeet:5092
      - JWT_SECRET=${JWT_SECRET}
      - JWT_ALGORITHM=${JWT_ALGORITHM:-HS256}
      - JWT_EXPIRY_HOURS=${JWT_EXPIRY_HOURS:-24}
      - LLM_MODEL=${LLM_MODEL}
      - EMBEDDING_MODEL=${EMBEDDING_MODEL}
    depends_on:
      - postgres
      - redis
      - minio
      - litellm
    networks:
      - frontend
      - backend
    restart: always

  # ── Celery Worker ──────────────────────────────────────
  worker:
    build: ./backend
    command: celery -A app.worker worker --loglevel=info --concurrency=2
    environment:
      - DATABASE_URL=postgresql+asyncpg://app:${DB_PASSWORD}@postgres:5432/projectspace
      - REDIS_URL=redis://redis:6379/0
      - LLM_GATEWAY_URL=http://litellm:4000/v1
      - LLM_GATEWAY_KEY=${LITELLM_MASTER_KEY}
      - OLLAMA_URL=${OLLAMA_URL}
      - MINIO_URL=minio:9000
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
      - EMBEDDING_MODEL=${EMBEDDING_MODEL}
    depends_on:
      - redis
      - postgres
      - litellm
    networks:
      - backend
    restart: always

  # ── Database (PostgreSQL + pgvector) ───────────────────
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_DB=projectspace
      - POSTGRES_USER=app
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - backend
    restart: always

  # ── Task Queue Broker ──────────────────────────────────
  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    networks:
      - backend
    restart: always

  # ── File Storage ───────────────────────────────────────
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}
    volumes:
      - filedata:/data
    networks:
      - backend
    restart: always

  # ── LLM Gateway ────────────────────────────────────────
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    volumes:
      - ./litellm-config.yaml:/app/config.yaml
    command: ["--config", "/app/config.yaml"]
    environment:
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
      - DATABASE_URL=postgresql://app:${DB_PASSWORD}@postgres:5432/projectspace
      - OLLAMA_URL=${OLLAMA_URL}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    ports:
      - "127.0.0.1:4000:4000"
    depends_on:
      - postgres
    networks:
      - backend
    restart: always

  # ── Speech-to-Text (Parakeet TDT 0.6B v3) ─────────────
  parakeet:
    build:
      context: https://github.com/groxaxo/parakeet-tdt-0.6b-v3-fastapi-openai.git
      dockerfile: Dockerfile.cpu
    ports:
      - "127.0.0.1:5092:5092"
    volumes:
      - parakeet_models:/app/models
    networks:
      - backend
    restart: always

  # ── Docker Socket Proxy (for OpenClaw) ─────────────────
  docker-socket-proxy:
    image: tecnativa/docker-socket-proxy
    environment:
      - CONTAINERS=1
      - INFO=1
      - POST=0
      - EXEC=0
      - BUILD=0
      - COMMIT=0
      - IMAGES=0
      - VOLUMES=0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - openclaw
    restart: always

volumes:
  caddy_data:
  caddy_config:
  pgdata:
  redisdata:
  filedata:
  parakeet_models:

networks:
  frontend:
  backend:
  openclaw:
```

### What changed from your existing docker-compose.yml:
- `postgres:16-alpine` → `pgvector/pgvector:pg16`
- Removed `chromadb` service and `vectordata` volume
- Added `litellm` service
- Added `parakeet` service (replaces whisper-service)
- Added `docker-socket-proxy` (for OpenClaw)
- Added Docker networks for isolation
- App env vars now include `LLM_GATEWAY_URL` and `LLM_GATEWAY_KEY`
- STT_URL now points to `http://parakeet:5092`

---

## 4. Updated config.py

In Cursor, update `backend/app/config.py`:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://app:changeme@postgres:5432/projectspace"

    # Auth
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24

    # MinIO
    minio_url: str = "minio:9000"
    minio_access_key: str = "changeme"
    minio_secret_key: str = "changeme"

    # LLM — gateway (primary, used by app)
    llm_gateway_url: str = "http://litellm:4000/v1"
    llm_gateway_key: str = ""
    llm_model: str = "laed-chat"
    embedding_model: str = "laed-embed"

    # LLM — direct Ollama (fallback / legacy)
    ollama_url: str = "http://localhost:11434"

    # STT — Parakeet
    stt_url: str = "http://parakeet:5092"

    # Task queue
    redis_url: str = "redis://redis:6379/0"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
```

---

## 5. Updated pyproject.toml

In Cursor, add the pgvector dependency:

```bash
cd backend
poetry add pgvector
```

This updates both `pyproject.toml` and `poetry.lock`. Also remove `chromadb`:

```bash
poetry remove chromadb
```

---

## 6. Day 3: Database, Auth & Core API

Now build the actual application code in Cursor. Everything below is local development work.

### 6.1 Database models — `backend/app/models/base.py`

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
    """Shared columns for all tables."""
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


async def get_db():
    """FastAPI dependency — yields a DB session per request."""
    async with async_session() as session:
        yield session
```

### 6.2 All models

Create these files following the exact schemas from your Day 3 guide (uploaded). The one addition is `FileChunk` for pgvector:

**`backend/app/models/user.py`** — as in Day 3 guide

**`backend/app/models/project.py`** — as in Day 3 guide (Project + ProjectMember)

**`backend/app/models/message.py`**
```python
from sqlalchemy import String, Text, Boolean, ForeignKey, UUID
from sqlalchemy.orm import Mapped, mapped_column
import uuid

from app.models.base import Base, BaseMixin


class Message(BaseMixin, Base):
    __tablename__ = "messages"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, server_default="false")
    message_type: Mapped[str] = mapped_column(String, server_default="chat")
```

**`backend/app/models/file.py`** — with pgvector FileChunk:
```python
from sqlalchemy import String, Text, BigInteger, Integer, ForeignKey, UUID
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
import uuid

from app.models.base import Base, BaseMixin


class File(BaseMixin, Base):
    __tablename__ = "files"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    filename: Mapped[str] = mapped_column(String, nullable=False)
    file_type: Mapped[str | None] = mapped_column(String)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    minio_key: Mapped[str] = mapped_column(String, nullable=False)
    ingestion_status: Mapped[str] = mapped_column(String, server_default="pending")


class FileChunk(BaseMixin, Base):
    """Text chunks + vector embeddings for RAG."""
    __tablename__ = "file_chunks"
    file_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("files.id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(Vector(768), nullable=True)  # nomic-embed-text = 768 dims
    token_count: Mapped[int | None] = mapped_column(Integer)
```

**`backend/app/models/ai.py`**
```python
from sqlalchemy import String, Text, Boolean, ForeignKey, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
import uuid

from app.models.base import Base, BaseMixin


class AIConversation(BaseMixin, Base):
    __tablename__ = "ai_conversations"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, server_default="true")


class AIMessage(BaseMixin, Base):
    __tablename__ = "ai_messages"
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ai_conversations.id"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_chunks = mapped_column(JSONB, nullable=True)
```

**`backend/app/models/access_log.py`**
```python
from sqlalchemy import String, ForeignKey, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import INET
import uuid

from app.models.base import Base, BaseMixin


class AccessLog(BaseMixin, Base):
    __tablename__ = "access_log"
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String, nullable=False)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    ip_address = mapped_column(INET, nullable=True)
```

**`backend/app/models/__init__.py`**
```python
from app.models.base import Base, BaseMixin, engine, async_session, get_db
from app.models.user import User
from app.models.project import Project, ProjectMember
from app.models.message import Message
from app.models.file import File, FileChunk
from app.models.ai import AIConversation, AIMessage
from app.models.access_log import AccessLog

__all__ = [
    "Base", "BaseMixin", "engine", "async_session", "get_db",
    "User", "Project", "ProjectMember", "Message",
    "File", "FileChunk", "AIConversation", "AIMessage", "AccessLog",
]
```

### 6.3 Alembic setup

```bash
cd backend
poetry add alembic
poetry run alembic init alembic
```

Edit `backend/alembic/env.py` for async — follow the Day 3 guide exactly.

Edit the generated migration to include pgvector extension at the top of `upgrade()`:
```python
def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    # ... auto-generated table creation
```

### 6.4 Auth module

Follow the Day 3 guide exactly for:
- `backend/app/auth/passwords.py` — bcrypt hash/verify
- `backend/app/auth/jwt.py` — create/decode tokens
- `backend/app/auth/dependencies.py` — get_current_user, require_project_role

### 6.5 Pydantic schemas — `backend/app/schemas.py`

Follow the Day 3 guide exactly.

### 6.6 Routes

Follow the Day 3 guide exactly for:
- `backend/app/routes/auth.py` — register, login, me
- `backend/app/routes/projects.py` — CRUD + membership

### 6.7 Update main.py

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title="LAED API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
from app.routes.auth import router as auth_router
from app.routes.projects import router as projects_router

app.include_router(auth_router)
app.include_router(projects_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "llm_model": settings.llm_model,
    }
```

---

## 7. Deploying to Server

Once Day 3 code is working locally (tests pass), deploy to the server.

### 7.1 Push code to Git

```bash
cd ~/Desktop/Repositories/laed
git add -A
git commit -m "Day 3: database models, auth, project routes, pgvector"
git push
```

### 7.2 Clone/pull on the server

```bash
ssh scw
cd /opt/projectspace-data

# First time:
git clone https://github.com/<your-username>/laed.git repo
# Or if you prefer SSH:
# git clone git@github.com:<your-username>/laed.git repo

# The deployment files live directly in projectspace-data,
# but the repo is a subdirectory:
# /opt/projectspace-data/.env          ← secrets (not in repo)
# /opt/projectspace-data/repo/         ← your code
# /opt/projectspace-data/litellm-config.yaml  ← gateway config (not in repo)
```

### 7.3 Symlink compose files

The repo contains docker-compose.yml and Caddyfile. Docker Compose needs to find them alongside the .env:

```bash
cd /opt/projectspace-data

# Create symlinks so docker compose finds everything
ln -s repo/docker-compose.yml docker-compose.yml
ln -s repo/Caddyfile Caddyfile
```

### 7.4 Build and start

```bash
cd /opt/projectspace-data
docker compose build app worker
docker compose pull   # pulls postgres, redis, minio, caddy, litellm, parakeet
docker compose up -d
docker compose ps
```

Expected: all services running (caddy, app, worker, postgres, redis, minio, litellm, parakeet, docker-socket-proxy).

Note: Parakeet will download the ONNX model on first start (~500MB), which takes a few minutes.

### 7.5 Run migrations

```bash
docker compose exec app alembic upgrade head
```

### 7.6 Verify

```bash
# Health check
curl https://laed.eu/api/health

# PostgreSQL + pgvector
docker compose exec postgres psql -U app -d projectspace \
  -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"

# Tables created
docker compose exec postgres psql -U app -d projectspace -c "\dt"

# LiteLLM
curl -s http://localhost:4000/health

# Parakeet STT
curl -s http://localhost:5092/health

# Register a test user
curl -X POST https://laed.eu/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "feline@laed.eu", "password": "test1234", "display_name": "Feline"}'
```

---

## 8. OpenClaw Setup (after Day 3 is verified)

### 8.1 Install on server

```bash
ssh scw

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install OpenClaw
npx openclaw@latest
# Follow onboarding wizard:
# - API key: your Anthropic key (or point to LiteLLM http://localhost:4000/v1)
# - Workspace: /opt/projectspace-data/repo
# - Connect Telegram (see 8.2)
```

### 8.2 Connect Telegram
1. Open Telegram → @BotFather → `/newbot`
2. Name: "LAED Dev Assistant"
3. Copy bot token → add in OpenClaw onboarding
4. Message your bot to verify

### 8.3 Sandboxing
OpenClaw runs directly on the server (not in Docker in this setup). Limit its access:
- Set workspace to `/opt/projectspace-data/repo` (your code, not secrets)
- The `.env` with secrets lives one directory up — OpenClaw can't read it unless you explicitly grant access
- Docker inspection goes through the socket proxy (read-only)

---

## 9. Updated .env.example

Update in your repo:

```bash
# ── Database ────────────────────────────────────────────
DB_PASSWORD=changeme-generate-with-openssl-rand-hex-32

# ── Auth ────────────────────────────────────────────────
JWT_SECRET=changeme-generate-with-openssl-rand-hex-32
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24

# ── MinIO (S3-compatible file storage) ──────────────────
MINIO_ACCESS_KEY=changeme-generate-with-openssl-rand-hex-20
MINIO_SECRET_KEY=changeme-generate-with-openssl-rand-hex-32

# ── LLM ─────────────────────────────────────────────────
LLM_MODEL=laed-chat
EMBEDDING_MODEL=laed-embed
OLLAMA_URL=http://172.16.0.X:11434

# ── LLM Gateway (LiteLLM) ──────────────────────────────
LLM_GATEWAY_URL=http://litellm:4000/v1
LITELLM_MASTER_KEY=changeme-generate-with-openssl-rand-hex-32

# ── Anthropic (for OpenClaw / dev assistant) ────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── Service URLs ────────────────────────────────────────
STT_URL=http://parakeet:5092
MINIO_URL=minio:9000
REDIS_URL=redis://redis:6379/0
DATABASE_URL=postgresql+asyncpg://app:${DB_PASSWORD}@postgres:5432/projectspace

# ── Domain ──────────────────────────────────────────────
DOMAIN=laed.eu
```

---

## 10. Sprint Calendar

| Day | Focus | Where |
|-----|-------|-------|
| ~~Day 1~~ | ~~Server setup~~ | ~~Server~~ ✅ |
| ~~Day 2~~ | ~~GPU + Ollama~~ | ~~Server~~ ✅ |
| **Day 3a** | **Server updates (Tailscale, .env, litellm-config)** | **Server** ← now |
| **Day 3b** | **Database models + Auth + Routes** | **Cursor (local)** |
| **Day 3c** | **First deploy + verify** | **Server** |
| Day 3d | OpenClaw setup | Server |
| Day 4 | File service (MinIO upload/download/encryption) | Cursor |
| Day 5 | RAG ingestion pipeline (pgvector) | Cursor |
| Day 6 | AI chat with RAG retrieval | Cursor |
| Day 7 | Real-time team chat (WebSocket) | Cursor |
| Day 8 | Speech-to-text integration (Parakeet) | Cursor |
| Day 9-10 | Frontend + PWA setup (Next.js) | Cursor |
| Day 11-12 | Integration testing, security, backups | Both |
| Day 13-14 | Demo prep + documentation | Both |

---

## 11. Day 4: File Service

All work in Cursor. Deploy to server when tests pass.

### 11.1 New dependency

```bash
cd backend
poetry add python-multipart  # already in pyproject.toml — verify
```

### 11.2 File service — `backend/app/services/files.py`

```python
from minio import Minio
from minio.sse import SseS3
from io import BytesIO
import uuid

from app.config import settings


class FileService:
    def __init__(self):
        self.client = Minio(
            settings.minio_url,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False,  # internal Docker network, TLS handled by Caddy
        )
        self._sse = SseS3()  # server-side encryption

    def ensure_bucket(self, project_id: uuid.UUID) -> str:
        """Create a bucket for the project if it doesn't exist."""
        bucket_name = f"project-{project_id}"
        if not self.client.bucket_exists(bucket_name):
            self.client.make_bucket(bucket_name)
        return bucket_name

    async def upload(
        self, project_id: uuid.UUID, filename: str, data: bytes, content_type: str
    ) -> str:
        """Upload file with server-side encryption. Returns the MinIO object key."""
        bucket = self.ensure_bucket(project_id)
        object_key = f"{uuid.uuid4()}/{filename}"
        self.client.put_object(
            bucket,
            object_key,
            BytesIO(data),
            length=len(data),
            content_type=content_type,
            sse=self._sse,
        )
        return object_key

    async def download(self, project_id: uuid.UUID, object_key: str) -> bytes:
        """Download file from project bucket."""
        bucket = f"project-{project_id}"
        response = self.client.get_object(bucket, object_key)
        data = response.read()
        response.close()
        response.release_conn()
        return data

    async def list_objects(self, project_id: uuid.UUID) -> list[str]:
        """List all object keys in a project bucket."""
        bucket = f"project-{project_id}"
        if not self.client.bucket_exists(bucket):
            return []
        return [obj.object_name for obj in self.client.list_objects(bucket)]


file_service = FileService()
```

### 11.3 File routes — `backend/app/routes/files.py`

| Endpoint | Method | Auth | Min Role | Description |
|----------|--------|------|----------|-------------|
| `/api/projects/{id}/files` | POST | Yes | member | Upload file (multipart) |
| `/api/projects/{id}/files` | GET | Yes | observer | List files |
| `/api/projects/{id}/files/{file_id}` | GET | Yes | observer | Download file |

Key implementation points:
- Upload accepts multipart form data (`UploadFile` from FastAPI)
- Store metadata in `files` table (filename, size, type, minio_key, ingestion_status)
- Set `ingestion_status = 'pending'` — Day 5's Celery task picks this up
- Download endpoint logs access in `access_log` table
- Validate file size (e.g., max 100MB initially)

### 11.4 Test

```bash
# Upload a file
curl -X POST https://laed.eu/api/projects/${PROJECT_ID}/files \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-document.pdf"

# List files
curl https://laed.eu/api/projects/${PROJECT_ID}/files \
  -H "Authorization: Bearer $TOKEN"

# Download
curl https://laed.eu/api/projects/${PROJECT_ID}/files/${FILE_ID} \
  -H "Authorization: Bearer $TOKEN" -o downloaded.pdf

# Verify encryption in MinIO
docker compose exec minio mc ls local/project-${PROJECT_ID}/
```

### 11.5 Deploy

```bash
git add -A && git commit -m "Day 4: file service with MinIO encryption" && git push
ssh scw
cd /opt/projectspace-data/repo && git pull
cd /opt/projectspace-data && docker compose build app worker && docker compose up -d
```

---

## 12. Day 5: RAG Ingestion Pipeline

### 12.1 New dependencies

```bash
cd backend
poetry add unstructured[pdf,docx,xlsx,pptx]  # document parsing
poetry add tiktoken                            # token counting for chunking
```

### 12.2 Ingestion service — `backend/app/services/ingestion.py`

This is a Celery task that runs asynchronously after file upload.

**Pipeline**:
1. Download file from MinIO
2. Extract text using `unstructured` (handles PDF, DOCX, XLSX, PPTX, TXT, MD, images via OCR)
3. Chunk text into ~500 token passages with 50 token overlap
4. Generate embeddings for each chunk via LiteLLM gateway → `laed-embed` model
5. Store chunks + embeddings in `file_chunks` table (pgvector)
6. Update `files.ingestion_status` → `'ready'`

**Key code patterns**:

```python
# Chunking
from unstructured.partition.auto import partition

elements = partition(filename=temp_path)
text = "\n".join([el.text for el in elements if el.text])

# Split into chunks (simple approach)
chunks = split_text_into_chunks(text, max_tokens=500, overlap=50)

# Generate embeddings via LiteLLM
import httpx

async def embed_text(text: str) -> list[float]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.llm_gateway_url}/embeddings",
            headers={"Authorization": f"Bearer {settings.llm_gateway_key}"},
            json={"model": "laed-embed", "input": text},
        )
        return resp.json()["data"][0]["embedding"]

# Store in pgvector
chunk = FileChunk(
    file_id=file_id,
    project_id=project_id,
    chunk_index=i,
    content=chunk_text,
    embedding=embedding_vector,  # pgvector handles this
    token_count=len(tokens),
)
session.add(chunk)
```

### 12.3 Wire up to Celery — `backend/app/worker.py`

Add the ingestion task to autodiscover:

```python
celery_app.autodiscover_tasks(["app.services"])
```

Create `backend/app/services/tasks.py`:

```python
from app.worker import celery_app

@celery_app.task(bind=True, max_retries=3)
def ingest_file(self, file_id: str, project_id: str):
    """Async task: extract text, chunk, embed, store in pgvector."""
    # ... implementation using ingestion service
```

### 12.4 Trigger from file upload route

In `routes/files.py`, after successful upload:

```python
from app.services.tasks import ingest_file

# After saving file metadata to DB:
ingest_file.delay(str(db_file.id), str(project_id))
```

### 12.5 Ingestion status endpoint

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/projects/{id}/files/{file_id}/status` | GET | Yes | Returns ingestion status + chunk count |

Frontend can poll this to show a progress indicator.

### 12.6 Test

```bash
# Upload a PDF
curl -X POST https://laed.eu/api/projects/${PROJECT_ID}/files \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample-report.pdf"

# Watch Celery worker logs
docker compose logs -f worker

# Check ingestion status
curl https://laed.eu/api/projects/${PROJECT_ID}/files/${FILE_ID}/status \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"ingestion_status": "ready", "chunk_count": 42}

# Verify chunks in pgvector
docker compose exec postgres psql -U app -d projectspace \
  -c "SELECT count(*) FROM file_chunks WHERE project_id = '${PROJECT_ID}';"
```

---

## 13. Day 6: AI Chat (RAG)

### 13.1 RAG retrieval service — `backend/app/services/rag.py`

**Pipeline**:
1. Embed user query via LiteLLM → `laed-embed`
2. Search `file_chunks` using pgvector similarity (project-scoped)
3. Assemble system prompt with retrieved context
4. Stream response from LiteLLM → `laed-chat` via SSE

**pgvector similarity search**:

```python
from sqlalchemy import select, text
from pgvector.sqlalchemy import Vector

# Cosine similarity search — project-scoped
stmt = (
    select(FileChunk)
    .where(FileChunk.project_id == project_id)
    .where(FileChunk.embedding.isnot(None))
    .order_by(FileChunk.embedding.cosine_distance(query_embedding))
    .limit(5)
)
results = await session.execute(stmt)
chunks = results.scalars().all()
```

**System prompt assembly**:

```python
context = "\n\n---\n\n".join([
    f"[Source: {chunk.file.filename}, chunk {chunk.chunk_index}]\n{chunk.content}"
    for chunk in chunks
])

system_prompt = f"""You are a helpful AI assistant for a confidential project.
Answer questions based on the following project documents.
If the answer isn't in the documents, say so clearly.

PROJECT DOCUMENTS:
{context}"""
```

### 13.2 AI chat routes — `backend/app/routes/ai.py`

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/projects/{id}/ai/conversations` | POST | Yes | Create new AI conversation |
| `/api/projects/{id}/ai/conversations` | GET | Yes | List user's conversations |
| `/api/projects/{id}/ai/conversations/{conv_id}/messages` | POST | Yes | Send message, get streamed response |
| `/api/projects/{id}/ai/conversations/{conv_id}/messages` | GET | Yes | Get conversation history |

The message endpoint returns a **Server-Sent Events (SSE)** stream:

```python
from fastapi.responses import StreamingResponse

@router.post("/{conv_id}/messages")
async def send_message(...):
    # ... embed query, retrieve chunks, build prompt ...

    async def generate():
        async for token in llm_stream(messages):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield f"data: {json.dumps({'done': True, 'sources': source_refs})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

### 13.3 LLM calls through LiteLLM

Update your existing `services/llm.py` to support calling through the LiteLLM gateway (OpenAI-compatible API) alongside the direct Ollama client. Or simpler: just use `httpx` to call the LiteLLM OpenAI-compatible endpoint:

```python
async def llm_chat(messages: list[dict], stream: bool = False):
    """Call LLM via LiteLLM gateway (OpenAI-compatible)."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.llm_gateway_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_gateway_key}"},
            json={"model": settings.llm_model, "messages": messages, "stream": stream},
        )
        return resp.json()
```

### 13.4 Test

```bash
# Create conversation
CONV_ID=$(curl -s -X POST https://laed.eu/api/projects/${PROJECT_ID}/ai/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Ask a question (GPU must be on for laed-chat model)
curl -N https://laed.eu/api/projects/${PROJECT_ID}/ai/conversations/${CONV_ID}/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "What are the key findings in the uploaded report?"}'
# Should stream tokens back as SSE events
```

### 13.5 Tuning

Adjust these parameters based on results:
- Chunk size: 500 tokens (try 300-800)
- Chunk overlap: 50 tokens (try 25-100)
- Top-k retrieval: 5 (try 3-10)
- System prompt wording
- Temperature: 0.3 for factual answers, 0.7 for creative

---

## 14. Day 7: Real-Time Team Chat (WebSocket)

### 14.1 WebSocket endpoint — `backend/app/routes/chat.py`

```python
from fastapi import WebSocket, WebSocketDisconnect
import json

# Connection manager — tracks active connections per project
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}  # project_id → connections

    async def connect(self, project_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active.setdefault(project_id, []).append(websocket)

    def disconnect(self, project_id: str, websocket: WebSocket):
        self.active.get(project_id, []).remove(websocket)

    async def broadcast(self, project_id: str, message: dict):
        for conn in self.active.get(project_id, []):
            await conn.send_json(message)

manager = ConnectionManager()
```

### 14.2 WebSocket flow

1. Client connects to `/ws/projects/{project_id}`
2. Server validates JWT token (sent as query param or first message)
3. Server checks project membership
4. Client sends messages as JSON: `{"content": "...", "is_anonymous": false}`
5. Server stores in `messages` table, broadcasts to all project connections
6. On disconnect, remove from manager

### 14.3 Chat history endpoint

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/projects/{id}/messages` | GET | Yes | Paginated message history |

Query params: `?limit=50&before=<message_id>` for cursor-based pagination.

### 14.4 Test

Open two browser tabs at `https://laed.eu/api/docs` (or use `websocat`):

```bash
# Terminal 1
websocat "wss://laed.eu/ws/projects/${PROJECT_ID}?token=${TOKEN}"

# Terminal 2
websocat "wss://laed.eu/ws/projects/${PROJECT_ID}?token=${TOKEN2}"

# Type in terminal 1 — should appear in terminal 2
```

---

## 15. Day 8: Speech-to-Text Integration (Parakeet)

Parakeet is already deployed as a Docker service (from the compose file). Day 8 is about wiring it into the app.

### 15.1 STT service — `backend/app/services/stt.py`

```python
import httpx
from app.config import settings


class STTService:
    """Client for Parakeet TDT — OpenAI-compatible transcription API."""

    def __init__(self):
        self.base_url = settings.stt_url

    async def transcribe(self, audio_data: bytes, filename: str) -> dict:
        """Send audio to Parakeet, get transcript back."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self.base_url}/v1/audio/transcriptions",
                files={"file": (filename, audio_data)},
                data={"model": "parakeet-tdt-0.6b-v3"},
            )
            resp.raise_for_status()
            return resp.json()


stt_service = STTService()
```

### 15.2 Transcription route — `backend/app/routes/transcribe.py`

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/projects/{id}/transcribe` | POST | Yes | Upload audio, get transcript |

**Flow**:
1. Accept audio file upload (MP3, WAV, M4A, WebM)
2. Send to Parakeet for transcription
3. Save transcript as a project document (in `files` table with `file_type = 'transcript'`)
4. Trigger ingestion task → chunks + embeddings → searchable by AI
5. Return transcript text to the client

### 15.3 Meeting recording integration

The frontend (Day 9-10) will have a "Record Meeting" button that:
1. Uses browser `MediaRecorder` API to capture mic audio
2. Sends audio chunks or the complete recording to `/api/projects/{id}/transcribe`
3. Displays the returned transcript
4. Transcript auto-ingested into RAG — meeting content becomes searchable

### 15.4 Test

```bash
# Test Parakeet directly
curl -X POST http://localhost:5092/v1/audio/transcriptions \
  -F "file=@test-meeting.mp3" \
  -F "model=parakeet-tdt-0.6b-v3"

# Test through the app endpoint
curl -X POST https://laed.eu/api/projects/${PROJECT_ID}/transcribe \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-meeting.mp3"
# Expected: {"transcript": "...", "file_id": "...", "ingestion_status": "pending"}
```

---

## 16. Day 9-10: Frontend + PWA

### 16.1 Initialize Next.js

```bash
cd ~/Desktop/Repositories/laed
npx create-next-app@latest frontend \
  --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

### 16.2 Core pages

```
frontend/src/app/
├── layout.tsx                 ← root layout, global styles
├── page.tsx                   ← landing / redirect to login
├── login/page.tsx             ← email + password form
├── register/page.tsx          ← registration form
├── projects/
│   ├── page.tsx               ← project list (cards)
│   └── [id]/
│       └── page.tsx           ← THE main workspace view
└── manifest.json              ← PWA manifest (see 16.5)
```

### 16.3 Project workspace — three-panel layout

The main screen at `/projects/{id}` has three panels:

```
┌──────────────┬──────────────────────┬──────────────────────┐
│  FILES       │  TEAM CHAT           │  AI ASSISTANT        │
│              │                      │                      │
│  📁 report.pdf│  Alice: looks good  │  You: What does the  │
│  📁 slides.pptx  Bob: agreed      │  report say about Q3?│
│  📁 notes.md │                      │                      │
│              │  [anonymous] some    │  AI: Based on the    │
│  ┌─────────┐ │  concern here...     │  uploaded report,    │
│  │ DROP    │ │                      │  Q3 revenue was...   │
│  │ FILES   │ │                      │                      │
│  │ HERE    │ │  ┌────────────────┐  │  ┌────────────────┐  │
│  └─────────┘ │  │ Type message...│  │  │ Ask a question │  │
│              │  └────────────────┘  │  └────────────────┘  │
└──────────────┴──────────────────────┴──────────────────────┘
```

On mobile (< 768px): panels stack vertically with tabs to switch between them.

### 16.4 Key frontend implementations

**State management**: Zustand — one store for auth (token, user), one for the active project (messages, files, ai conversations).

**API client**: Generate TypeScript types from the backend OpenAPI spec:
```bash
npx openapi-typescript https://laed.eu/api/openapi.json -o src/api/types.ts
```

**Real-time team chat**: WebSocket connection via `useEffect` on the project page. Reconnect on disconnect. Messages append to the Zustand store and render immediately.

**AI chat streaming**: `EventSource` or `fetch` with `ReadableStream` for SSE. Tokens append to a message-in-progress state variable, rendered incrementally.

**File upload**: `react-dropzone` for drag-and-drop. Shows progress bar during upload, then polls `/files/{id}/status` for ingestion progress.

**Meeting recording**: `MediaRecorder` API → captures audio → sends to `/transcribe` → displays result.

### 16.5 PWA Setup

**`frontend/public/manifest.json`**:
```json
{
  "name": "LAED",
  "short_name": "LAED",
  "description": "Secure project collaboration",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0e17",
  "theme_color": "#0a0e17",
  "orientation": "any",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**`frontend/src/app/layout.tsx`** — add to `<head>`:
```tsx
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0a0e17" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

**Service worker** — install `next-pwa`:
```bash
cd frontend
npm install next-pwa
```

Configure in `next.config.js`:
```javascript
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

module.exports = withPWA({
  // your existing next config
});
```

This gives you:
- "Add to Home Screen" on iOS/Android → launches fullscreen without browser chrome
- Offline caching of static assets (app shell loads even without network)
- App icon on home screen
- No App Store needed, no 30% Apple cut

### 16.6 Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["npm", "start"]
```

Add to `docker-compose.yml`:
```yaml
  frontend:
    build: ./frontend
    networks:
      - frontend
    restart: always
```

Update `Caddyfile` to route to the frontend:
```
{$DOMAIN} {
    handle /api/* {
        reverse_proxy app:8000
    }
    handle /ws/* {
        reverse_proxy app:8000
    }
    handle {
        reverse_proxy frontend:3000
    }
}
```

---

## 17. Day 11-12: Integration Testing & Polish

### 17.1 End-to-end test flow

Run through the complete user journey:

1. Register user A and user B
2. User A creates a project
3. User A invites user B
4. User A uploads a PDF and a DOCX
5. Wait for ingestion (poll status endpoint)
6. User A asks the AI about the documents → verify relevant answers with source refs
7. User B opens team chat, sends a message → User A sees it in real-time
8. User A sends anonymous message → User B sees it without author
9. User A records audio → transcript appears → transcript is searchable by AI
10. User B tries to access User A's other project → gets 403

### 17.2 Access logging

Add logging middleware or per-route logging for:
- Every login attempt (success/failure)
- Every file view and download
- Every message sent
- Every AI query

Store in `access_log` table with IP address, user ID, action, timestamp.

### 17.3 Error handling

- Frontend: loading spinners, error toasts, retry buttons
- Backend: consistent error response format (`{"detail": "...", "code": "..."}`)
- WebSocket: auto-reconnect with exponential backoff

### 17.4 Security check

- Verify project isolation: user without membership gets 403 on every endpoint
- Verify file encryption: check MinIO objects are encrypted at rest
- Verify JWT expiry: token stops working after configured hours
- Verify role hierarchy: observer can't upload, member can't invite, etc.

### 17.5 Backup setup

```bash
ssh scw

# Create backup script
cat > /opt/projectspace-data/backup.sh << 'SCRIPT'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/projectspace-data/backups

# PostgreSQL dump
docker compose -f /opt/projectspace-data/docker-compose.yml \
  exec -T postgres pg_dump -U app projectspace \
  | gzip > ${BACKUP_DIR}/pg_${TIMESTAMP}.sql.gz

# Keep only last 7 daily backups
find ${BACKUP_DIR} -name "pg_*.sql.gz" -mtime +7 -delete

echo "Backup completed: pg_${TIMESTAMP}.sql.gz"
SCRIPT

chmod +x /opt/projectspace-data/backup.sh

# Add to cron (daily at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/projectspace-data/backup.sh") | crontab -
```

---

## 18. Day 13-14: Demo Preparation & Documentation

### 18.1 Demo project

Create a project with representative data:
- Upload 3-5 sample documents (M&A term sheet, NDA, financial model, board minutes)
- Use synthetic data or anonymized samples from Eraneos M&A practice
- Verify AI answers are relevant and cite correct sources

### 18.2 Demo script

Walkthrough for showing to potential test users / investors:

1. Open `laed.eu` on phone → "Add to Home Screen" → show it launches like an app
2. Register / login
3. Create "Project Alpha — Acquisition Target"
4. Upload documents → show encryption indicator, ingestion progress
5. Ask AI: "What is the proposed valuation?" → streamed answer with source refs
6. Open team chat → send messages including anonymous one
7. Record a short meeting → transcript appears → ask AI about what was discussed
8. Show project isolation: log in as different user → can't see Project Alpha
9. Invite second user → they can now access the project

### 18.3 Documentation

- README with setup instructions (so Carl could spin up a dev instance)
- API docs auto-generated at `/api/docs` (FastAPI/Swagger)
- Architecture diagram (the one we generated earlier in this conversation)

### 18.4 Mobile testing

Test on:
- iPhone Safari → "Add to Home Screen" → verify standalone mode
- Android Chrome → "Add to Home Screen" → verify standalone mode
- iPad → verify responsive layout
- Desktop browser → verify three-panel layout

### 18.5 Milestone

**A working demo that two people can use for a real confidential project — accessible from any device, no app store required.**

---

## 19. Quick Reference

```bash
# ── SSH ──────────────────────────────────────────────────
ssh scw                                    # via SSH config
ssh feline@100.64.x.y                     # via Tailscale

# ── Deploy cycle ────────────────────────────────────────
cd ~/Desktop/Repositories/laed
git add -A && git commit -m "description" && git push
ssh scw
cd /opt/projectspace-data/repo && git pull
cd /opt/projectspace-data && docker compose build app worker frontend && docker compose up -d

# ── Logs ─────────────────────────────────────────────────
docker compose logs -f app
docker compose logs -f worker
docker compose logs -f litellm
docker compose logs -f parakeet

# ── Database ─────────────────────────────────────────────
docker compose exec app alembic upgrade head
docker compose exec postgres psql -U app -d projectspace

# ── Test endpoints ──────────────────────────────────────
curl https://laed.eu/api/health
curl -s http://localhost:4000/health                         # LiteLLM
curl -s http://localhost:5092/health                         # Parakeet

# ── GPU management ──────────────────────────────────────
scw instance server start <GPU_INSTANCE_ID>
scw instance server stop <GPU_INSTANCE_ID>

# ── Backup ───────────────────────────────────────────────
/opt/projectspace-data/backup.sh
```
