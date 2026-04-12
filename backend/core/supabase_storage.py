"""Supabase Storage helper for project attachments.

Uses the existing ``supabase_admin`` client (service-role key). We store
attachments in a single bucket named ``project-attachments``. Files live under:

    <client_org_id>/<project_id>/<task_id>/<uuid>-<filename>

The service role key is required — without it, all helpers raise
``RuntimeError`` at call time (not import time, so the module is still
importable in environments without Supabase configured).
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from core.supabase_admin import get_supabase_admin

BUCKET = "project-attachments"

logger = logging.getLogger("uvicorn.error")

_SANITIZE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize_filename(name: str) -> str:
    cleaned = _SANITIZE_RE.sub("-", (name or "file").strip()) or "file"
    return cleaned[:120]


def build_storage_path(
    *,
    client_org_id: int,
    project_id: int,
    task_id: int,
    file_name: str,
) -> str:
    token = uuid.uuid4().hex[:12]
    safe = _sanitize_filename(file_name)
    return f"{client_org_id}/{project_id}/{task_id}/{token}-{safe}"


def ensure_bucket() -> None:
    """Create the bucket on startup if it doesn't exist. Non-fatal on error."""
    try:
        client = get_supabase_admin()
    except Exception as exc:  # noqa: BLE001
        logger.info("supabase_storage: service role not configured, bucket check skipped (%s)", exc)
        return
    try:
        try:
            client.storage.get_bucket(BUCKET)
            return
        except Exception:
            pass
        client.storage.create_bucket(
            BUCKET,
            options={"public": False},
        )
        logger.info("supabase_storage: created bucket %s", BUCKET)
    except Exception as exc:  # noqa: BLE001
        logger.warning("supabase_storage: ensure_bucket failed: %s", exc)


def create_upload_signed_url(storage_path: str, expires_in: int = 300) -> dict[str, Any]:
    """Return a signed upload URL the browser can PUT the file to.

    The returned dict contains at least ``signed_url`` and ``path``. Raises
    ``HTTPException(503)`` if Supabase is not configured.
    """
    from fastapi import HTTPException

    try:
        client = get_supabase_admin()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail="Attachment storage is not configured. Contact your administrator.",
        ) from exc

    try:
        response = client.storage.from_(BUCKET).create_signed_upload_url(storage_path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Storage upload-url error: {exc}") from exc

    # supabase-py v2 returns a dict with keys: signedUrl, token, path
    signed_url = (
        response.get("signed_url")
        or response.get("signedUrl")
        or response.get("signedURL")
    )
    if not signed_url:
        raise HTTPException(status_code=503, detail="Storage did not return a signed upload URL.")
    return {
        "signed_url": signed_url,
        "token": response.get("token"),
        "path": response.get("path") or storage_path,
        "expires_in": expires_in,
    }


def create_download_signed_url(storage_path: str, expires_in: int = 60) -> str:
    from fastapi import HTTPException

    try:
        client = get_supabase_admin()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail="Attachment storage is not configured.",
        ) from exc

    try:
        response = client.storage.from_(BUCKET).create_signed_url(storage_path, expires_in)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Storage download-url error: {exc}") from exc

    url = (
        response.get("signed_url")
        or response.get("signedUrl")
        or response.get("signedURL")
    )
    if not url:
        raise HTTPException(status_code=503, detail="Storage did not return a signed URL.")
    return url


def delete_object(storage_path: str) -> None:
    try:
        client = get_supabase_admin()
    except Exception as exc:  # noqa: BLE001
        logger.warning("supabase_storage: cannot delete, service role missing: %s", exc)
        return
    try:
        client.storage.from_(BUCKET).remove([storage_path])
    except Exception as exc:  # noqa: BLE001
        logger.warning("supabase_storage: remove failed for %s: %s", storage_path, exc)
