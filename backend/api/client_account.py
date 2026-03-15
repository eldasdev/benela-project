from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.auth import assert_request_user_matches
from database import models
from database.connection import get_db

router = APIRouter(prefix="/client-account", tags=["Client Account"])

TRIAL_DAYS_DEFAULT = int(os.getenv("CLIENT_TRIAL_DAYS", "7"))
MAX_DOC_UPLOAD_BYTES = int(os.getenv("CLIENT_MAX_DOC_UPLOAD_BYTES", str(20 * 1024 * 1024)))
BUSINESS_DOCS_ROOT = Path(
    os.getenv(
        "CLIENT_BUSINESS_DOCS_DIR",
        str(Path(__file__).resolve().parent.parent / "uploads" / "client_business_docs"),
    )
)
BUSINESS_DOCS_ROOT.mkdir(parents=True, exist_ok=True)
BLOCKED_CLIENT_EMAIL_DOMAINS = {
    domain.strip().lower()
    for domain in os.getenv("CLIENT_ACCOUNT_BLOCKED_EMAIL_DOMAINS", "benela.ai,benela.dev").split(",")
    if domain.strip()
}

PLAN_CONFIG: dict[str, dict[str, int | float]] = {
    "starter": {"price_monthly": 49.0, "seats": 10},
    "pro": {"price_monthly": 149.0, "seats": 50},
    "enterprise": {"price_monthly": 499.0, "seats": 500},
}


class ClientOnboardingIn(BaseModel):
    user_id: str
    user_email: Optional[str] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None

    business_name: str
    registration_number: Optional[str] = None
    industry: Optional[str] = None
    country: str
    city: Optional[str] = None
    address: Optional[str] = None
    employee_count: Optional[int] = Field(default=None, ge=1)

    plan_tier: str = "starter"


class ClientAccountPatch(BaseModel):
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    business_name: Optional[str] = None
    registration_number: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    employee_count: Optional[int] = Field(default=None, ge=1)
    plan_tier: Optional[str] = None
    onboarding_completed: Optional[bool] = None


class ClientAccountOut(BaseModel):
    id: int
    user_id: str
    user_email: Optional[str]
    workspace_id: str

    business_name: str
    business_slug: str
    registration_number: Optional[str]
    industry: Optional[str]
    country: Optional[str]
    city: Optional[str]
    address: Optional[str]
    employee_count: Optional[int]
    owner_name: Optional[str]
    owner_phone: Optional[str]

    plan_tier: str
    payment_required: bool
    onboarding_completed: bool
    duplicate_of_account_id: Optional[int]

    trial_started_at: Optional[datetime]
    trial_ends_at: Optional[datetime]
    trial_seconds_total: int
    trial_seconds_remaining: int
    trial_progress_percent: float
    documents_uploaded_count: int
    missing_setup_fields: list[str]
    setup_progress_percent: float

    created_at: datetime
    updated_at: datetime


class ClientSidebarOut(BaseModel):
    exists: bool
    workspace_id: Optional[str] = None
    business_name: Optional[str] = None
    owner_name: Optional[str] = None
    plan_tier: Optional[str] = None
    payment_required: bool = False
    onboarding_completed: bool = False
    trial_started_at: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    trial_seconds_total: int = 0
    trial_seconds_remaining: int = 0
    trial_progress_percent: float = 0.0
    documents_uploaded_count: int = 0
    missing_setup_fields: list[str] = []
    setup_progress_percent: float = 0.0
    trial_label: str = ""


class ClientPlatformReportIn(BaseModel):
    user_id: str
    user_email: Optional[str] = None
    title: str
    message: str


class ClientPlatformReportOut(BaseModel):
    id: int
    workspace_id: Optional[str]
    title: str
    message: str
    status: str
    created_at: datetime


class ClientBusinessDocumentOut(BaseModel):
    id: int
    file_name: str
    mime_type: Optional[str]
    size_bytes: int
    document_type: str
    verification_status: str
    created_at: datetime
    download_url: str


class TrialSummaryOut(BaseModel):
    trial_seconds_total: int
    trial_seconds_remaining: int
    trial_progress_percent: float
    trial_label: str
    payment_required: bool
    trial_started_at: Optional[datetime]
    trial_ends_at: Optional[datetime]


class _TrialMeta(BaseModel):
    total_seconds: int
    remaining_seconds: int
    progress_percent: float
    label: str


class _SetupMeta(BaseModel):
    documents_uploaded_count: int
    missing_fields: list[str]
    progress_percent: float


def _normalize_plan_tier(raw: str | None, fallback: str = "starter") -> str:
    value = (raw or fallback).strip().lower()
    if value == "trial":
        raise HTTPException(status_code=400, detail="Free/trial plan is not available. Choose starter, pro, or enterprise.")
    if value not in PLAN_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid plan_tier. Choose starter, pro, or enterprise.")
    return value


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    return cleaned[:120] if cleaned else "workspace"


def _normalize_token(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _is_internal_platform_email(value: str | None) -> bool:
    normalized = (value or "").strip().lower()
    if "@" not in normalized:
        return False
    domain = normalized.rsplit("@", 1)[-1]
    return domain in BLOCKED_CLIENT_EMAIL_DOMAINS


def _assert_client_boundary(user_email: str | None) -> None:
    if _is_internal_platform_email(user_email):
        raise HTTPException(
            status_code=403,
            detail="Internal admin accounts cannot access client workspace account flows.",
        )


def _build_business_fingerprint(
    business_name: str,
    country: str | None,
    city: str | None,
    registration_number: str | None,
) -> str:
    registration = _normalize_token(registration_number)
    if registration:
        source = f"reg:{registration}"
    else:
        source = "|".join(
            [
                _normalize_token(business_name),
                _normalize_token(country),
                _normalize_token(city),
            ]
        )
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _unique_workspace_id(db: Session, business_slug: str) -> str:
    base = business_slug or "workspace"
    candidate = base
    for _ in range(40):
        exists = (
            db.query(models.ClientWorkspaceAccount.id)
            .filter(models.ClientWorkspaceAccount.workspace_id == candidate)
            .first()
        )
        if not exists:
            return candidate
        candidate = f"{base}-{uuid4().hex[:6]}"
    return f"{base}-{uuid4().hex[:10]}"


def _unique_client_org_slug(db: Session, business_slug: str) -> str:
    base = business_slug or "company"
    candidate = base
    for _ in range(40):
        exists = db.query(models.ClientOrg.id).filter(models.ClientOrg.slug == candidate).first()
        if not exists:
            return candidate
        candidate = f"{base}-{uuid4().hex[:5]}"
    return f"{base}-{uuid4().hex[:10]}"


def _compute_trial_meta(account: models.ClientWorkspaceAccount) -> _TrialMeta:
    start = account.trial_started_at
    end = account.trial_ends_at
    if not start or not end:
        return _TrialMeta(total_seconds=0, remaining_seconds=0, progress_percent=0.0, label="No trial")

    total_seconds = max(0, int((end - start).total_seconds()))
    now_utc = datetime.utcnow()
    remaining_seconds = max(0, int((end - now_utc).total_seconds()))

    progress = 0.0
    if total_seconds > 0:
        progress = min(100.0, max(0.0, ((total_seconds - remaining_seconds) / total_seconds) * 100.0))

    days = remaining_seconds // 86400
    hours = (remaining_seconds % 86400) // 3600
    if remaining_seconds <= 0:
        label = "Trial ended"
    elif days > 0:
        label = f"{days}d {hours}h left"
    else:
        minutes = max(1, (remaining_seconds % 3600) // 60)
        label = f"{hours}h {minutes}m left"

    return _TrialMeta(
        total_seconds=total_seconds,
        remaining_seconds=remaining_seconds,
        progress_percent=round(progress, 2),
        label=label,
    )


def _compute_setup_meta(db: Session, account: models.ClientWorkspaceAccount) -> _SetupMeta:
    docs_count = (
        db.query(models.ClientBusinessDocument.id)
        .filter(models.ClientBusinessDocument.account_id == account.id)
        .count()
    )
    checks = [
        ("business_name", bool((account.business_name or "").strip())),
        ("registration_number", bool((account.registration_number or "").strip())),
        ("country", bool((account.country or "").strip())),
        ("city", bool((account.city or "").strip())),
        ("address", bool((account.address or "").strip())),
        ("owner_name", bool((account.owner_name or "").strip())),
        ("employee_count", bool(account.employee_count and account.employee_count > 0)),
        ("documents", docs_count > 0),
    ]
    completed = sum(1 for _, ok in checks if ok)
    progress = round((completed / len(checks)) * 100.0, 2) if checks else 0.0
    return _SetupMeta(
        documents_uploaded_count=docs_count,
        missing_fields=[field for field, ok in checks if not ok],
        progress_percent=progress,
    )


def _serialize_account(db: Session, account: models.ClientWorkspaceAccount) -> ClientAccountOut:
    trial = _compute_trial_meta(account)
    setup = _compute_setup_meta(db, account)
    return ClientAccountOut(
        id=account.id,
        user_id=account.user_id,
        user_email=account.user_email,
        workspace_id=account.workspace_id,
        business_name=account.business_name,
        business_slug=account.business_slug,
        registration_number=account.registration_number,
        industry=account.industry,
        country=account.country,
        city=account.city,
        address=account.address,
        employee_count=account.employee_count,
        owner_name=account.owner_name,
        owner_phone=account.owner_phone,
        plan_tier=account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier),
        payment_required=bool(account.payment_required),
        onboarding_completed=bool(account.onboarding_completed),
        duplicate_of_account_id=account.duplicate_of_account_id,
        trial_started_at=account.trial_started_at,
        trial_ends_at=account.trial_ends_at,
        trial_seconds_total=trial.total_seconds,
        trial_seconds_remaining=trial.remaining_seconds,
        trial_progress_percent=trial.progress_percent,
        documents_uploaded_count=setup.documents_uploaded_count,
        missing_setup_fields=setup.missing_fields,
        setup_progress_percent=setup.progress_percent,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


def _serialize_doc(account: models.ClientWorkspaceAccount, row: models.ClientBusinessDocument) -> ClientBusinessDocumentOut:
    return ClientBusinessDocumentOut(
        id=row.id,
        file_name=row.file_name,
        mime_type=row.mime_type,
        size_bytes=row.size_bytes,
        document_type=row.document_type,
        verification_status=row.verification_status,
        created_at=row.created_at,
        download_url=f"/api/client-account/documents/{row.id}/download?user_id={account.user_id}",
    )


def _is_business_profile_complete(account: models.ClientWorkspaceAccount) -> bool:
    has_required_text = all(
        [
            bool((account.business_name or "").strip()),
            bool((account.country or "").strip()),
            bool((account.city or "").strip()),
            bool((account.address or "").strip()),
            bool((account.registration_number or "").strip()),
            bool((account.owner_name or "").strip()),
        ]
    )
    has_employees = bool(account.employee_count and account.employee_count > 0)
    return has_required_text and has_employees


def _recompute_onboarding_completion(db: Session, account: models.ClientWorkspaceAccount) -> None:
    setup = _compute_setup_meta(db, account)
    account.onboarding_completed = _is_business_profile_complete(account) and setup.documents_uploaded_count > 0


def _find_account_by_user(db: Session, user_id: str) -> models.ClientWorkspaceAccount | None:
    return (
        db.query(models.ClientWorkspaceAccount)
        .filter(models.ClientWorkspaceAccount.user_id == user_id)
        .first()
    )


def _draft_workspace_id(db: Session, user_id: str) -> str:
    return _unique_workspace_id(db, f"client-{user_id[:8]}")


def _draft_business_slug(db: Session, user_id: str) -> str:
    return _unique_workspace_id(db, f"workspace-{user_id[:8]}")


def _sync_client_org_and_subscription(
    db: Session,
    account: models.ClientWorkspaceAccount,
    owner_email: str | None,
    owner_name: str | None,
):
    if owner_email:
        owner_email = owner_email.strip().lower()
    if owner_name:
        owner_name = owner_name.strip()

    org: models.ClientOrg | None = None
    if owner_email:
        org = db.query(models.ClientOrg).filter(models.ClientOrg.owner_email == owner_email).first()

    if not org:
        org = models.ClientOrg(
            name=account.business_name,
            slug=_unique_client_org_slug(db, account.business_slug),
            owner_name=owner_name or account.owner_name or account.business_name,
            owner_email=owner_email or f"owner+{account.user_id[:8]}@example.com",
            owner_phone=account.owner_phone,
            industry=account.industry,
            company_size=str(account.employee_count) if account.employee_count else None,
            country=account.country,
            is_active=not account.payment_required,
            is_suspended=bool(account.payment_required),
            notes="Auto-created from client onboarding flow.",
        )
        db.add(org)
        db.flush()
    else:
        org.name = account.business_name
        org.owner_name = owner_name or org.owner_name
        org.owner_phone = account.owner_phone
        org.industry = account.industry
        org.company_size = str(account.employee_count) if account.employee_count else org.company_size
        org.country = account.country
        org.is_active = not account.payment_required
        org.is_suspended = bool(account.payment_required)

    account.client_org_id = org.id

    sub: models.Subscription | None = None
    if account.subscription_id:
        sub = db.query(models.Subscription).filter(models.Subscription.id == account.subscription_id).first()

    if not sub:
        sub = (
            db.query(models.Subscription)
            .filter(models.Subscription.client_id == org.id)
            .order_by(models.Subscription.created_at.desc(), models.Subscription.id.desc())
            .first()
        )

    config = PLAN_CONFIG[account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier)]
    status = models.PlanStatus.suspended if account.payment_required else models.PlanStatus.trial

    if not sub:
        sub = models.Subscription(
            client_id=org.id,
            plan_tier=account.plan_tier,
            status=status,
            price_monthly=float(config["price_monthly"]),
            seats=int(config["seats"]),
            modules="finance,hr,sales,support,legal,marketing,supply_chain,procurement,insights",
            billing_cycle="monthly",
            trial_ends_at=account.trial_ends_at if status == models.PlanStatus.trial else None,
            current_period_start=datetime.utcnow(),
            current_period_end=account.trial_ends_at if status == models.PlanStatus.trial else None,
        )
        db.add(sub)
        db.flush()
    else:
        sub.client_id = org.id
        sub.plan_tier = account.plan_tier
        sub.status = status
        sub.price_monthly = float(config["price_monthly"])
        sub.seats = int(config["seats"])
        sub.trial_ends_at = account.trial_ends_at if status == models.PlanStatus.trial else None
        sub.current_period_end = account.trial_ends_at if status == models.PlanStatus.trial else None

    account.subscription_id = sub.id


def _apply_duplicate_and_trial_logic(
    db: Session,
    account: models.ClientWorkspaceAccount,
    fingerprint: str,
    plan_tier: str,
):
    duplicate = (
        db.query(models.ClientWorkspaceAccount)
        .filter(
            models.ClientWorkspaceAccount.business_fingerprint == fingerprint,
            models.ClientWorkspaceAccount.user_id != account.user_id,
        )
        .order_by(models.ClientWorkspaceAccount.created_at.asc(), models.ClientWorkspaceAccount.id.asc())
        .first()
    )

    account.duplicate_of_account_id = duplicate.id if duplicate else None
    account.payment_required = duplicate is not None
    account.plan_tier = models.PlanTier(plan_tier)

    now_utc = datetime.utcnow()
    if account.payment_required:
        account.trial_started_at = None
        account.trial_ends_at = None
    elif not account.trial_started_at or not account.trial_ends_at:
        account.trial_started_at = now_utc
        account.trial_ends_at = now_utc + timedelta(days=max(1, TRIAL_DAYS_DEFAULT))


@router.post("/bootstrap", response_model=ClientAccountOut)
def bootstrap_client_account(request: Request, db: Session = Depends(get_db)):
    auth_user = assert_request_user_matches(request)
    _assert_client_boundary(auth_user.email)

    account = _find_account_by_user(db, auth_user.user_id)
    if not account:
        account = models.ClientWorkspaceAccount(
            user_id=auth_user.user_id,
            user_email=auth_user.email,
            workspace_id=_draft_workspace_id(db, auth_user.user_id),
            business_name="",
            business_slug=_draft_business_slug(db, auth_user.user_id),
            business_fingerprint=hashlib.sha256(f"draft:{auth_user.user_id}".encode("utf-8")).hexdigest(),
            owner_name=((auth_user.claims.get("user_metadata") or {}).get("full_name") or "").strip() or None,
            plan_tier=models.PlanTier.starter,
            payment_required=False,
            onboarding_completed=False,
        )
        db.add(account)
        db.commit()
        db.refresh(account)
    elif not account.user_email and auth_user.email:
        account.user_email = auth_user.email
        account.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(account)

    return _serialize_account(db, account)


@router.post("/onboard", response_model=ClientAccountOut)
def onboard_client(payload: ClientOnboardingIn, request: Request, db: Session = Depends(get_db)):
    user_id = payload.user_id.strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")

    business_name = payload.business_name.strip()
    if not business_name:
        raise HTTPException(status_code=400, detail="business_name is required.")

    country = payload.country.strip()
    if not country:
        raise HTTPException(status_code=400, detail="country is required.")
    auth_user = assert_request_user_matches(
        request,
        user_id=user_id,
        email=payload.user_email,
    )
    _assert_client_boundary(auth_user.email or payload.user_email)

    plan_tier = _normalize_plan_tier(payload.plan_tier)
    business_slug = _slugify(business_name)
    fingerprint = _build_business_fingerprint(
        business_name=business_name,
        country=payload.country,
        city=payload.city,
        registration_number=payload.registration_number,
    )

    account = _find_account_by_user(db, user_id)
    if not account:
        account = models.ClientWorkspaceAccount(
            user_id=user_id,
            user_email=auth_user.email or (payload.user_email or "").strip().lower() or None,
            workspace_id=_unique_workspace_id(db, business_slug),
            business_name=business_name,
            business_slug=business_slug,
            business_fingerprint=fingerprint,
            registration_number=(payload.registration_number or "").strip() or None,
            country=country,
            city=(payload.city or "").strip() or None,
            address=(payload.address or "").strip() or None,
            industry=(payload.industry or "").strip() or None,
            employee_count=payload.employee_count,
            owner_name=(payload.owner_name or "").strip() or None,
            owner_phone=(payload.owner_phone or "").strip() or None,
            onboarding_completed=False,
        )
        db.add(account)
        db.flush()
    else:
        account.user_email = auth_user.email or (payload.user_email or account.user_email or "").strip().lower() or account.user_email
        account.business_name = business_name
        account.business_slug = business_slug
        account.business_fingerprint = fingerprint
        account.registration_number = (payload.registration_number or "").strip() or None
        account.country = country
        account.city = (payload.city or "").strip() or None
        account.address = (payload.address or "").strip() or None
        account.industry = (payload.industry or "").strip() or None
        account.employee_count = payload.employee_count
        account.owner_name = (payload.owner_name or "").strip() or account.owner_name
        account.owner_phone = (payload.owner_phone or "").strip() or account.owner_phone

    _apply_duplicate_and_trial_logic(db, account, fingerprint=fingerprint, plan_tier=plan_tier)
    _sync_client_org_and_subscription(
        db,
        account=account,
        owner_email=(auth_user.email or payload.user_email or account.user_email),
        owner_name=(payload.owner_name or account.owner_name),
    )
    _recompute_onboarding_completion(db, account)

    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    return _serialize_account(db, account)


@router.get("/profile", response_model=ClientAccountOut)
def get_client_profile(
    request: Request,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    normalized = user_id.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="user_id is required.")
    assert_request_user_matches(request, user_id=normalized)

    account = _find_account_by_user(db, normalized)
    if not account:
        raise HTTPException(status_code=404, detail="Client account not found.")
    _assert_client_boundary(account.user_email)
    return _serialize_account(db, account)


@router.patch("/profile", response_model=ClientAccountOut)
def update_client_profile(
    payload: ClientAccountPatch,
    request: Request,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    normalized = user_id.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="user_id is required.")
    assert_request_user_matches(request, user_id=normalized)

    account = _find_account_by_user(db, normalized)
    if not account:
        raise HTTPException(status_code=404, detail="Client account not found.")
    _assert_client_boundary(account.user_email)

    updates = payload.model_dump(exclude_unset=True)
    if "owner_name" in updates:
        account.owner_name = (updates["owner_name"] or "").strip() or None
    if "owner_phone" in updates:
        account.owner_phone = (updates["owner_phone"] or "").strip() or None
    if "business_name" in updates and updates["business_name"]:
        account.business_name = updates["business_name"].strip()
        account.business_slug = _slugify(account.business_name)
    if "registration_number" in updates:
        account.registration_number = (updates["registration_number"] or "").strip() or None
    if "industry" in updates:
        account.industry = (updates["industry"] or "").strip() or None
    if "country" in updates:
        account.country = (updates["country"] or "").strip() or None
    if "city" in updates:
        account.city = (updates["city"] or "").strip() or None
    if "address" in updates:
        account.address = (updates["address"] or "").strip() or None
    if "employee_count" in updates:
        account.employee_count = updates["employee_count"]
    if "onboarding_completed" in updates and updates["onboarding_completed"] is not None:
        account.onboarding_completed = bool(updates["onboarding_completed"])

    plan_tier = _normalize_plan_tier(updates.get("plan_tier"), fallback=(account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier)))

    account.business_fingerprint = _build_business_fingerprint(
        business_name=account.business_name,
        country=account.country,
        city=account.city,
        registration_number=account.registration_number,
    )

    _apply_duplicate_and_trial_logic(db, account, fingerprint=account.business_fingerprint, plan_tier=plan_tier)
    _sync_client_org_and_subscription(
        db,
        account=account,
        owner_email=account.user_email,
        owner_name=account.owner_name,
    )
    _recompute_onboarding_completion(db, account)

    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    return _serialize_account(db, account)


@router.get("/sidebar", response_model=ClientSidebarOut)
def get_sidebar_summary(
    request: Request,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    normalized = user_id.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="user_id is required.")
    assert_request_user_matches(request, user_id=normalized)

    account = _find_account_by_user(db, normalized)
    if not account:
        return ClientSidebarOut(exists=False, trial_label="Setup required")
    _assert_client_boundary(account.user_email)

    trial = _compute_trial_meta(account)
    setup = _compute_setup_meta(db, account)
    return ClientSidebarOut(
        exists=True,
        workspace_id=account.workspace_id,
        business_name=account.business_name,
        owner_name=account.owner_name,
        plan_tier=account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier),
        payment_required=bool(account.payment_required),
        onboarding_completed=bool(account.onboarding_completed),
        trial_started_at=account.trial_started_at,
        trial_ends_at=account.trial_ends_at,
        trial_seconds_total=trial.total_seconds,
        trial_seconds_remaining=trial.remaining_seconds,
        trial_progress_percent=trial.progress_percent,
        documents_uploaded_count=setup.documents_uploaded_count,
        missing_setup_fields=setup.missing_fields,
        setup_progress_percent=setup.progress_percent,
        trial_label=trial.label,
    )


@router.get("/trial", response_model=TrialSummaryOut)
def get_trial_summary(
    request: Request,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    normalized = user_id.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="user_id is required.")
    assert_request_user_matches(request, user_id=normalized)

    account = _find_account_by_user(db, normalized)
    if not account:
        raise HTTPException(status_code=404, detail="Client account not found.")
    _assert_client_boundary(account.user_email)

    trial = _compute_trial_meta(account)
    return TrialSummaryOut(
        trial_seconds_total=trial.total_seconds,
        trial_seconds_remaining=trial.remaining_seconds,
        trial_progress_percent=trial.progress_percent,
        trial_label=trial.label,
        payment_required=bool(account.payment_required),
        trial_started_at=account.trial_started_at,
        trial_ends_at=account.trial_ends_at,
    )


@router.post("/reports", response_model=ClientPlatformReportOut)
def create_platform_report(payload: ClientPlatformReportIn, request: Request, db: Session = Depends(get_db)):
    user_id = payload.user_id.strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")

    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required.")

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required.")
    auth_user = assert_request_user_matches(
        request,
        user_id=user_id,
        email=payload.user_email,
    )
    _assert_client_boundary(auth_user.email or payload.user_email)

    account = _find_account_by_user(db, user_id)
    if account:
        _assert_client_boundary(account.user_email)
    row = models.ClientPlatformReport(
        account_id=account.id if account else None,
        workspace_id=account.workspace_id if account else None,
        user_id=user_id,
        user_email=(auth_user.email or payload.user_email or (account.user_email if account else "") or "").strip().lower() or None,
        title=title[:255],
        message=message[:8000],
        status="open",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ClientPlatformReportOut(
        id=row.id,
        workspace_id=row.workspace_id,
        title=row.title,
        message=row.message,
        status=row.status,
        created_at=row.created_at,
    )


@router.get("/documents", response_model=list[ClientBusinessDocumentOut])
def list_business_documents(
    request: Request,
    user_id: str = Query(...),
    limit: int = Query(100, ge=1, le=400),
    db: Session = Depends(get_db),
):
    normalized = user_id.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="user_id is required.")
    assert_request_user_matches(request, user_id=normalized)

    account = _find_account_by_user(db, normalized)
    if not account:
        raise HTTPException(status_code=404, detail="Client account not found.")
    _assert_client_boundary(account.user_email)

    rows = (
        db.query(models.ClientBusinessDocument)
        .filter(models.ClientBusinessDocument.account_id == account.id)
        .order_by(models.ClientBusinessDocument.created_at.desc(), models.ClientBusinessDocument.id.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_doc(account, row) for row in rows]


@router.post("/documents", response_model=ClientBusinessDocumentOut)
async def upload_business_document(
    request: Request,
    user_id: str = Form(...),
    document_type: str = Form("official"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    normalized_user = user_id.strip()
    if not normalized_user:
        raise HTTPException(status_code=400, detail="user_id is required.")
    assert_request_user_matches(request, user_id=normalized_user)

    account = _find_account_by_user(db, normalized_user)
    if not account:
        raise HTTPException(status_code=404, detail="Client account not found.")
    _assert_client_boundary(account.user_email)

    content = await file.read()
    size_bytes = len(content)
    if size_bytes <= 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if size_bytes > MAX_DOC_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File is too large. Max {MAX_DOC_UPLOAD_BYTES // (1024 * 1024)} MB.")

    raw_name = (file.filename or "document").strip()
    safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "_", raw_name) or "document"
    workspace_dir = BUSINESS_DOCS_ROOT / account.workspace_id
    workspace_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4().hex[:12]}-{safe_name}"
    target_path = workspace_dir / stored_name
    target_path.write_bytes(content)

    relative_storage_key = f"{account.workspace_id}/{stored_name}"
    row = models.ClientBusinessDocument(
        account_id=account.id,
        workspace_id=account.workspace_id,
        file_name=raw_name[:255],
        mime_type=(file.content_type or "")[:120] or None,
        size_bytes=size_bytes,
        storage_key=relative_storage_key,
        document_type=(document_type or "official").strip()[:60] or "official",
        verification_status="pending",
        uploaded_by_user_id=normalized_user,
    )
    db.add(row)
    _recompute_onboarding_completion(db, account)
    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _serialize_doc(account, row)


@router.get("/documents/{document_id}/download")
def download_business_document(
    request: Request,
    document_id: int,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    normalized = user_id.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="user_id is required.")
    assert_request_user_matches(request, user_id=normalized)

    account = _find_account_by_user(db, normalized)
    if not account:
        raise HTTPException(status_code=404, detail="Client account not found.")
    _assert_client_boundary(account.user_email)

    row = (
        db.query(models.ClientBusinessDocument)
        .filter(
            models.ClientBusinessDocument.id == document_id,
            models.ClientBusinessDocument.account_id == account.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found.")

    target = (BUSINESS_DOCS_ROOT / row.storage_key).resolve()
    root = BUSINESS_DOCS_ROOT.resolve()
    if not str(target).startswith(str(root)):
        raise HTTPException(status_code=404, detail="Document not found.")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Stored file not found.")

    return FileResponse(path=str(target), media_type=row.mime_type or "application/octet-stream", filename=row.file_name)
