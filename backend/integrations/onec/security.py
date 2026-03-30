from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from core.config import settings


@lru_cache(maxsize=1)
def get_fernet() -> Fernet:
    key = (settings.ONEC_ENCRYPTION_KEY or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="ONEC_ENCRYPTION_KEY is not configured.")
    try:
        return Fernet(key.encode("utf-8"))
    except Exception as exc:  # pragma: no cover - invalid env path
        raise HTTPException(status_code=503, detail=f"ONEC_ENCRYPTION_KEY is invalid: {exc}")


def encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    return get_fernet().encrypt(text.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return get_fernet().decrypt(text.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        raise HTTPException(status_code=500, detail="Stored 1C credentials could not be decrypted.")


def mask_secret(value: str | None, *, reveal_last: int = 4) -> str | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    if len(raw) <= reveal_last:
        return "*" * len(raw)
    return f"{'*' * max(3, len(raw) - reveal_last)}{raw[-reveal_last:]}"
