"""Build RetrievalScope from API payloads and project context."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.ai import MessageCreate
from app.services.retrieval.scope import RetrievalScope
from app.services.sharing.grants import expand_scope_with_grants


def _payload_to_scope(payload: object) -> RetrievalScope:
    data = payload.model_dump() if hasattr(payload, "model_dump") else payload
    scope = RetrievalScope.model_validate(data)
    return scope


def scope_from_message(
    project_id: UUID,
    body: MessageCreate,
) -> RetrievalScope:
    """Default project-scoped retrieval; honor explicit retrieval_scope payload."""
    if body.retrieval_scope is not None:
        scope = _payload_to_scope(body.retrieval_scope)
        if not scope.project_ids:
            scope.project_ids = [project_id]
        elif project_id not in scope.project_ids and scope.level != "global":
            scope.project_ids = [project_id, *scope.project_ids]
        if body.topic_node_id and body.topic_node_id not in scope.topic_ids:
            scope.topic_ids = [body.topic_node_id, *scope.topic_ids]
        if scope.level == "topic" and not scope.topic_ids and body.topic_node_id:
            scope.topic_ids = [body.topic_node_id]
        return scope

    level: str = "topic" if body.topic_node_id else "project"
    topic_ids = [body.topic_node_id] if body.topic_node_id else []
    return RetrievalScope(
        level=level,  # type: ignore[arg-type]
        project_ids=[project_id],
        topic_ids=topic_ids,
        include_linked=False,
    )


async def resolve_retrieval_scope(
    project_id: UUID,
    body: MessageCreate,
    db: AsyncSession,
    *,
    user_id: UUID,
) -> RetrievalScope:
    scope = scope_from_message(project_id, body)
    if scope.include_linked:
        scope = await expand_scope_with_grants(scope, user_id, db)
    return scope
