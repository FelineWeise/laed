from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models.base import async_session
from app.services.demo_user import ensure_demo_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.demo_email and settings.demo_password:
        async with async_session() as db:
            await ensure_demo_user(db)
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
from app.routes.files import router as files_router
from app.routes.chat import router as chat_router
from app.routes.transcribe import router as transcribe_router
from app.routes.insights import router as insights_router

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(topology_router)
app.include_router(ai_router)
app.include_router(files_router)
app.include_router(chat_router)
app.include_router(transcribe_router)
app.include_router(insights_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "llm_model": settings.llm_model,
    }
