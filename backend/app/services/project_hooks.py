"""Side effects on project create (RAG registry + topology)."""

from __future__ import annotations

from app.config import settings
from app.models.project import Project
from app.models.user import User
from app.services.rag_registry import EMBEDDING_DIM_NOMIC, ensure_rag_project
from app.services.rag_retriever import rag_session_factory
from app.services.folders import ensure_default_uploads_folder
from app.services.topology_service import bootstrap_project_topology
from sqlalchemy.ext.asyncio import AsyncSession


async def on_project_created(
    db: AsyncSession,
    project: Project,
    creator: User,
) -> None:
    await bootstrap_project_topology(db, project, created_by=creator.id)
    await ensure_default_uploads_folder(db, project.id)

    if settings.rag_database_url and settings.laed_tenant_id:
        factory = rag_session_factory()
        async with factory() as rag_session:
            await ensure_rag_project(
                rag_session,
                tenant_id=settings.laed_tenant_id,
                project_id=str(project.id),
                name=project.name,
                embedding_model=settings.embedding_model,
                embedding_dim=EMBEDDING_DIM_NOMIC,
            )
