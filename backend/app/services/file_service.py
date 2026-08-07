"""MinIO file storage helpers."""

from __future__ import annotations

import io
from datetime import timedelta
from uuid import UUID, uuid4

from minio import Minio

from app.config import settings

_client: Minio | None = None


def get_minio() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_url,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False,
        )
    return _client


def object_key(project_id: UUID, file_id: UUID, filename: str) -> str:
    return f"projects/{project_id}/{file_id}/{filename}"


def user_capture_object_key(
    user_id: UUID, session_id: UUID, asset_id: UUID, filename: str
) -> str:
    return f"users/{user_id}/capture/{session_id}/{asset_id}/{filename}"


def ensure_bucket(bucket: str = "laed") -> None:
    client = get_minio()
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)


def upload_bytes(
    project_id: UUID,
    file_id: UUID,
    filename: str,
    data: bytes,
    content_type: str | None,
    *,
    bucket: str = "laed",
) -> str:
    ensure_bucket(bucket)
    key = object_key(project_id, file_id, filename)
    client = get_minio()
    client.put_object(
        bucket,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type or "application/octet-stream",
    )
    return key


def download_bytes(minio_key: str, *, bucket: str = "laed") -> bytes:
    client = get_minio()
    response = client.get_object(bucket, minio_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def presigned_get_url(minio_key: str, *, bucket: str = "laed", expires_hours: int = 1) -> str:
    client = get_minio()
    return client.presigned_get_object(
        bucket,
        minio_key,
        expires=timedelta(hours=expires_hours),
    )


def new_file_id() -> UUID:
    return uuid4()


def upload_user_capture_bytes(
    user_id: UUID,
    session_id: UUID,
    asset_id: UUID,
    filename: str,
    data: bytes,
    content_type: str | None,
    *,
    bucket: str = "laed",
) -> str:
    ensure_bucket(bucket)
    key = user_capture_object_key(user_id, session_id, asset_id, filename)
    client = get_minio()
    client.put_object(
        bucket,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type or "application/octet-stream",
    )
    return key
