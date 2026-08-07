#!/usr/bin/env python3
"""Backfill rag.projects for existing projectspace.projects.

Canonical copy for the Docker image: backend/scripts/backfill_rag_projects.py
(baked in at /app/scripts/). Keep these two files in sync.

Run inside the app container (WORKDIR=/app, PYTHONPATH=/app):

  docker compose exec -T app python /app/scripts/backfill_rag_projects.py

If the image predates /app/scripts/, copy then run with PYTHONPATH:

  docker compose cp scripts/backfill_rag_projects.py app:/tmp/backfill_rag_projects.py
  docker compose exec -T -e PYTHONPATH=/app app python /tmp/backfill_rag_projects.py
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.config import settings
from app.models.project import Project
from app.models.base import async_session
from app.services.rag import resolve_embedding_store
from app.services.rag_registry import ensure_rag_project, ensure_rag_tenant
from app.services.rag_retriever import rag_session_factory


async def main() -> int:
    if not settings.rag_database_url or not settings.laed_tenant_id:
        print("RAG_DATABASE_URL and LAED_TENANT_ID must be set", file=sys.stderr)
        return 1

    async with async_session() as db:
        result = await db.execute(
            select(Project).where(Project.archived_at.is_(None))
        )
        projects = result.scalars().all()

    _table, embedding_dim = resolve_embedding_store(settings.embedding_model)
    factory = rag_session_factory()
    async with factory() as rag_session:
        await ensure_rag_tenant(rag_session, tenant_id=settings.laed_tenant_id)
        for project in projects:
            await ensure_rag_project(
                rag_session,
                tenant_id=settings.laed_tenant_id,
                project_id=str(project.id),
                name=project.name,
                embedding_model=settings.embedding_model,
                embedding_dim=embedding_dim,
            )
            print(f"rag.projects: {project.id} {project.name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
