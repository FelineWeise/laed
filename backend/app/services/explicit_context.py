from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.access import has_project_access, has_topic_access
from app.models.ai import AIMessage
from app.models.message import Message
from app.models.topology import TopologyNode
from app.schemas.context import ExplicitContextItem
from app.services.harness import build_system_prompt
from app.services.retrieval.scope import RetrievalScope


async def resolve_explicit_context(
    db: AsyncSession,
    *,
    user_id: UUID,
    base_scope: RetrievalScope,
    items: list[ExplicitContextItem],
) -> tuple[RetrievalScope, str]:
    scope = base_scope.model_copy(deep=True)
    extra_blocks: list[str] = []

    for item in items:
        if item.type == "project":
            pid = UUID(item.ref_id)
            if await has_project_access(db, pid, user_id):
                if pid not in scope.project_ids:
                    scope.project_ids.append(pid)
            continue
        if item.type == "topic":
            tid = UUID(item.ref_id)
            node = await db.get(TopologyNode, tid)
            if node and node.scope_id and await has_topic_access(
                db, node.scope_id, tid, user_id
            ):
                if tid not in scope.topic_ids:
                    scope.topic_ids.append(tid)
                if node.scope_id not in scope.project_ids:
                    scope.project_ids.append(node.scope_id)
            continue
        if item.type == "folder":
            scope.folder_ids.append(UUID(item.ref_id))
            continue
        if item.type == "file":
            from app.models.file import File

            file_row = await db.get(File, UUID(item.ref_id))
            if file_row:
                extra_blocks.append(
                    f"### File: {item.label or file_row.filename}\n"
                    f"(document id {file_row.id} — included in retrieval scope)"
                )
            continue
        if item.type == "thread":
            parts = item.ref_id.split(":", 1)
            project_id = UUID(parts[-1])
            if await has_project_access(db, project_id, user_id):
                transcript = await _load_thread_excerpt(db, project_id, limit=20)
                extra_blocks.append(f"### Thread context: {item.label or project_id}\n{transcript}")
            continue
        if item.type == "ai_conversation":
            conv_id = UUID(item.ref_id)
            result = await db.execute(
                select(AIMessage)
                .where(AIMessage.conversation_id == conv_id)
                .order_by(AIMessage.created_at.desc())
                .limit(20)
            )
            rows = list(reversed(result.scalars().all()))
            lines = [f"{m.role}: {m.content[:500]}" for m in rows]
            extra_blocks.append(
                f"### Past AI conversation: {item.label or conv_id}\n" + "\n".join(lines)
            )
            continue
        if item.type == "harness_excerpt":
            harness = await build_system_prompt(db, user_id=user_id, project_id=None)
            if harness:
                extra_blocks.append(f"### Harness ({item.label})\n{harness[:2000]}")

    block = "\n\n".join(extra_blocks)
    return scope, block


async def _load_thread_excerpt(
    db: AsyncSession, project_id: UUID, *, limit: int
) -> str:
    result = await db.execute(
        select(Message)
        .where(Message.project_id == project_id, Message.message_type != "ai")
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    rows = list(reversed(result.scalars().all()))
    lines: list[str] = []
    for m in rows:
        label = "Anonymous" if m.is_anonymous else "User"
        lines.append(f"{label}: {m.content[:400]}")
    return "\n".join(lines) if lines else "(empty)"
