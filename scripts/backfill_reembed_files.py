#!/usr/bin/env python3
"""Reset ingestion_status and re-enqueue ingest_file for all project files.

Canonical copy for the Docker image: backend/scripts/backfill_reembed_files.py
(baked in at /app/scripts/). Keep these two files in sync.

Run inside the app container after switching EMBEDDING_MODEL / EMBEDDING_DIM:

  docker compose exec -T app python /app/scripts/backfill_reembed_files.py

If the image predates /app/scripts/:

  docker compose cp scripts/backfill_reembed_files.py app:/tmp/backfill_reembed_files.py
  docker compose exec -T -e PYTHONPATH=/app app python /tmp/backfill_reembed_files.py
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select, update

from app.models.base import async_session
from app.models.file import File
from app.services.ingestion import ingest_file


async def main() -> int:
    async with async_session() as db:
        result = await db.execute(select(File.id))
        file_ids = [row[0] for row in result.all()]
        if not file_ids:
            print("No files to re-embed")
            return 0
        await db.execute(
            update(File)
            .where(File.id.in_(file_ids))
            .values(ingestion_status="pending")
        )
        await db.commit()

    for fid in file_ids:
        ingest_file.delay(str(fid))
        print(f"enqueued ingest_file {fid}")

    print(f"Re-enqueued {len(file_ids)} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
