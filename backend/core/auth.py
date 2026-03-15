from __future__ import annotations

from functools import lru_cache
from typing import Any

import jwt
from fastapi import HTTPException, Request, status
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel

from core.config import settings

ADMIN_ROLES = {"admin", "owner", "super_admin"}


class AuthenticatedUser(BaseModel):
    user_id: str
    email: str | None = None
    role: str = "client"
    claims: dict[str, Any]

    @property
    def is_admin(self) -> bool:
        return self.role in ADMIN_ROLES


def _normalize_role(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    return value or "client"


def _supabase_issuer() -> str | None:
    base = (settings.SUPABASE_URL or "").strip().rstrip("/")
    if not base:
        return None
    return f"{base}/auth/v1"


def _supabase_jwks_url() -> str | None:
    configured = (settings.SUPABASE_JWKS_URL or "").strip()
    if configured:
        return configured
    issuer = _supabase_issuer()
    if not issuer:
        return None
    return f"{issuer}/.well-known/jwks.json"


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient | None:
    jwks_url = _supabase_jwks_url()
    if not jwks_url:
        return None
    return PyJWKClient(jwks_url)


def _decode_with_secret(token: str) -> dict[str, Any]:
    if not settings.SUPABASE_JWT_SECRET:
        raise InvalidTokenError("SUPABASE_JWT_SECRET is not configured.")
    return jwt.decode(
        token,
        settings.SUPABASE_JWT_SECRET,
        algorithms=["HS256", "HS384", "HS512"],
        audience=None,
        options={"verify_aud": False},
        issuer=_supabase_issuer(),
    )


def _decode_with_jwks(token: str) -> dict[str, Any]:
    client = _jwks_client()
    if not client:
        raise InvalidTokenError("Supabase JWKS endpoint is not configured.")
    signing_key = client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"],
        audience=None,
        options={"verify_aud": False},
        issuer=_supabase_issuer(),
    )


def _decode_token(token: str) -> dict[str, Any]:
    last_error: Exception | None = None
    for decoder in (_decode_with_secret, _decode_with_jwks):
        try:
            return decoder(token)
        except Exception as exc:  # pragma: no cover - auth backend fallback path
            last_error = exc
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Invalid or expired authentication token. {last_error}",
    )


def _extract_role(claims: dict[str, Any]) -> str:
    user_meta = claims.get("user_metadata") or {}
    app_meta = claims.get("app_metadata") or {}
    return _normalize_role(
        user_meta.get("role")
        or app_meta.get("role")
        or claims.get("role")
    )


def _extract_email(claims: dict[str, Any]) -> str | None:
    for candidate in (
        claims.get("email"),
        (claims.get("user_metadata") or {}).get("email"),
        (claims.get("app_metadata") or {}).get("email"),
    ):
        value = (candidate or "").strip().lower()
        if value:
            return value
    return None


def resolve_request_user(request: Request) -> AuthenticatedUser:
    cached = getattr(request.state, "authenticated_user", None)
    if isinstance(cached, AuthenticatedUser):
        return cached

    auth_header = (request.headers.get("authorization") or "").strip()
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization bearer token is required.",
        )

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization bearer token is required.",
        )

    claims = _decode_token(token)
    user_id = (claims.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject is missing.",
        )

    user = AuthenticatedUser(
        user_id=user_id,
        email=_extract_email(claims),
        role=_extract_role(claims),
        claims=claims,
    )
    request.state.authenticated_user = user
    return user


def require_authenticated_user(request: Request) -> AuthenticatedUser:
    return resolve_request_user(request)


def require_admin_user(request: Request) -> AuthenticatedUser:
    user = resolve_request_user(request)
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access is required.")
    return user


def require_client_user(request: Request) -> AuthenticatedUser:
    user = resolve_request_user(request)
    if user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Client workspace access is required.",
        )
    return user


def get_request_user(request: Request) -> AuthenticatedUser:
    return resolve_request_user(request)


def assert_request_user_matches(
    request: Request,
    *,
    user_id: str | None = None,
    email: str | None = None,
    role: str | None = None,
) -> AuthenticatedUser:
    user = resolve_request_user(request)

    normalized_user_id = (user_id or "").strip()
    if normalized_user_id and normalized_user_id != user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User identity mismatch.")

    normalized_email = (email or "").strip().lower()
    if normalized_email and normalized_email != (user.email or "").strip().lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User email mismatch.")

    normalized_role = _normalize_role(role)
    if role is not None and normalized_role != user.role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User role mismatch.")

    return user
