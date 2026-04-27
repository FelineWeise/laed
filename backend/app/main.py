from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
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
from app.routes.models import router as models_router
from app.routes.projects import router as projects_router

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(models_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "llm_model": settings.llm_model,
    }
