from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from core.auth import get_request_user
from core.modules import modules_to_csv, csv_to_modules
from database.connection import get_db
from database.models import (
    ClientWorkspaceAccount,
    Subscription,
    TeamMember,
    TeamMemberStatus,
    ClientOrg,
)
from database.schemas import (
    MyAccessOut,
    TeamListOut,
    TeamMemberInviteIn,
    TeamMemberOut,
    TeamMemberUpdateIn,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/team", tags=["Team"])


# ── Helpers ──────────────────────────────────────────

def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _require_owner(request: Request, db: Session) -> tuple[ClientWorkspaceAccount, int]:
    """Ensure the caller is a workspace owner and return (account, client_org_id)."""
    user = get_request_user(request)
    account = (
        db.query(ClientWorkspaceAccount)
        .filter(ClientWorkspaceAccount.user_id == user.user_id)
        .first()
    )
    if not account or not account.client_org_id:
        raise HTTPException(status_code=403, detail="Only workspace owners can manage team members.")
    return account, account.client_org_id


def _count_active_members(db: Session, org_id: int) -> int:
    return (
        db.query(TeamMember)
        .filter(
            TeamMember.client_org_id == org_id,
            TeamMember.status.in_([TeamMemberStatus.invited, TeamMemberStatus.active]),
        )
        .count()
    )


def _get_seat_limit(db: Session, org_id: int) -> int:
    sub = db.query(Subscription).filter(Subscription.client_id == org_id).first()
    return sub.seats if sub and sub.seats else 10


def _serialize_member(member: TeamMember) -> dict:
    data = {c.name: getattr(member, c.name) for c in member.__table__.columns}
    data["allowed_modules"] = csv_to_modules(member.allowed_modules or "dashboard")
    data["status"] = member.status.value if hasattr(member.status, "value") else str(member.status)
    return data


# ── Endpoints ────────────────────────────────────────

@router.post("/invite", response_model=TeamMemberOut)
def invite_team_member(
    body: TeamMemberInviteIn,
    request: Request,
    db: Session = Depends(get_db),
):
    account, org_id = _require_owner(request, db)
    user = get_request_user(request)

    # Seat limit check
    seat_limit = _get_seat_limit(db, org_id)
    active_count = _count_active_members(db, org_id)
    if active_count + 1 >= seat_limit:
        raise HTTPException(status_code=409, detail=f"Seat limit reached ({seat_limit}). Upgrade your plan for more seats.")

    # Duplicate check
    existing = (
        db.query(TeamMember)
        .filter(
            TeamMember.client_org_id == org_id,
            TeamMember.email == body.email.strip().lower(),
            TeamMember.status.in_([TeamMemberStatus.invited, TeamMemberStatus.active]),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="This email is already a team member.")

    # Validate modules
    try:
        modules_csv = modules_to_csv(body.allowed_modules)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Create TeamMember record
    member = TeamMember(
        client_org_id=org_id,
        email=body.email.strip().lower(),
        full_name=body.full_name.strip(),
        position_title=body.position_title.strip() if body.position_title else None,
        allowed_modules=modules_csv,
        status=TeamMemberStatus.invited,
        invited_by_user_id=user.user_id,
        invited_at=_utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    # Send Supabase invite email
    try:
        from core.supabase_admin import get_supabase_admin
        supabase = get_supabase_admin()
        org = db.query(ClientOrg).filter(ClientOrg.id == org_id).first()
        supabase.auth.admin.invite_user_by_email(
            body.email.strip().lower(),
            options={
                "data": {
                    "role": "member",
                    "org_id": org_id,
                    "full_name": body.full_name.strip(),
                    "invited_by": user.user_id,
                    "business_name": org.name if org else account.business_name,
                },
            },
        )
    except Exception as exc:
        logger.warning("Failed to send invite email for %s: %s", body.email, exc)
        # Don't fail the whole request — member row is created, invite can be resent

    return _serialize_member(member)


@router.get("/members", response_model=TeamListOut)
def list_team_members(
    request: Request,
    db: Session = Depends(get_db),
):
    account, org_id = _require_owner(request, db)
    members = (
        db.query(TeamMember)
        .filter(
            TeamMember.client_org_id == org_id,
            TeamMember.status != TeamMemberStatus.removed,
        )
        .order_by(TeamMember.created_at.desc())
        .all()
    )
    seat_limit = _get_seat_limit(db, org_id)
    active_count = _count_active_members(db, org_id)
    return TeamListOut(
        members=[_serialize_member(m) for m in members],
        total=len(members),
        seats_used=active_count,
        seats_limit=seat_limit,
    )


@router.patch("/members/{member_id}", response_model=TeamMemberOut)
def update_team_member(
    member_id: int,
    body: TeamMemberUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    _, org_id = _require_owner(request, db)
    member = (
        db.query(TeamMember)
        .filter(TeamMember.id == member_id, TeamMember.client_org_id == org_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found.")

    if body.full_name is not None:
        member.full_name = body.full_name.strip()
    if body.position_title is not None:
        member.position_title = body.position_title.strip() or None
    if body.allowed_modules is not None:
        try:
            member.allowed_modules = modules_to_csv(body.allowed_modules)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    db.commit()
    db.refresh(member)
    return _serialize_member(member)


@router.delete("/members/{member_id}")
def remove_team_member(
    member_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    _, org_id = _require_owner(request, db)
    member = (
        db.query(TeamMember)
        .filter(TeamMember.id == member_id, TeamMember.client_org_id == org_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found.")
    member.status = TeamMemberStatus.removed
    db.commit()
    return {"ok": True}


@router.post("/members/{member_id}/resend-invite")
def resend_invite(
    member_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    account, org_id = _require_owner(request, db)
    member = (
        db.query(TeamMember)
        .filter(
            TeamMember.id == member_id,
            TeamMember.client_org_id == org_id,
            TeamMember.status == TeamMemberStatus.invited,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Pending invite not found.")

    try:
        from core.supabase_admin import get_supabase_admin
        supabase = get_supabase_admin()
        org = db.query(ClientOrg).filter(ClientOrg.id == org_id).first()
        supabase.auth.admin.invite_user_by_email(
            member.email,
            options={
                "data": {
                    "role": "member",
                    "org_id": org_id,
                    "full_name": member.full_name,
                    "business_name": org.name if org else account.business_name,
                },
            },
        )
    except Exception as exc:
        logger.warning("Failed to resend invite for %s: %s", member.email, exc)
        raise HTTPException(status_code=502, detail="Failed to send invite email. Please try again.")

    return {"ok": True, "message": "Invite email resent."}


@router.post("/activate")
def activate_team_member(
    request: Request,
    db: Session = Depends(get_db),
):
    """Called by a newly invited member after accepting the invite to link their user_id."""
    user = get_request_user(request)
    email = (user.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Cannot determine your email address.")

    member = (
        db.query(TeamMember)
        .filter(
            TeamMember.email == email,
            TeamMember.status == TeamMemberStatus.invited,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="No pending invite found for your email.")

    member.user_id = user.user_id
    member.status = TeamMemberStatus.active
    member.joined_at = _utcnow()
    db.commit()
    db.refresh(member)

    return {
        "ok": True,
        "role": "member",
        "allowed_modules": csv_to_modules(member.allowed_modules),
        "org_id": member.client_org_id,
    }


@router.get("/my-access", response_model=MyAccessOut)
def get_my_access(
    request: Request,
    db: Session = Depends(get_db),
):
    user = get_request_user(request)

    # Check if owner
    account = (
        db.query(ClientWorkspaceAccount)
        .filter(ClientWorkspaceAccount.user_id == user.user_id)
        .first()
    )
    if account:
        org = db.query(ClientOrg).filter(ClientOrg.id == account.client_org_id).first() if account.client_org_id else None
        sub = db.query(Subscription).filter(Subscription.client_id == account.client_org_id).first() if account.client_org_id else None
        all_modules = csv_to_modules(sub.modules) if sub and sub.modules else []
        return MyAccessOut(
            role="owner",
            allowed_modules=all_modules,
            workspace_id=account.workspace_id,
            business_name=org.name if org else account.business_name,
        )

    # Check if team member
    member = (
        db.query(TeamMember)
        .filter(
            TeamMember.user_id == user.user_id,
            TeamMember.status == TeamMemberStatus.active,
        )
        .first()
    )
    if member:
        org = db.query(ClientOrg).filter(ClientOrg.id == member.client_org_id).first()
        return MyAccessOut(
            role="member",
            allowed_modules=csv_to_modules(member.allowed_modules),
            workspace_id=None,
            business_name=org.name if org else None,
        )

    raise HTTPException(status_code=404, detail="No workspace access found.")
