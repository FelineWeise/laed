"""Apply file privacy + grants and trigger RAG ingest when shared."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File
from app.models.file_grant import (
    clear_file_grants,
    list_grant_user_ids,
    replace_file_grants,
)
from app.services.ingestion import ingest_file


async def apply_file_visibility(
    db: AsyncSession,
    file_row: File,
    *,
    is_private: bool,
    share_with_user_ids: list[UUID] | None,
    trigger_ingest: bool = True,
) -> str:
    """Set is_private + grants. Returns visibility_scope string.

    share_with_user_ids:
      - ignored when is_private
      - None or [] when shared → everyone (no grant rows)
      - non-empty → restricted to those users (+ owner via uploaded_by)
    """
    file_row.is_private = is_private
    if is_private:
        await clear_file_grants(db, file_row.id)
        scope = "private"
    else:
        ids = list(share_with_user_ids or [])
        # Never require the uploader in grants; they always have access.
        if file_row.uploaded_by is not None:
            ids = [u for u in ids if u != file_row.uploaded_by]
        if ids:
            await replace_file_grants(db, file_row.id, ids)
            scope = "restricted"
        else:
            await clear_file_grants(db, file_row.id)
            scope = "project"

    if trigger_ingest and not is_private:
        file_row.ingestion_status = "pending"
        await db.flush()
        ingest_file.delay(str(file_row.id))
    elif is_private and trigger_ingest:
        # Re-ingest so chunks flip to private scope (owner-only RAG).
        file_row.ingestion_status = "pending"
        await db.flush()
        ingest_file.delay(str(file_row.id))

    return scope


async def grant_user_ids_for_ingest(db: AsyncSession, file_id: UUID) -> list[str]:
    ids = await list_grant_user_ids(db, file_id)
    return [str(u) for u in ids]
