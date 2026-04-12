from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from core.auth import AuthenticatedUser, resolve_request_user
from core.modules import csv_to_modules
from database.connection import get_db
from database.models import ClientWorkspaceAccount, TeamMember, TeamMemberStatus


MODULE_ROUTER_MAP = {
    "/finance": "finance",
    "/hr": "hr",
    "/sales": "sales",
    "/support": "support",
    "/legal": "legal",
    "/marketing": "marketing",
    "/supply-chain": "supply_chain",
    "/supply_chain": "supply_chain",
    "/procurement": "procurement",
    "/insights": "insights",
    "/projects": "projects",
    "/dashboard": "dashboard",
}


def _resolve_module_from_path(path: str) -> str | None:
    clean = path.lower()
    if clean.startswith("/api"):
        clean = clean[4:]
    for prefix, module in MODULE_ROUTER_MAP.items():
        if clean.startswith(prefix):
            return module
    return None


def _get_user_allowed_modules(db: Session, user: AuthenticatedUser) -> set[str] | None:
    """Returns allowed modules set, or None if user has unrestricted access (owner)."""
    account = (
        db.query(ClientWorkspaceAccount)
        .filter(ClientWorkspaceAccount.user_id == user.user_id)
        .first()
    )
    if account:
        return None  # Owner — full access

    member = (
        db.query(TeamMember)
        .filter(
            TeamMember.user_id == user.user_id,
            TeamMember.status == TeamMemberStatus.active,
        )
        .first()
    )
    if not member:
        return set()  # No access

    modules_str = member.allowed_modules or "dashboard"
    return {m.strip().lower() for m in modules_str.split(",") if m.strip()}


def require_module_access(
    request: Request,
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    user = resolve_request_user(request)

    if user.is_admin:
        return user

    module = _resolve_module_from_path(request.url.path)
    if module is None:
        return user

    allowed = _get_user_allowed_modules(db, user)
    if allowed is None:
        return user  # Owner

    if module not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have access to the {module} module.",
        )
    return user
