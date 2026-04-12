"""Project workspace/RBAC helpers.

Resolves the caller's ``client_org_id`` (owner via ClientWorkspaceAccount or
team member via TeamMember) and enforces project-level access:

- ``resolve_project_context`` — returns (client_org_id, is_owner) or 403
- ``require_project_member`` — loads a project and confirms it belongs to the
  caller's org
- ``require_project_owner`` — stricter: must also be the project's
  ``owner_user_id`` (or the workspace owner)
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database.models import (
    ClientWorkspaceAccount,
    Project,
    TeamMember,
    TeamMemberStatus,
)


def resolve_project_context(db: Session, user_id: str) -> tuple[int, bool]:
    """Return ``(client_org_id, is_workspace_owner)`` for the caller.

    Raises 403 if the user has no workspace affiliation.
    """
    account = (
        db.query(ClientWorkspaceAccount)
        .filter(ClientWorkspaceAccount.user_id == user_id)
        .first()
    )
    if account and account.client_org_id:
        return account.client_org_id, True

    member = (
        db.query(TeamMember)
        .filter(
            TeamMember.user_id == user_id,
            TeamMember.status == TeamMemberStatus.active,
        )
        .first()
    )
    if member and member.client_org_id:
        return member.client_org_id, False

    raise HTTPException(
        status_code=403,
        detail="You must belong to a workspace to use the Projects module.",
    )


def require_project_member(
    db: Session, project_id: int, user_id: str
) -> tuple[Project, int, bool]:
    """Load a project the caller is allowed to see.

    Returns ``(project, client_org_id, is_workspace_owner)``.
    Raises 404 if the project is in a different org (we don't leak existence).
    """
    client_org_id, is_ws_owner = resolve_project_context(db, user_id)
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.client_org_id == client_org_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project, client_org_id, is_ws_owner


def require_project_owner(
    db: Session, project_id: int, user_id: str
) -> tuple[Project, int]:
    """Load a project and require the caller to be its owner.

    A workspace owner is always considered an owner. A team member is an
    owner only if ``project.owner_user_id == user_id``.
    """
    project, client_org_id, is_ws_owner = require_project_member(db, project_id, user_id)
    if not is_ws_owner and project.owner_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the project owner can perform this action.",
        )
    return project, client_org_id


def is_project_owner(project: Project, user_id: str, is_ws_owner: bool) -> bool:
    return is_ws_owner or project.owner_user_id == user_id
