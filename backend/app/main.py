from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models.base import async_session
from app.services.demo_user import ensure_demo_user
from app.services.project_delete import purge_seed_demo_projects
import app.services.tools  # noqa: F401 — register tool plugins


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_session() as db:
        await purge_seed_demo_projects(db)
        if settings.demo_email and settings.demo_password:
            await ensure_demo_user(db)
    if settings.rag_database_url and settings.laed_tenant_id:
        from app.services.rag_registry import ensure_rag_tenant
        from app.services.rag_retriever import rag_session_factory

        factory = rag_session_factory()
        async with factory() as rag_session:
            await ensure_rag_tenant(rag_session, tenant_id=settings.laed_tenant_id)
    yield


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

from app.routes.auth import router as auth_router
from app.routes.projects import router as projects_router
from app.routes.topology import router as topology_router
from app.routes.ai import router as ai_router
from app.routes.workspace_ai import router as workspace_ai_router
from app.routes.llm import router as llm_router
from app.routes.harness import router as harness_router
from app.routes.files import router as files_router
from app.routes.chat import router as chat_router
from app.routes.transcribe import router as transcribe_router
from app.routes.insights import router as insights_router
from app.routes.folders import router as folders_router
from app.routes.sharing import router as sharing_router
from app.routes.users import router as users_router
from app.routes.topic_members import router as topic_members_router
from app.routes.grid_sections import router as grid_sections_router
from app.routes.invitations import router as invitations_router
from app.routes.mentions import router as mentions_router
from app.routes.capture import router as capture_router
from app.routes.stt import router as stt_router

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(topology_router)
app.include_router(ai_router)
app.include_router(workspace_ai_router)
app.include_router(llm_router)
app.include_router(harness_router)
app.include_router(files_router)
app.include_router(chat_router)
app.include_router(transcribe_router)
app.include_router(insights_router)
app.include_router(folders_router)
app.include_router(sharing_router)
app.include_router(users_router)
app.include_router(topic_members_router)
app.include_router(grid_sections_router)
app.include_router(invitations_router)
app.include_router(mentions_router)
app.include_router(capture_router)
app.include_router(stt_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "llm_model": settings.llm_model,
    }
