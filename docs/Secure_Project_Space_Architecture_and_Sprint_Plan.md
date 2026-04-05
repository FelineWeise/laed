# Secure Project Space — Technical Architecture & Sprint Plan

## 1. What We're Building

A secure, closed-loop collaboration environment for high-stakes confidential project work — initially targeting M&A deal teams, law firms, and consulting engagements. The core product is a **project-scoped workspace** where team members communicate, share files, and optionally interact with a private AI — all on sovereign European infrastructure with no data leaving the closed loop.

**Core value proposition**: Security and information centralization, not AI. The AI is an enhancement layer, not the selling point.

**MVP scope**: A working mobile app (Expo/React Native) connected to a self-hosted backend on Scaleway (Paris, France), where users can create a project space, invite participants, drop files, chat with each other, chat with a private AI that understands the project's documents, and record/transcribe meetings — all on sovereign European infrastructure with no data leaving the closed loop.

---

## 2. Architecture Overview

### 2.1 Infrastructure

**MVP Phase (Now)**: Two Scaleway instances — base server (always-on) + GPU (on-demand)

| Server | Type | Specs | Cost | Purpose |
|--------|------|-------|------|---------|
| Base (always-on) | Scaleway GP1-XS | 4 vCPU, 16GB RAM, 100GB Block Storage | ~€66/month + ~€10 storage | App, DB, files, vectors, reverse proxy |
| GPU (on-demand) | Scaleway L4-1-24G | NVIDIA L4, 24GB VRAM | ~€0.75/hour | LLM inference, STT, embeddings |

| Property | Detail |
|----------|--------|
| Location | Paris, France (PAR-1 / PAR-2) |
| Compliance | GDPR-compliant, European data sovereignty |
| Network | Both servers on same Scaleway Private Network (VPC) — internal traffic only |
| GPU billing | Pay only when powered on; power off to stop billing |
| Estimated monthly cost (sprint) | ~€130 (base + ~8h/day GPU) |
| Estimated monthly cost (light use) | ~€95 (base + ~2h/day GPU) |
| Estimated monthly cost (no AI) | ~€76 (base only) |

**Scale Phase (Later)**: Upgrade GPU instance or add Kubernetes

| Upgrade | When | Cost |
|---------|------|------|
| L40S-1-48G (48GB VRAM) | Need bigger models (32B-70B) | ~€1.40/hour |
| Scaleway Kubernetes Kapsule | Need autoscaling, multi-tenant | Variable |
| Additional base server replicas | Need high availability | ~€66/month each |

### 2.2 Service Architecture

Everything runs as Docker containers orchestrated by docker-compose. Six logical layers, each with clear API boundaries so any service can be relocated later without code changes.

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                          │
│  Web App (React/Next.js) — PWA-enabled for mobile       │
│  WebSocket connection for real-time chat                 │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + WSS
┌──────────────────────▼──────────────────────────────────┐
│                  REVERSE PROXY                           │
│  Caddy — auto-TLS via Let's Encrypt                     │
│  Routes: /api/* → app, /ws → websocket, /ollama → LLM  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  API GATEWAY                             │
│  FastAPI (Python)                                        │
│  • JWT-based auth (project-scoped tokens)                │
│  • Role-based access control per project                 │
│  • Rate limiting                                         │
│  • WebSocket handler for real-time chat                  │
└───┬──────────┬──────────┬──────────┬────────────────────┘
    │          │          │          │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼────────────────────┐
│Project│ │ Chat  │ │ File  │ │   AI / RAG Pipeline     │
│Service│ │Service│ │Service│ │                          │
│       │ │       │ │       │ │ Ingestion → Embeddings   │
│CRUD   │ │Messages│ │Upload │ │ ChromaDB → Ollama       │
│Users  │ │History│ │Encrypt│ │ Faster-Whisper (STT)     │
│Roles  │ │Rooms  │ │Serve  │ │                          │
└───┬───┘ └───┬───┘ └───┬───┘ └───┬────────────────────┘
    │         │         │         │
┌───▼─────────▼─────────▼─────────▼────────────────────┐
│                  STORAGE LAYER                         │
│  PostgreSQL 16 — users, projects, messages, metadata   │
│  MinIO — encrypted file storage (S3-compatible)        │
│  ChromaDB — vector embeddings (per-project collections)│
└───────────────────────────────────────────────────────┘
```

### 2.3 Key Design Decisions

**Service communication via HTTP APIs**: Every service is addressable by environment variable (`LLM_ENDPOINT`, `STT_ENDPOINT`, `CHROMA_URL`, `MINIO_URL`). Today these resolve to docker network names. When you split servers later, they become private IPs or K8s service names. Application code doesn't change.

**Project isolation**: Each project gets its own ChromaDB collection, its own MinIO bucket, its own chat room(s), and its own access control list. There is zero data leakage between projects by design.

**Encryption**: Files encrypted at rest (AES-256 via MinIO server-side encryption). Messages encrypted in transit (TLS). Future: end-to-end encryption for messages where the server can't read content (like Signal protocol).

**No external API calls**: The LLM (Ollama) runs locally. STT (Faster-Whisper) runs locally. Embeddings generated locally. Nothing leaves the server. This is the "closed loop."

---

## 3. Technology Stack — Specific Choices

### 3.1 Backend

| Component | Technology | Why |
|-----------|-----------|-----|
| API Framework | **FastAPI (Python)** | You're fastest in Python, async-native, auto-generates OpenAPI docs, great WebSocket support |
| Database | **PostgreSQL 16** | Rock-solid, handles relational data + JSONB for flexible metadata |
| ORM | **SQLAlchemy 2.0 + Alembic** | Type-safe queries, migration management |
| Auth | **JWT tokens** (PyJWT) | Stateless, project-scoped claims, no session management overhead |
| WebSockets | **FastAPI WebSocket** | Built-in, handles real-time chat |
| Task Queue | **Celery + Redis** | Async file processing, embedding generation, STT jobs |

### 3.2 File & Object Storage

| Component | Technology | Why |
|-----------|-----------|-----|
| Object Storage | **MinIO** | Self-hosted S3-compatible, server-side encryption (SSE-S3), per-project buckets |
| File Processing | **unstructured.io** | Parses PDF, DOCX, XLSX, PPTX, images — extracts text for RAG pipeline |

### 3.3 AI / RAG Pipeline

| Component | Technology | Why |
|-----------|-----------|-----|
| LLM Runtime | **Ollama** | Dead simple API, GPU-accelerated, model management built in |
| LLM Model | **Qwen 2.5 32B (Q4_K_M)** | Best quality-to-VRAM ratio; fits in ~18GB VRAM; strong multilingual (DE/EN); good structured output |
| Fallback LLM | **Mistral Nemo 12B** | Lighter model for when GPU is busy with STT; runs well on CPU |
| Embeddings | **nomic-embed-text** (via Ollama) | 768-dim, runs fast on GPU, good multilingual performance |
| Vector DB | **ChromaDB** | Lightweight, runs locally, persistent storage, per-collection isolation |
| RAG Framework | **LlamaIndex** | Cleaner abstraction than LangChain for document QA; handles chunking, retrieval, synthesis |
| STT | **Faster-Whisper (large-v3)** | GPU-accelerated, ~3GB VRAM, real-time capable, excellent DE/EN |
| STT Server | **WhisperX** or custom FastAPI wrapper | Exposes Whisper as HTTP endpoint; handles speaker diarization |

### 3.4 Frontend

| Component | Technology | Why |
|-----------|-----------|-----|
| Framework | **Next.js 14 (App Router)** | SSR for initial load, React for interactivity, API routes if needed |
| Styling | **Tailwind CSS** | Fast development, consistent design system |
| Real-time | **Socket.io client** | WebSocket with fallback, reconnection handling |
| File Upload | **react-dropzone** | Drag-and-drop, progress indicators |
| State | **Zustand** | Lightweight, no boilerplate |
| Auth | **NextAuth.js** or custom JWT handling | Token management, protected routes |

### 3.5 Infrastructure

| Component | Technology | Why |
|-----------|-----------|-----|
| Containerization | **Docker + docker-compose** | Single-command deployment, reproducible, portable |
| Reverse Proxy | **Caddy 2** | Auto-HTTPS, simple config, WebSocket proxying |
| Monitoring | **Uptime Kuma** (optional) | Self-hosted status monitoring |
| Backup | **restic** → Hetzner Storage Box | Encrypted backups of PostgreSQL dumps + MinIO data |

---

## 4. Data Flow Diagrams

### 4.1 File Upload → RAG Ready

```
User drags file into project space
        │
        ▼
[API Gateway] — validates auth + project scope
        │
        ▼
[File Service] — encrypts file → stores in MinIO (project bucket)
        │
        ▼
[Celery Task Queue] — async job triggered
        │
        ▼
[Ingestion Worker]
   ├── unstructured.io extracts text from PDF/DOCX/XLSX/etc.
   ├── Text chunked into ~500 token passages with overlap
   ├── Each chunk embedded via nomic-embed-text (Ollama)
   └── Embeddings stored in ChromaDB (project-scoped collection)
        │
        ▼
File is now searchable by AI within this project
```

### 4.2 AI Chat (User asks question about project)

```
User types question in AI chat panel
        │
        ▼
[API Gateway] — validates auth + project scope
        │
        ▼
[RAG Service]
   ├── Query embedded via nomic-embed-text
   ├── ChromaDB searched for top-k relevant chunks (project collection only)
   ├── Retrieved chunks assembled into context prompt
   └── Prompt + context sent to Ollama (Qwen 2.5 32B)
        │
        ▼
[Ollama] — generates response (streamed back via SSE)
        │
        ▼
Response displayed in AI chat panel (with source references)
```

### 4.3 Meeting Recording → Transcript

```
User clicks "Record" in project space
        │
        ▼
[Browser MediaRecorder API] — captures audio
        │
        ▼
Audio chunks sent to server (WebSocket or chunked upload)
        │
        ▼
[STT Service (Faster-Whisper)]
   ├── Processes audio chunks
   ├── Generates timestamped transcript
   ├── Speaker diarization (WhisperX)
   └── Transcript stored as project document
        │
        ▼
[Ingestion Worker] — transcript auto-ingested into RAG pipeline
        │
        ▼
Meeting content is now searchable by AI
```

### 4.4 Team Chat

```
User sends message in project chat
        │
        ▼
[WebSocket Connection] — message sent to server
        │
        ▼
[Chat Service]
   ├── Message stored in PostgreSQL (project_id, user_id, timestamp, content)
   ├── Message broadcast to all connected project members via WebSocket
   └── (Future: message encrypted E2E before storage)
        │
        ▼
All project members see message in real-time
```

---

## 5. Database Schema (Core Tables)

### 5.1 Model Architecture — BaseMixin Pattern

All models inherit from a shared `BaseMixin` that provides `id` (UUID, server-generated) and `created_at` (timestamp, server-generated). This eliminates repetition across all 8 tables and provides a single place to add cross-cutting columns later (e.g., `updated_at`).

```python
# backend/app/models/base.py
class BaseMixin:
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, server_default=text("gen_random_uuid()"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

# Every model inherits from both BaseMixin and Base:
class User(BaseMixin, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String, unique=True)
    # ...only user-specific columns
```

### 5.2 Pydantic Schema Hierarchy — API Contract

SQLAlchemy models define storage; Pydantic schemas define the API contract (what the client sees). They are deliberately separate so you can shape each independently — e.g., `User` has `password_hash` in the DB but never exposes it in a response.

Schemas use inheritance to reduce duplication across create/update/response variants:

```python
# backend/app/schemas.py

# Base shape — shared fields for input
class ProjectBase(BaseModel):
    name: str
    description: str | None = None

# Create request — extends base with creation-specific fields
class ProjectCreate(ProjectBase):
    ownership_model: str = "owned"

# List response — extends base with DB-generated fields
class ProjectResponse(ProjectBase):
    id: uuid.UUID
    created_at: datetime
    ownership_model: str
    model_config = {"from_attributes": True}  # reads directly from SQLAlchemy objects

# Detail response — extends list response with computed/nested fields
class ProjectDetailResponse(ProjectResponse):
    members: list[MemberResponse]
    file_count: int
```

`from_attributes = True` allows `ProjectResponse.model_validate(db_project)` — Pydantic reads directly from the SQLAlchemy object's attributes, no manual field-by-field mapping needed.

### 5.3 OpenAPI → TypeScript Type Generation Pipeline

FastAPI auto-generates an OpenAPI (Swagger) spec from the Pydantic schemas. This spec can be consumed by codegen tools to produce TypeScript interfaces for the frontend (web and mobile share the same types):

```
SQLAlchemy Models → Pydantic Schemas → FastAPI OpenAPI JSON → TypeScript Interfaces
   (DB schema)       (API contract)     (auto-generated)       (one command)
```

Generate TypeScript types from the running API:
```bash
npx openapi-typescript http://localhost:8000/api/openapi.json -o src/api/types.ts
```

This produces typed interfaces that both Expo (React Native) and any web frontend consume directly:
```typescript
interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  ownership_model: string;
  created_at: string;
}
```

The types are derived from the Pydantic schemas, so they can never drift out of sync with the API. When a schema changes in the backend, re-running the codegen command updates the frontend types.

### 5.4 SQL Schema

```sql
-- Users
users (
    id UUID PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    display_name VARCHAR NOT NULL,
    password_hash VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
)

-- Projects (the "bubbles")
projects (
    id UUID PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id),
    ownership_model VARCHAR DEFAULT 'owned',  -- 'owned' | 'autonomous'
    created_at TIMESTAMP DEFAULT NOW(),
    archived_at TIMESTAMP
)

-- Project membership + roles
project_members (
    project_id UUID REFERENCES projects(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR NOT NULL DEFAULT 'member',  -- 'owner' | 'admin' | 'member' | 'observer'
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
)

-- Chat messages
messages (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) NOT NULL,
    user_id UUID REFERENCES users(id),      -- NULL for anonymous messages
    content TEXT NOT NULL,
    is_anonymous BOOLEAN DEFAULT FALSE,
    message_type VARCHAR DEFAULT 'chat',     -- 'chat' | 'ai_response' | 'system'
    created_at TIMESTAMP DEFAULT NOW()
)

-- Files
files (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) NOT NULL,
    uploaded_by UUID REFERENCES users(id),
    filename VARCHAR NOT NULL,
    file_type VARCHAR,
    file_size_bytes BIGINT,
    minio_key VARCHAR NOT NULL,              -- path in MinIO bucket
    ingestion_status VARCHAR DEFAULT 'pending',  -- 'pending' | 'processing' | 'ready' | 'failed'
    created_at TIMESTAMP DEFAULT NOW()
)

-- AI conversations (separate from team chat)
ai_conversations (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) NOT NULL,
    user_id UUID REFERENCES users(id) NOT NULL,
    is_private BOOLEAN DEFAULT TRUE,         -- private AI chat vs shared
    created_at TIMESTAMP DEFAULT NOW()
)

ai_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID REFERENCES ai_conversations(id) NOT NULL,
    role VARCHAR NOT NULL,                   -- 'user' | 'assistant'
    content TEXT NOT NULL,
    source_chunks JSONB,                     -- references to ChromaDB chunks used
    created_at TIMESTAMP DEFAULT NOW()
)

-- Access log (security audit trail)
access_log (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    user_id UUID REFERENCES users(id),
    action VARCHAR NOT NULL,                 -- 'login' | 'file_view' | 'file_download' | 'message_sent' etc.
    resource_id UUID,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
)
```

---

## 6. Docker Compose — Complete MVP Stack

```yaml
version: '3.8'

services:
  # ── Reverse Proxy ──────────────────────────
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    restart: always

  # ── Application Server ─────────────────────
  app:
    build: ./app
    environment:
      - DATABASE_URL=postgresql+asyncpg://app:${DB_PASSWORD}@postgres:5432/projectspace
      - REDIS_URL=redis://redis:6379/0
      - OLLAMA_URL=http://ollama:11434
      - CHROMA_URL=http://chromadb:8000
      - MINIO_URL=minio:9000
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
      - STT_URL=http://whisper:8080
      - JWT_SECRET=${JWT_SECRET}
      - EMBEDDING_MODEL=nomic-embed-text
      - LLM_MODEL=qwen2.5:32b-instruct-q4_K_M
    depends_on:
      - postgres
      - redis
      - minio
      - chromadb
      - ollama
    restart: always

  # ── Celery Worker (async tasks) ────────────
  worker:
    build: ./app
    command: celery -A app.worker worker --loglevel=info --concurrency=2
    environment:
      - DATABASE_URL=postgresql+asyncpg://app:${DB_PASSWORD}@postgres:5432/projectspace
      - REDIS_URL=redis://redis:6379/0
      - OLLAMA_URL=http://ollama:11434
      - CHROMA_URL=http://chromadb:8000
      - MINIO_URL=minio:9000
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
      - EMBEDDING_MODEL=nomic-embed-text
    depends_on:
      - redis
      - postgres
      - chromadb
      - ollama
    restart: always

  # ── Database ───────────────────────────────
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=projectspace
      - POSTGRES_USER=app
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: always

  # ── Task Queue Broker ──────────────────────
  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    restart: always

  # ── File Storage ───────────────────────────
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}
    volumes:
      - filedata:/data
    restart: always

  # ── Vector Database ────────────────────────
  chromadb:
    image: chromadb/chroma:latest
    volumes:
      - vectordata:/chroma/chroma
    environment:
      - ANONYMIZED_TELEMETRY=FALSE
      - PERSIST_DIRECTORY=/chroma/chroma
    restart: always

  # ── LLM (GPU-accelerated) ─────────────────
  ollama:
    image: ollama/ollama
    volumes:
      - models:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: always

  # ── Speech-to-Text (GPU-accelerated) ──────
  whisper:
    build: ./whisper-service
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - WHISPER_MODEL=large-v3
      - DEVICE=cuda
    restart: always

volumes:
  caddy_data:
  caddy_config:
  pgdata:
  redisdata:
  filedata:
  vectordata:
  models:
```

---

## 7. VRAM Budget (Scaleway L4 — 24 GB)

| Service | Model | VRAM Usage | Notes |
|---------|-------|-----------|-------|
| LLM | Qwen 2.5 14B Q4_K_M | ~9 GB | Primary model, good quality/speed balance |
| Embeddings | nomic-embed-text | ~0.3 GB | Small, always loaded |
| STT | Faster-Whisper large-v3 | ~3 GB | Loaded on demand |
| **Total if all loaded** | | **~12.3 GB** | **Fits comfortably in 24 GB** |

**Upgrade path**: With 24GB VRAM and headroom to spare, you could also test Qwen 2.5 32B Q4_K_M (~18GB) which would leave ~6GB for embeddings but require unloading for STT. The 14B is the safer default that lets everything run simultaneously.

---

## 8. Sprint To-Do List — Developer (Feline)

### Day 1: Server Setup & Base Infrastructure

- [ ] Order Hetzner GEX44 (Falkenstein datacenter)
- [ ] SSH in, update Ubuntu 24.04, harden (disable root login, set up SSH keys, configure firewall with `ufw`)
- [ ] Install Docker Engine + Docker Compose + NVIDIA Container Toolkit
- [ ] Verify GPU access from Docker: `docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi`
- [ ] Register a domain (or use a subdomain you already own) and point DNS to server IP
- [ ] Create project directory structure:
  ```
  /opt/projectspace/
  ├── docker-compose.yml
  ├── .env                    # secrets (DB_PASSWORD, JWT_SECRET, MINIO keys)
  ├── Caddyfile
  ├── app/                    # FastAPI application
  │   ├── Dockerfile
  │   ├── requirements.txt
  │   ├── app/
  │   │   ├── main.py         # FastAPI app entry
  │   │   ├── auth/           # JWT auth, middleware
  │   │   ├── models/         # SQLAlchemy models
  │   │   ├── routes/         # API endpoints
  │   │   ├── services/       # Business logic
  │   │   ├── worker.py       # Celery tasks
  │   │   └── config.py       # Environment-based config
  │   └── alembic/            # DB migrations
  ├── whisper-service/        # STT microservice
  │   ├── Dockerfile
  │   └── server.py
  └── frontend/               # Next.js app
      └── ...
  ```
- [ ] Create `.env` file with generated secrets
- [ ] Write Caddyfile for reverse proxy with auto-TLS
- [ ] Spin up docker-compose with postgres + redis + minio + chromadb (no app yet)
- [ ] Verify all infrastructure services are running

### Day 2: LLM & Embeddings Setup

- [ ] Start Ollama container with GPU access
- [ ] Pull models: `docker exec ollama ollama pull qwen2.5:32b-instruct-q4_K_M`
- [ ] Pull embedding model: `docker exec ollama ollama pull nomic-embed-text`
- [ ] Test LLM via curl: `curl http://localhost:11434/api/chat -d '{"model": "qwen2.5:32b-instruct-q4_K_M", "messages": [{"role": "user", "content": "Hello"}]}'`
- [ ] Test embeddings via curl
- [ ] Benchmark: measure tokens/second for chat, time-to-first-token
- [ ] If VRAM is tight, test Qwen 2.5 14B as fallback

### Day 3: Database & Auth

- [ ] Define SQLAlchemy models (users, projects, project_members, messages, files, ai_conversations, ai_messages, access_log)
- [ ] Set up Alembic, create initial migration, run it
- [ ] Build auth module: password hashing (bcrypt), JWT token generation with project-scoped claims, middleware for route protection
- [ ] Build user registration + login endpoints
- [ ] Build project CRUD endpoints (create, list, get, archive)
- [ ] Build project membership endpoints (invite user, set role, remove)
- [ ] Test all with curl or Postman

### Day 4: File Service

- [ ] Initialize MinIO bucket creation on first project creation (one bucket per project)
- [ ] Build file upload endpoint (multipart form, validates auth + project scope)
- [ ] Implement server-side encryption in MinIO (SSE-S3)
- [ ] Build file listing endpoint (per project)
- [ ] Build file download endpoint (with access logging)
- [ ] Store file metadata in PostgreSQL
- [ ] Test: upload a PDF and DOCX, verify they're encrypted in MinIO

### Day 5: RAG Ingestion Pipeline

- [ ] Set up Celery worker with Redis broker
- [ ] Build ingestion task: triggered when file upload completes
  - Extract text using `unstructured` library (handles PDF, DOCX, XLSX, PPTX, TXT, MD, images via OCR)
  - Chunk text (~500 tokens, 50 token overlap)
  - Generate embeddings via Ollama nomic-embed-text
  - Store in ChromaDB with project-scoped collection name
  - Update file record: `ingestion_status = 'ready'`
- [ ] Test: upload a multi-page PDF, verify chunks appear in ChromaDB
- [ ] Build status endpoint so frontend can poll ingestion progress

### Day 6: AI Chat (RAG)

- [ ] Build AI conversation endpoints (create conversation, send message, get history)
- [ ] Implement RAG retrieval:
  - Embed user query via nomic-embed-text
  - Search ChromaDB (project collection, top-5 results)
  - Assemble system prompt with retrieved context
  - Stream response from Ollama via Server-Sent Events (SSE)
- [ ] Include source references in response (which files/chunks were used)
- [ ] Test: upload a document, ask questions about it, verify relevant answers
- [ ] Tune: adjust chunk size, overlap, top-k, system prompt

### Day 7: Real-Time Chat (Team Communication)

- [ ] Set up WebSocket endpoint in FastAPI
- [ ] Implement connection management: authenticate on connect, subscribe to project room
- [ ] Build message handling: receive → validate → store in DB → broadcast to room
- [ ] Support anonymous messages (flag: `is_anonymous = True`, `user_id = NULL`)
- [ ] Build chat history endpoint (paginated, per project)
- [ ] Test with two browser tabs: messages appear in real-time on both

### Day 8: Speech-to-Text Service

- [ ] Build whisper-service Docker container:
  - FastAPI server wrapping Faster-Whisper
  - Endpoint: POST /transcribe (accepts audio file, returns JSON transcript)
  - Endpoint: WebSocket /stream (accepts audio chunks, returns partial transcripts)
  - Speaker diarization via WhisperX (optional, can add later)
- [ ] Test: record a short audio clip, send to endpoint, verify transcript
- [ ] Wire up: transcripts auto-saved as project documents → ingested into RAG
- [ ] Test VRAM sharing: verify Ollama unloads model when Whisper needs GPU

### Day 9-10: Frontend — Core UI

- [ ] Initialize Next.js project with Tailwind
- [ ] Build auth pages: login, register (minimal, functional)
- [ ] Build project list view: shows projects you're a member of
- [ ] Build project space view — the main screen, three-panel layout:
  - **Left panel**: File explorer (list of uploaded files, drag-and-drop zone)
  - **Center panel**: Team chat (real-time messages, send box, anonymous toggle)
  - **Right panel**: AI chat (private conversation with project AI, streamed responses)
- [ ] Implement file upload with drag-and-drop (react-dropzone) + progress indicator
- [ ] Implement WebSocket connection for real-time team chat
- [ ] Implement AI chat with streaming responses (SSE → incremental text display)
- [ ] Implement basic project settings (invite user by email, view members, roles)
- [ ] Mobile responsiveness: panels stack vertically on small screens

### Day 11-12: Integration Testing & Polish

- [ ] End-to-end test: create project → invite user → upload files → wait for ingestion → chat with AI about files → team chat
- [ ] Add access logging (every file view, download, message, login gets logged)
- [ ] Add basic error handling and loading states in frontend
- [ ] Add "Record Meeting" button (captures mic audio, sends to Whisper, displays transcript)
- [ ] Test recording → transcription → RAG ingestion flow end-to-end
- [ ] Security check: verify project isolation (user A can't see user B's project data)
- [ ] Set up basic backup: pg_dump cron job + restic to Hetzner Storage Box

### Day 13-14: Demo Preparation & Documentation

- [ ] Create a demo project with representative M&A data (get from Eraneos M&A team or use synthetic data)
- [ ] Prepare demo script: walkthrough of key flows for showing to potential test users
- [ ] Write README with setup instructions (so Carl or someone else could spin up a dev instance)
- [ ] Document API endpoints (FastAPI auto-generates this at /docs)
- [ ] Test on mobile (iPhone/Android browser)
- [ ] Bug fixes, final polish
- [ ] **Milestone: working demo that two people can use for a real project**

---

## 9. Environment Variables Reference

```bash
# .env file — generate all secrets with: openssl rand -hex 32

# Database
DB_PASSWORD=<generated>

# Auth
JWT_SECRET=<generated>
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24

# MinIO (File Storage)
MINIO_ACCESS_KEY=<generated>
MINIO_SECRET_KEY=<generated>

# AI Models
LLM_MODEL=qwen2.5:32b-instruct-q4_K_M
EMBEDDING_MODEL=nomic-embed-text
WHISPER_MODEL=large-v3

# Service URLs (internal docker network)
OLLAMA_URL=http://ollama:11434
CHROMA_URL=http://chromadb:8000
STT_URL=http://whisper:8080
MINIO_URL=minio:9000
REDIS_URL=redis://redis:6379/0
DATABASE_URL=postgresql+asyncpg://app:${DB_PASSWORD}@postgres:5432/projectspace

# Domain
DOMAIN=your-domain.com
```

---

## 10. Future Additions (Post-MVP, Not Now)

These are features to think about but explicitly NOT build in the two-week sprint:

- **End-to-end encryption** (Signal protocol for messages — currently encrypted in transit + at rest, but server can read)
- **Visible security UX** (encryption indicators, access key visualization, audit trail dashboard)
- **Anonymous contribution** (partly done with anonymous chat; extend to anonymous file uploads)
- **Ownership models** (client-owned vs. autonomous project spaces)
- **Kubernetes migration** (when you need multi-tenant isolation or autoscaling)
- **Native mobile app** (React Native or Flutter; PWA is enough for now)
- **Meeting bot integration** (auto-join Teams/Zoom calls to record; complex, needs OAuth flows)
- **Multi-model support** (let users choose between local LLM and external API if they opt in)
- **SSO / SAML integration** (for enterprise clients)
- **Compliance certifications** (SOC 2, ISO 27001 for the product itself — different from Hetzner's certs)

---

*Last updated: March 2026 — Sprint start target: ASAP*
