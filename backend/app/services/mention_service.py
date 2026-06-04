"""Persist and query message @mentions."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.access import has_project_access
from app.models.message import Message as MessageModel
from app.models.message_mention import MessageMention
from app.models.project import Project, ProjectMember
from app.models.thread_session import ThreadSession
from app.models.user import User
from app.services.mention_parse import MentionableMember, parse_user_mentions


async def load_project_members_for_mentions(
    db: AsyncSession,
    project_id: UUID,
) -> list[MentionableMember]:
    result = await db.execute(
        select(ProjectMember, User.display_name, User.email)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
    )
    out: list[MentionableMember] = []
    for _pm, name, email in result.all():
        out.append(
            MentionableMember(
                user_id=_pm.user_id,
                display_name=name or "",
                email=email or "",
            )
        )
    return out


async def validate_mention_user_ids(
    db: AsyncSession,
    project_id: UUID,
    user_ids: list[UUID],
) -> list[UUID]:
    valid: list[UUID] = []
    for uid in user_ids:
        if await has_project_access(db, project_id, uid):
            valid.append(uid)
    return valid


async def save_message_mentions(
    db: AsyncSession,
    *,
    message_id: UUID,
    mentioned_user_ids: list[UUID],
) -> list[dict[str, str]]:
    snapshots: list[dict[str, str]] = []
    for uid in mentioned_user_ids:
        user = await db.get(User, uid)
        if user is None:
            continue
        row = MessageMention(
            message_id=message_id,
            mentioned_user_id=uid,
        )
        db.add(row)
        snapshots.append(
            {
                "user_id": str(uid),
                "display_name": user.display_name or user.email,
            }
        )
    if snapshots:
        await db.commit()
    return snapshots


async def mentions_for_message_ids(
    db: AsyncSession,
    message_ids: list[UUID],
) -> dict[str, list[dict[str, str]]]:
    if not message_ids:
        return {}
    result = await db.execute(
        select(MessageMention, User.display_name, User.email)
        .join(User, User.id == MessageMention.mentioned_user_id)
        .where(MessageMention.message_id.in_(message_ids))
    )
    out: dict[str, list[dict[str, str]]] = {}
    for mention, name, email in result.all():
        mid = str(mention.message_id)
        out.setdefault(mid, []).append(
            {
                "user_id": str(mention.mentioned_user_id),
                "display_name": name or email or "User",
            }
        )
    return out


async def resolve_mentions_for_send(
    db: AsyncSession,
    *,
    project_id: UUID,
    content: str,
    explicit_ids: list[UUID] | None,
) -> list[UUID]:
    members = await load_project_members_for_mentions(db, project_id)
    parsed = parse_user_mentions(content, members, extra_user_ids=explicit_ids)
    return await validate_mention_user_ids(db, project_id, parsed)


async def validate_reply_to(
    db: AsyncSession,
    *,
    project_id: UUID,
    thread_session_id: UUID,
    reply_to_id: UUID | None,
) -> MessageModel | None:
    if reply_to_id is None:
        return None
    parent = await db.get(MessageModel, reply_to_id)
    if not parent or parent.project_id != project_id:
        raise ValueError("Reply target not found")
    if parent.thread_session_id != thread_session_id:
        raise ValueError("Reply target is in a different thread")
    return parent


def reply_preview(msg: MessageModel, sender_label: str) -> dict[str, str]:
    text = msg.content.strip()
    if len(text) > 120:
        text = text[:120] + "…"
    return {
        "id": str(msg.id),
        "content": text,
        "sender_label": sender_label,
    }


async def list_inbox_mentions(
    db: AsyncSession,
    *,
    user_id: UUID,
    unread_only: bool = False,
    limit: int = 50,
) -> list:
    from app.schemas.mentions import InboxMentionResponse
    stmt = (
        select(
            MessageMention,
            MessageModel,
            User.display_name,
            User.email,
            Project.name,
            ThreadSession.title,
        )
        .join(MessageModel, MessageModel.id == MessageMention.message_id)
        .join(User, User.id == MessageModel.user_id)
        .join(Project, Project.id == MessageModel.project_id)
        .outerjoin(ThreadSession, ThreadSession.id == MessageModel.thread_session_id)
        .where(MessageMention.mentioned_user_id == user_id)
        .order_by(MessageMention.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(MessageMention.read_at.is_(None))
    result = await db.execute(stmt)
    rows: list[InboxMentionResponse] = []
    for mention, msg, sender_name, sender_email, project_name, thread_title in result.all():
        excerpt = msg.content.strip()
        if len(excerpt) > 160:
            excerpt = excerpt[:160] + "…"
        rows.append(
            InboxMentionResponse(
                id=mention.id,
                message_id=msg.id,
                project_id=msg.project_id,
                project_name=project_name or "Project",
                topic_node_id=msg.topic_node_id,
                thread_session_id=msg.thread_session_id,
                thread_title=thread_title or "Thread",
                sender_label=sender_name or sender_email or "Someone",
                excerpt=excerpt,
                created_at=mention.created_at,
                read_at=mention.read_at,
            )
        )
    return rows


async def mark_mention_read(
    db: AsyncSession,
    *,
    mention_id: UUID,
    user_id: UUID,
) -> bool:
    row = await db.get(MessageMention, mention_id)
    if not row or row.mentioned_user_id != user_id:
        return False
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        await db.commit()
    return True


async def mark_all_mentions_read(db: AsyncSession, *, user_id: UUID) -> int:
    result = await db.execute(
        select(MessageMention).where(
            MessageMention.mentioned_user_id == user_id,
            MessageMention.read_at.is_(None),
        )
    )
    rows = list(result.scalars().all())
    now = datetime.now(timezone.utc)
    for row in rows:
        row.read_at = now
    if rows:
        await db.commit()
    return len(rows)
