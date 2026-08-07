"""Cascade deletes between private LAED conversations and project thread sessions."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation, AIMessage
from app.models.message import Message
from app.models.thread_session import ThreadSession


async def delete_thread_session_tree(
    db: AsyncSession,
    *,
    project_id: UUID,
    session_id: UUID,
) -> None:
    conv_ids = (
        await db.execute(
            select(AIConversation.id).where(
                AIConversation.linked_thread_session_id == session_id,
                AIConversation.project_id == project_id,
            )
        )
    ).scalars().all()
    for conv_id in conv_ids:
        await delete_ai_conversation_tree(db, conv_id=conv_id, delete_linked_thread=False)

    await db.execute(
        sql_delete(Message).where(Message.thread_session_id == session_id)
    )
    session = await db.get(ThreadSession, session_id)
    if session is not None:
        await db.delete(session)


async def delete_ai_conversation_tree(
    db: AsyncSession,
    *,
    conv_id: UUID,
    delete_linked_thread: bool = True,
) -> None:
    conv = await db.get(AIConversation, conv_id)
    if conv is None:
        return

    linked_session_id = conv.linked_thread_session_id
    await db.execute(sql_delete(AIMessage).where(AIMessage.conversation_id == conv.id))
    await db.delete(conv)

    if (
        delete_linked_thread
        and linked_session_id is not None
        and conv.project_id is not None
    ):
        await delete_thread_session_tree(
            db,
            project_id=conv.project_id,
            session_id=linked_session_id,
        )
