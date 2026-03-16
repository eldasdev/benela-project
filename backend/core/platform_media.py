from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path

PLATFORM_MEDIA_ROOT = Path(
    os.getenv(
        "PLATFORM_MEDIA_DIR",
        str(Path(__file__).resolve().parent.parent / "uploads" / "platform_media"),
    )
)
PLATFORM_IMAGE_ROOT = PLATFORM_MEDIA_ROOT / "images"
MAX_PLATFORM_IMAGE_UPLOAD_BYTES = int(os.getenv("PLATFORM_MAX_IMAGE_UPLOAD_BYTES", str(12 * 1024 * 1024)))

PLATFORM_IMAGE_ROOT.mkdir(parents=True, exist_ok=True)


def safe_platform_media_segment(value: str | None, fallback: str = "general") -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    return cleaned[:80] if cleaned else fallback


def build_platform_image_relative_path(asset_type: str, file_name: str, now: datetime | None = None) -> Path:
    current = now or datetime.utcnow()
    asset = safe_platform_media_segment(asset_type, "general")
    return Path(asset) / current.strftime("%Y") / current.strftime("%m") / file_name


def resolve_platform_image_path(file_path: str) -> Path | None:
    candidate = (PLATFORM_IMAGE_ROOT / file_path).resolve()
    root = PLATFORM_IMAGE_ROOT.resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def build_platform_image_public_url(relative_path: Path) -> str:
    return f"/api/platform/media/images/{relative_path.as_posix()}"
