from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ai import AIMessage
from app.models.message import Message
from app.models.topology import TopologyNode
from app.schemas.ai import MessageCreate
from app.services.ai_chat import build_project_system, build_workspace_system
from app.services.explicit_context import resolve_explicit_context
from app.services.retrieval.resolve import resolve_retrieval_scope
from app.services.retrieval.scope import RetrievalScope

CONCISE_INSTRUCTION = (
    "Respond concisely and practically. Favor brevity. Avoid unnecessary preamble, "
    "caveats, or restating the question. Get to the point."
)


def _with_concise(system: str) -> str:
    base = system.strip()
    if not base:
        return CONCISE_INSTRUCTION
    return f"{base}\n\n{CONCISE_INSTRUCTION}"


async def _constituent_topic_ids(
    db: AsyncSession, project_id: UUID
) -> list[UUID]:
    result = await db.execute(
        select(TopologyNode.id).where(
            TopologyNode.scope_type == "project",
            TopologyNode.scope_id == project_id,
            TopologyNode.node_type == "topic",
        )
    )
    return [row[0] for row in result.all()]


async def load_ai_conversation_messages(
    db: AsyncSession,
    conv_id: UUID,
    *,
    max_chars: int,
) -> list[dict[str, str]]:
    result = await db.execute(
        select(AIMessage)
        .where(AIMessage.conversation_id == conv_id)
        .order_by(AIMessage.created_at)
    )
    rows = result.scalars().all()
    out: list[dict[str, str]] = []
    total = 0
    for row in reversed(rows):
        if row.role not in ("user", "assistant"):
            continue
        piece = row.content
        if total + len(piece) > max_chars:
            break
        out.insert(0, {"role": row.role, "content": piece})
        total += len(piece)
    return out


async def load_thread_messages(
    db: AsyncSession,
    *,
    project_id: UUID,
    topic_node_id: UUID | None,
    thread_session_id: UUID | None,
    max_chars: int,
) -> list[dict[str, str]]:
    stmt = (
        select(Message)
        .where(Message.project_id == project_id)
        .order_by(Message.created_at.desc())
        .limit(80)
    )
    if thread_session_id is not None:
        stmt = stmt.where(Message.thread_session_id == thread_session_id)
    if topic_node_id is not None:
        stmt = stmt.where(Message.topic_node_id == topic_node_id)
    else:
        stmt = stmt.where(Message.topic_node_id.is_(None))
    result = await db.execute(stmt)
    rows = list(reversed(result.scalars().all()))
    out: list[dict[str, str]] = []
    total = 0
    for row in rows:
        role = "assistant" if row.message_type == "ai" else "user"
        label = "AI" if row.message_type == "ai" else (
            "Anonymous" if row.is_anonymous else "User"
        )
        piece = f"[{label}]: {row.content}"
        if total + len(piece) > max_chars:
            break
        out.append({"role": role, "content": piece})
        total += len(piece)
    return out


async def build_chat_context(
    db: AsyncSession,
    *,
    user_id: UUID,
    project_id: UUID | None,
    body: MessageCreate,
    mode: str = "project",
    conversation_id: UUID | None = None,
    thread_history: bool = False,
    thread_session_id: UUID | None = None,
) -> tuple[str, list[dict[str, str]], list[dict[str, object]]]:
    """Returns system prompt, LLM messages (without system), and RAG hits."""
    max_chars = settings.ai_history_max_chars

    if mode == "workspace" or project_id is None:
        system = await build_workspace_system(db, user_id=user_id)
        explicit_block = ""
        if body.explicit_context:
            dummy_scope = RetrievalScope(level="global", project_ids=[])
            _, explicit_block = await resolve_explicit_context(
                db, user_id=user_id, base_scope=dummy_scope, items=body.explicit_context
            )
        if explicit_block:
            system = f"{system}\n\n## Attached context\n{explicit_block}"
        history: list[dict[str, str]] = []
        if conversation_id:
            history = await load_ai_conversation_messages(
                db, conversation_id, max_chars=max_chars
            )
        llm_messages = list(history)
        if not llm_messages or llm_messages[-1].get("content") != body.content:
            llm_messages.append({"role": "user", "content": body.content})
        return _with_concise(system), llm_messages, []

    scope = await resolve_retrieval_scope(project_id, body, db, user_id=user_id)
    if body.retrieval_scope and body.retrieval_scope.include_constituent_topics:
        for tid in await _constituent_topic_ids(db, project_id):
            if tid not in scope.topic_ids:
                scope.topic_ids.append(tid)
    scope, explicit_block = await resolve_explicit_context(
        db, user_id=user_id, base_scope=scope, items=body.explicit_context
    )

    system, hits = await build_project_system(
        db,
        user_id=user_id,
        project_id=project_id,
        user_content=body.content,
        body=body,
        scope=scope,
    )
    if explicit_block:
        system = f"{system}\n\n## Attached context\n{explicit_block}"

    history: list[dict[str, str]] = []
    if thread_history:
        history = await load_thread_messages(
            db,
            project_id=project_id,
            topic_node_id=body.topic_node_id,
            thread_session_id=thread_session_id,
            max_chars=max_chars,
        )
    elif conversation_id:
        history = await load_ai_conversation_messages(
            db, conversation_id, max_chars=max_chars
        )

    llm_messages = list(history)
    if not llm_messages or llm_messages[-1].get("content") != body.content:
        llm_messages.append({"role": "user", "content": body.content})
    return _with_concise(system), llm_messages, hits
