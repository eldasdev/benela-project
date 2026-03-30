import time
from io import BytesIO
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import uuid4
from PIL import Image, ImageOps, UnidentifiedImageError

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from database.connection import get_db
from database import admin_schemas
from database import admin_crud as crud
from database import models
from database.models import PlanStatus, PaymentStatus, NotificationTarget, NotificationType
from core.platform_media import (
    MAX_PLATFORM_IMAGE_UPLOAD_BYTES,
    PLATFORM_IMAGE_ROOT,
    build_platform_image_public_url,
    build_platform_image_relative_path,
    safe_platform_media_segment,
)
from api.client_account import (
    BUSINESS_DOCS_ROOT,
    _apply_duplicate_and_trial_logic,
    _build_business_fingerprint,
    _compute_setup_meta,
    _compute_trial_meta,
    _normalize_plan_tier,
    _recompute_onboarding_completion,
    _sync_client_org_and_subscription,
)

router = APIRouter(prefix="/admin", tags=["Admin"])

_SUMMARY_CACHE_TTL_SECONDS = 45
_summary_cache: dict[str, object] = {"updated_monotonic": 0.0, "payload": None}


class SendNotificationBody(BaseModel):
    recipient_count: Optional[int] = None


class AITrainerContextPreviewBody(BaseModel):
    section: str
    message: str
    max_context_chars: Optional[int] = 12000
    max_chunks: Optional[int] = 8


_WORKSPACE_PLAN_PRICES = {
    "starter": 49.0,
    "pro": 149.0,
    "enterprise": 499.0,
}

_ALLOWED_PLATFORM_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}


def _workspace_access_state(
    account: models.ClientWorkspaceAccount,
    linked_client: models.ClientOrg | None,
) -> tuple[str, str, bool]:
    is_suspended = bool(linked_client.is_suspended) if linked_client else False
    if is_suspended:
        return "suspended", "Suspended", True
    if account.payment_required:
        return "payment_required", "Payment required", False
    if not account.onboarding_completed:
        return "setup_pending", "Setup pending", False
    return "active", "Active", False


def _serialize_admin_workspace_row(
    db: Session,
    account: models.ClientWorkspaceAccount,
    linked_client: models.ClientOrg | None,
    linked_subscription: models.Subscription | None,
    documents_count: int,
    open_reports_count: int,
) -> admin_schemas.AdminClientWorkspaceListOut:
    trial = _compute_trial_meta(account)
    setup = _compute_setup_meta(db, account)
    access_status, access_label, is_suspended = _workspace_access_state(account, linked_client)
    plan_key = account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier)
    current_mrr = (
        float(linked_subscription.price_monthly)
        if linked_subscription and linked_subscription.price_monthly is not None
        else float(_WORKSPACE_PLAN_PRICES.get(plan_key, 0.0))
    )
    return admin_schemas.AdminClientWorkspaceListOut(
        id=account.id,
        user_id=account.user_id,
        user_email=account.user_email,
        workspace_id=account.workspace_id,
        business_name=account.business_name,
        business_slug=account.business_slug,
        registration_number=account.registration_number,
        owner_name=account.owner_name,
        owner_phone=account.owner_phone,
        country=account.country,
        city=account.city,
        industry=account.industry,
        employee_count=account.employee_count,
        plan_tier=plan_key,
        payment_required=bool(account.payment_required),
        onboarding_completed=bool(account.onboarding_completed),
        duplicate_of_account_id=account.duplicate_of_account_id,
        linked_client_org_id=account.client_org_id,
        linked_subscription_id=account.subscription_id,
        is_suspended=is_suspended,
        access_status=access_status,
        access_label=access_label,
        trial_started_at=account.trial_started_at,
        trial_ends_at=account.trial_ends_at,
        trial_seconds_remaining=trial.remaining_seconds,
        trial_progress_percent=trial.progress_percent,
        documents_uploaded_count=documents_count,
        open_reports_count=open_reports_count,
        setup_progress_percent=setup.progress_percent,
        current_mrr=round(current_mrr, 2),
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


def _get_workspace_account_or_404(db: Session, account_id: int) -> models.ClientWorkspaceAccount:
    account = (
        db.query(models.ClientWorkspaceAccount)
        .filter(models.ClientWorkspaceAccount.id == account_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Client workspace account not found")
    return account


def _serialize_admin_workspace_detail(
    db: Session,
    account: models.ClientWorkspaceAccount,
) -> admin_schemas.AdminClientWorkspaceDetailOut:
    docs = (
        db.query(models.ClientBusinessDocument)
        .filter(models.ClientBusinessDocument.account_id == account.id)
        .order_by(models.ClientBusinessDocument.created_at.desc(), models.ClientBusinessDocument.id.desc())
        .all()
    )
    reports = (
        db.query(models.ClientPlatformReport)
        .filter(models.ClientPlatformReport.account_id == account.id)
        .order_by(models.ClientPlatformReport.created_at.desc(), models.ClientPlatformReport.id.desc())
        .all()
    )
    linked_client = (
        db.query(models.ClientOrg).filter(models.ClientOrg.id == account.client_org_id).first()
        if account.client_org_id
        else None
    )
    linked_subscription = (
        db.query(models.Subscription).filter(models.Subscription.id == account.subscription_id).first()
        if account.subscription_id
        else None
    )
    row = _serialize_admin_workspace_row(
        db=db,
        account=account,
        linked_client=linked_client,
        linked_subscription=linked_subscription,
        documents_count=len(docs),
        open_reports_count=sum(1 for item in reports if item.status not in {"resolved", "dismissed"}),
    )
    setup = _compute_setup_meta(db, account)
    linked_client_payload = (
        admin_schemas.AdminClientWorkspaceLegacyClientOut(
            id=linked_client.id,
            name=linked_client.name or account.business_name or "Unnamed client",
            slug=linked_client.slug or account.business_slug or f"client-{account.id}",
            is_active=bool(linked_client.is_active),
            is_suspended=bool(linked_client.is_suspended),
        )
        if linked_client
        else None
    )
    linked_subscription_payload = None
    if linked_subscription:
        try:
            subscription_plan_tier = (
                linked_subscription.plan_tier
                if isinstance(linked_subscription.plan_tier, models.PlanTier)
                else models.PlanTier(
                    str(linked_subscription.plan_tier or row.plan_tier or "starter").strip().lower()
                )
            )
        except ValueError:
            subscription_plan_tier = models.PlanTier.starter
        try:
            subscription_status = (
                linked_subscription.status
                if isinstance(linked_subscription.status, models.PlanStatus)
                else models.PlanStatus(
                    str(linked_subscription.status or "trial").strip().lower()
                )
            )
        except ValueError:
            subscription_status = models.PlanStatus.trial
        linked_subscription_payload = admin_schemas.AdminClientWorkspaceSubscriptionOut(
            id=linked_subscription.id,
            plan_tier=subscription_plan_tier,
            status=subscription_status,
            price_monthly=float(linked_subscription.price_monthly or 0),
            billing_cycle=str(linked_subscription.billing_cycle or "monthly"),
            seats=int(linked_subscription.seats or 0),
            current_period_end=linked_subscription.current_period_end,
            created_at=linked_subscription.created_at or account.created_at,
        )
    return admin_schemas.AdminClientWorkspaceDetailOut(
        **row.model_dump(),
        address=account.address,
        missing_setup_fields=setup.missing_fields,
        documents=[
            admin_schemas.AdminClientWorkspaceDocumentOut(
                id=item.id,
                file_name=item.file_name,
                mime_type=item.mime_type,
                size_bytes=item.size_bytes,
                document_type=item.document_type,
                verification_status=item.verification_status,
                created_at=item.created_at,
                download_url=f"/api/admin/client-workspaces/{account.id}/documents/{item.id}/download",
            )
            for item in docs
        ],
        reports=[
            admin_schemas.AdminClientWorkspaceReportOut(
                id=item.id,
                title=item.title,
                message=item.message,
                status=item.status,
                user_id=item.user_id,
                user_email=item.user_email,
                created_at=item.created_at,
                resolved_at=item.resolved_at,
            )
            for item in reports
        ],
        linked_client=linked_client_payload,
        linked_subscription=linked_subscription_payload,
    )


def _get_platform_pricing_map(db: Session) -> dict[str, float]:
    plans = crud.get_platform_pricing_plans(db)
    return {
        str(plan.get("id") or "").strip().lower(): float(plan.get("price_monthly") or 0)
        for plan in plans
        if isinstance(plan, dict)
    }


def _workspace_setup_maps(
    db: Session,
    accounts: list[models.ClientWorkspaceAccount],
) -> tuple[
    dict[int, int],
    dict[int, int],
    dict[int, models.ClientOrg],
    dict[int, models.Subscription],
]:
    account_ids = [item.id for item in accounts]
    org_ids = [item.client_org_id for item in accounts if item.client_org_id]
    sub_ids = [item.subscription_id for item in accounts if item.subscription_id]

    document_counts = {
        account_id: count
        for account_id, count in (
            db.query(models.ClientBusinessDocument.account_id, func.count(models.ClientBusinessDocument.id))
            .filter(models.ClientBusinessDocument.account_id.in_(account_ids))
            .group_by(models.ClientBusinessDocument.account_id)
            .all()
            if account_ids
            else []
        )
    }
    open_reports_counts = {
        account_id: count
        for account_id, count in (
            db.query(models.ClientPlatformReport.account_id, func.count(models.ClientPlatformReport.id))
            .filter(
                models.ClientPlatformReport.account_id.in_(account_ids),
                models.ClientPlatformReport.status.notin_(["resolved", "dismissed"]),
            )
            .group_by(models.ClientPlatformReport.account_id)
            .all()
            if account_ids
            else []
        )
    }
    linked_clients = {
        item.id: item
        for item in (
            db.query(models.ClientOrg).filter(models.ClientOrg.id.in_(org_ids)).all()
            if org_ids
            else []
        )
    }
    linked_subscriptions = {
        item.id: item
        for item in (
            db.query(models.Subscription).filter(models.Subscription.id.in_(sub_ids)).all()
            if sub_ids
            else []
        )
    }
    return document_counts, open_reports_counts, linked_clients, linked_subscriptions


def _serialize_workspace_subscription_row(
    db: Session,
    account: models.ClientWorkspaceAccount,
    linked_client: models.ClientOrg | None,
    linked_subscription: models.Subscription | None,
    documents_count: int,
    open_reports_count: int,
) -> admin_schemas.AdminWorkspaceSubscriptionRow:
    access_status, _, _ = _workspace_access_state(account, linked_client)
    pricing_map = _get_platform_pricing_map(db)
    account_plan = account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier)
    plan_tier = (
        linked_subscription.plan_tier.value
        if linked_subscription and hasattr(linked_subscription.plan_tier, "value")
        else (str(linked_subscription.plan_tier) if linked_subscription else account_plan)
    )
    price_monthly = (
        float(linked_subscription.price_monthly)
        if linked_subscription and linked_subscription.price_monthly is not None
        else float(pricing_map.get(plan_tier, _WORKSPACE_PLAN_PRICES.get(plan_tier, 0)))
    )
    trial_ends_at = linked_subscription.trial_ends_at if linked_subscription else account.trial_ends_at
    inferred_status = "trial" if trial_ends_at and trial_ends_at > datetime.utcnow() else "active"
    if account.payment_required:
        inferred_status = "suspended"
    if linked_client and linked_client.is_suspended:
        inferred_status = "suspended"
    return admin_schemas.AdminWorkspaceSubscriptionRow(
        subscription_id=linked_subscription.id if linked_subscription else None,
        account_id=account.id,
        workspace_id=account.workspace_id,
        business_name=account.business_name,
        business_slug=account.business_slug,
        owner_name=account.owner_name,
        owner_email=account.user_email,
        country=account.country,
        plan_tier=plan_tier,
        status=linked_subscription.status.value if linked_subscription and hasattr(linked_subscription.status, "value") else (str(linked_subscription.status) if linked_subscription else inferred_status),
        billing_cycle=linked_subscription.billing_cycle if linked_subscription else "monthly",
        price_monthly=round(price_monthly, 2),
        seats=int(linked_subscription.seats if linked_subscription and linked_subscription.seats is not None else 10),
        modules=linked_subscription.modules if linked_subscription and linked_subscription.modules else "finance,hr,sales,support,legal,marketing,supply_chain,procurement,insights",
        trial_ends_at=trial_ends_at,
        current_period_start=linked_subscription.current_period_start if linked_subscription else None,
        current_period_end=linked_subscription.current_period_end if linked_subscription else None,
        cancelled_at=linked_subscription.cancelled_at if linked_subscription else None,
        cancel_reason=linked_subscription.cancel_reason if linked_subscription else None,
        access_status=access_status,
        onboarding_completed=bool(account.onboarding_completed),
        payment_required=bool(account.payment_required),
        documents_uploaded_count=documents_count,
        open_reports_count=open_reports_count,
        current_mrr=round(price_monthly, 2),
        linked_client_org_id=account.client_org_id,
        is_unlinked_legacy=False,
        created_at=linked_subscription.created_at if linked_subscription else account.created_at,
    )


def _resolve_account_for_subscription(
    db: Session,
    subscription_id: int,
    requested_account_id: int | None = None,
) -> tuple[models.ClientWorkspaceAccount, models.Subscription]:
    subscription = db.query(models.Subscription).filter(models.Subscription.id == subscription_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")

    account = None
    if requested_account_id:
        account = _get_workspace_account_or_404(db, requested_account_id)
    else:
        account = (
            db.query(models.ClientWorkspaceAccount)
            .filter(models.ClientWorkspaceAccount.subscription_id == subscription_id)
            .first()
        )
        if not account:
            account = (
                db.query(models.ClientWorkspaceAccount)
                .filter(models.ClientWorkspaceAccount.client_org_id == subscription.client_id)
                .order_by(models.ClientWorkspaceAccount.created_at.desc(), models.ClientWorkspaceAccount.id.desc())
                .first()
            )
    if not account:
        raise HTTPException(status_code=404, detail="Linked workspace account not found")
    return account, subscription


def _resolve_payment_account(db: Session, payment: models.Payment) -> models.ClientWorkspaceAccount | None:
    account = (
        db.query(models.ClientWorkspaceAccount)
        .filter(models.ClientWorkspaceAccount.client_org_id == payment.client_id)
        .order_by(models.ClientWorkspaceAccount.created_at.desc(), models.ClientWorkspaceAccount.id.desc())
        .first()
    )
    if account:
        return account
    if payment.subscription_id:
        return (
            db.query(models.ClientWorkspaceAccount)
            .filter(models.ClientWorkspaceAccount.subscription_id == payment.subscription_id)
            .first()
        )
    return None


def _serialize_workspace_payment_row(
    payment: models.Payment,
    account: models.ClientWorkspaceAccount | None,
    linked_subscription: models.Subscription | None,
) -> admin_schemas.AdminWorkspacePaymentRow:
    plan_tier = None
    if linked_subscription:
        plan_tier = linked_subscription.plan_tier.value if hasattr(linked_subscription.plan_tier, "value") else str(linked_subscription.plan_tier)
    elif account:
        plan_tier = account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier)
    return admin_schemas.AdminWorkspacePaymentRow(
        id=payment.id,
        account_id=account.id if account else None,
        workspace_id=account.workspace_id if account else None,
        business_name=account.business_name if account else f"Legacy client #{payment.client_id}",
        owner_email=account.user_email if account else None,
        amount=float(payment.amount),
        currency=payment.currency,
        status=payment.status.value if hasattr(payment.status, "value") else str(payment.status),
        payment_method=payment.payment_method,
        invoice_number=payment.invoice_number,
        transaction_id=payment.transaction_id,
        description=payment.description,
        paid_at=payment.paid_at,
        created_at=payment.created_at,
        linked_subscription_id=payment.subscription_id,
        linked_client_org_id=payment.client_id,
        plan_tier=plan_tier,
        is_unlinked_legacy=account is None,
    )


def _resolve_notification_recipients(
    db: Session,
    target: models.NotificationTarget,
    target_value: str | None,
) -> list[models.ClientWorkspaceAccount]:
    query = db.query(models.ClientWorkspaceAccount)
    if target == models.NotificationTarget.all:
        return query.order_by(models.ClientWorkspaceAccount.created_at.desc()).all()
    if target == models.NotificationTarget.plan_tier:
        plan_value = (target_value or "").strip().lower()
        if not plan_value:
            return []
        try:
            plan_tier = models.PlanTier(plan_value)
        except ValueError:
            return []
        return (
            query.filter(models.ClientWorkspaceAccount.plan_tier == plan_tier)
            .order_by(models.ClientWorkspaceAccount.created_at.desc())
            .all()
        )
    if target == models.NotificationTarget.specific:
        workspace_ids = [item.strip() for item in (target_value or "").split(",") if item.strip()]
        if not workspace_ids:
            return []
        return (
            query.filter(models.ClientWorkspaceAccount.workspace_id.in_(workspace_ids))
            .order_by(models.ClientWorkspaceAccount.created_at.desc())
            .all()
        )
    return []


def _serialize_site_compliance_row(
    db: Session,
    report: models.ClientPlatformReport,
    account: models.ClientWorkspaceAccount | None,
) -> admin_schemas.SiteComplianceRow:
    now = datetime.utcnow()
    age_hours = max(0, int((now - report.created_at).total_seconds() // 3600))
    documents_count = 0
    setup_progress = 0.0
    access_status = None
    plan_tier = None
    if account:
        setup = _compute_setup_meta(db, account)
        documents_count = setup.documents_uploaded_count
        setup_progress = setup.progress_percent
        linked_client = (
            db.query(models.ClientOrg).filter(models.ClientOrg.id == account.client_org_id).first()
            if account.client_org_id
            else None
        )
        access_status, _, _ = _workspace_access_state(account, linked_client)
        plan_tier = account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier)

    return admin_schemas.SiteComplianceRow(
        id=report.id,
        account_id=account.id if account else report.account_id,
        workspace_id=account.workspace_id if account else report.workspace_id,
        business_name=account.business_name if account else (report.workspace_id or "Unlinked report"),
        business_slug=account.business_slug if account else None,
        owner_name=account.owner_name if account else None,
        owner_email=account.user_email if account else report.user_email,
        user_email=report.user_email,
        title=report.title,
        message=report.message,
        status=report.status,
        created_at=report.created_at,
        resolved_at=report.resolved_at,
        age_hours=age_hours,
        plan_tier=plan_tier,
        access_status=access_status,
        documents_uploaded_count=documents_count,
        setup_progress_percent=setup_progress,
    )


# ── Overview ──────────────────────────────────────────
@router.get("/summary")
def admin_summary(db: Session = Depends(get_db)):
    now = time.monotonic()
    cached = _summary_cache.get("payload")
    updated_monotonic = float(_summary_cache.get("updated_monotonic") or 0.0)

    if cached and (now - updated_monotonic) < _SUMMARY_CACHE_TTL_SECONDS:
        return cached

    try:
        payload = crud.get_platform_summary(db)
        _summary_cache["payload"] = payload
        _summary_cache["updated_monotonic"] = now
        return payload
    except SQLAlchemyError:
        if cached:
            return cached
        raise


@router.get("/platform-pricing", response_model=list[admin_schemas.PricingPlanConfigOut])
def get_platform_pricing(db: Session = Depends(get_db)):
    return crud.get_platform_pricing_plans(db)


@router.put("/platform-pricing", response_model=list[admin_schemas.PricingPlanConfigOut])
def update_platform_pricing(body: admin_schemas.PlatformPricingUpdate, db: Session = Depends(get_db)):
    return crud.update_platform_pricing_plans(db, [item.model_dump() for item in body.plans])


# ── Clients ───────────────────────────────────────────
@router.get("/clients")
def list_clients(db: Session = Depends(get_db)):
    rows = crud.get_clients_with_subscriptions(db)
    return [
        {
            "client": admin_schemas.ClientOut.model_validate(r["client"]),
            "subscription": admin_schemas.SubscriptionOut.model_validate(r["subscription"]) if r["subscription"] else None,
        }
        for r in rows
    ]


@router.get("/clients/{id}", response_model=admin_schemas.ClientOut)
def get_client(id: int, db: Session = Depends(get_db)):
    c = crud.get_client(db, id)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.post("/clients", response_model=admin_schemas.ClientOut)
def create_client(data: admin_schemas.ClientCreate, db: Session = Depends(get_db)):
    return crud.create_client(db, data)


@router.put("/clients/{id}", response_model=admin_schemas.ClientOut)
def update_client(id: int, data: admin_schemas.ClientUpdate, db: Session = Depends(get_db)):
    c = crud.update_client(db, id, data)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.delete("/clients/{id}")
def delete_client(id: int, db: Session = Depends(get_db)):
    if not crud.delete_client(db, id):
        raise HTTPException(status_code=404, detail="Client not found")
    return {"ok": True}


@router.patch("/clients/{id}/suspend", response_model=admin_schemas.ClientOut)
def suspend_client(id: int, db: Session = Depends(get_db)):
    c = crud.suspend_client(db, id)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.patch("/clients/{id}/unsuspend", response_model=admin_schemas.ClientOut)
def unsuspend_client(id: int, db: Session = Depends(get_db)):
    c = crud.unsuspend_client(db, id)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.get("/client-workspaces", response_model=list[admin_schemas.AdminClientWorkspaceListOut])
def list_client_workspaces(
    q: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(models.ClientWorkspaceAccount).order_by(
        models.ClientWorkspaceAccount.created_at.desc(),
        models.ClientWorkspaceAccount.id.desc(),
    )

    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(models.ClientWorkspaceAccount.business_name).like(term)
            | func.lower(models.ClientWorkspaceAccount.business_slug).like(term)
            | func.lower(func.coalesce(models.ClientWorkspaceAccount.owner_name, "")).like(term)
            | func.lower(func.coalesce(models.ClientWorkspaceAccount.user_email, "")).like(term)
            | func.lower(func.coalesce(models.ClientWorkspaceAccount.country, "")).like(term)
        )

    accounts = query.limit(limit).all()
    if not accounts:
        return []

    account_ids = [row.id for row in accounts]
    org_ids = [row.client_org_id for row in accounts if row.client_org_id]
    sub_ids = [row.subscription_id for row in accounts if row.subscription_id]

    documents_counts = {
        account_id: count
        for account_id, count in (
            db.query(models.ClientBusinessDocument.account_id, func.count(models.ClientBusinessDocument.id))
            .filter(models.ClientBusinessDocument.account_id.in_(account_ids))
            .group_by(models.ClientBusinessDocument.account_id)
            .all()
        )
    }
    open_reports_counts = {
        account_id: count
        for account_id, count in (
            db.query(models.ClientPlatformReport.account_id, func.count(models.ClientPlatformReport.id))
            .filter(
                models.ClientPlatformReport.account_id.in_(account_ids),
                models.ClientPlatformReport.status.notin_(["resolved", "dismissed"]),
            )
            .group_by(models.ClientPlatformReport.account_id)
            .all()
        )
    }
    linked_clients = {
        row.id: row
        for row in (
            db.query(models.ClientOrg)
            .filter(models.ClientOrg.id.in_(org_ids))
            .all()
            if org_ids
            else []
        )
    }
    linked_subscriptions = {
        row.id: row
        for row in (
            db.query(models.Subscription)
            .filter(models.Subscription.id.in_(sub_ids))
            .all()
            if sub_ids
            else []
        )
    }

    payload = [
        _serialize_admin_workspace_row(
            db=db,
            account=account,
            linked_client=linked_clients.get(account.client_org_id),
            linked_subscription=linked_subscriptions.get(account.subscription_id),
            documents_count=documents_counts.get(account.id, 0),
            open_reports_count=open_reports_counts.get(account.id, 0),
        )
        for account in accounts
    ]

    if status and status.strip() and status != "all":
        payload = [item for item in payload if item.access_status == status]

    return payload


@router.get("/client-workspaces/{account_id}", response_model=admin_schemas.AdminClientWorkspaceDetailOut)
def get_client_workspace(account_id: int, db: Session = Depends(get_db)):
    account = _get_workspace_account_or_404(db, account_id)
    return _serialize_admin_workspace_detail(db, account)


@router.patch("/client-workspaces/{account_id}", response_model=admin_schemas.AdminClientWorkspaceDetailOut)
def update_client_workspace(
    account_id: int,
    body: admin_schemas.AdminClientWorkspaceUpdate,
    db: Session = Depends(get_db),
):
    account = _get_workspace_account_or_404(db, account_id)
    updates = body.model_dump(exclude_unset=True)

    if "owner_name" in updates:
        account.owner_name = updates["owner_name"].strip() if updates["owner_name"] else None
    if "owner_phone" in updates:
        account.owner_phone = updates["owner_phone"].strip() if updates["owner_phone"] else None
    if "business_name" in updates and updates["business_name"]:
        account.business_name = updates["business_name"].strip()
    if "registration_number" in updates:
        account.registration_number = updates["registration_number"].strip() if updates["registration_number"] else None
    if "industry" in updates:
        account.industry = updates["industry"].strip() if updates["industry"] else None
    if "country" in updates:
        account.country = updates["country"].strip() if updates["country"] else None
    if "city" in updates:
        account.city = updates["city"].strip() if updates["city"] else None
    if "address" in updates:
        account.address = updates["address"].strip() if updates["address"] else None
    if "employee_count" in updates:
        account.employee_count = updates["employee_count"]

    plan_tier = (
        _normalize_plan_tier(updates.get("plan_tier"), fallback=account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier))
        if updates.get("plan_tier")
        else (account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier))
    )
    fingerprint = _build_business_fingerprint(
        business_name=account.business_name,
        country=account.country,
        city=account.city,
        registration_number=account.registration_number,
    )
    account.business_fingerprint = fingerprint
    _apply_duplicate_and_trial_logic(db, account, fingerprint=fingerprint, plan_tier=plan_tier)
    _sync_client_org_and_subscription(db, account, account.user_email, account.owner_name)
    _recompute_onboarding_completion(db, account)
    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    return _serialize_admin_workspace_detail(db, account)


@router.patch("/client-workspaces/{account_id}/suspend", response_model=admin_schemas.AdminClientWorkspaceDetailOut)
def suspend_client_workspace(account_id: int, db: Session = Depends(get_db)):
    account = _get_workspace_account_or_404(db, account_id)
    _sync_client_org_and_subscription(db, account, account.user_email, account.owner_name)
    linked_client = db.query(models.ClientOrg).filter(models.ClientOrg.id == account.client_org_id).first()
    if linked_client:
        linked_client.is_active = False
        linked_client.is_suspended = True
    linked_subscription = db.query(models.Subscription).filter(models.Subscription.id == account.subscription_id).first() if account.subscription_id else None
    if linked_subscription and linked_subscription.status != PlanStatus.cancelled:
        linked_subscription.status = PlanStatus.suspended
    if linked_client:
        db.add(
            models.ClientActivity(
                client_id=linked_client.id,
                action="workspace_suspended",
                actor="admin",
                extra_data=f"workspace={account.workspace_id}",
            )
        )
    db.commit()
    db.refresh(account)
    return _serialize_admin_workspace_detail(db, account)


@router.patch("/client-workspaces/{account_id}/unsuspend", response_model=admin_schemas.AdminClientWorkspaceDetailOut)
def unsuspend_client_workspace(account_id: int, db: Session = Depends(get_db)):
    account = _get_workspace_account_or_404(db, account_id)
    _sync_client_org_and_subscription(db, account, account.user_email, account.owner_name)
    linked_client = db.query(models.ClientOrg).filter(models.ClientOrg.id == account.client_org_id).first()
    if linked_client:
        linked_client.is_suspended = False
        linked_client.is_active = True
    linked_subscription = db.query(models.Subscription).filter(models.Subscription.id == account.subscription_id).first() if account.subscription_id else None
    if linked_subscription:
        linked_subscription.status = PlanStatus.suspended if account.payment_required else PlanStatus.trial
    if linked_client:
        db.add(
            models.ClientActivity(
                client_id=linked_client.id,
                action="workspace_unsuspended",
                actor="admin",
                extra_data=f"workspace={account.workspace_id}",
            )
        )
    db.commit()
    db.refresh(account)
    return _serialize_admin_workspace_detail(db, account)


@router.delete("/client-workspaces/{account_id}")
def delete_client_workspace(account_id: int, db: Session = Depends(get_db)):
    account = _get_workspace_account_or_404(db, account_id)
    docs = (
        db.query(models.ClientBusinessDocument)
        .filter(models.ClientBusinessDocument.account_id == account.id)
        .all()
    )
    for doc in docs:
        target = (BUSINESS_DOCS_ROOT / doc.storage_key).resolve()
        root = BUSINESS_DOCS_ROOT.resolve()
        if str(target).startswith(str(root)) and target.exists() and target.is_file():
            try:
                target.unlink()
            except OSError:
                pass
        db.delete(doc)

    db.query(models.ClientPlatformReport).filter(
        models.ClientPlatformReport.account_id == account.id
    ).delete(synchronize_session=False)
    db.query(models.ClientWorkspaceAccount).filter(
        models.ClientWorkspaceAccount.duplicate_of_account_id == account.id
    ).update({models.ClientWorkspaceAccount.duplicate_of_account_id: None}, synchronize_session=False)
    db.delete(account)
    db.commit()
    return {"ok": True}


@router.patch(
    "/client-workspaces/{account_id}/documents/{document_id}",
    response_model=admin_schemas.AdminClientWorkspaceDocumentOut,
)
def update_client_workspace_document_status(
    account_id: int,
    document_id: int,
    body: admin_schemas.AdminClientWorkspaceDocumentStatusBody,
    db: Session = Depends(get_db),
):
    account = _get_workspace_account_or_404(db, account_id)
    document = (
        db.query(models.ClientBusinessDocument)
        .filter(
            models.ClientBusinessDocument.id == document_id,
            models.ClientBusinessDocument.account_id == account.id,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    document.verification_status = body.verification_status
    _recompute_onboarding_completion(db, account)
    account.updated_at = datetime.utcnow()
    db.commit()
    return admin_schemas.AdminClientWorkspaceDocumentOut(
        id=document.id,
        file_name=document.file_name,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
        document_type=document.document_type,
        verification_status=document.verification_status,
        created_at=document.created_at,
        download_url=f"/api/admin/client-workspaces/{account.id}/documents/{document.id}/download",
    )


@router.get("/client-workspaces/{account_id}/documents/{document_id}/download")
def download_client_workspace_document(account_id: int, document_id: int, db: Session = Depends(get_db)):
    account = _get_workspace_account_or_404(db, account_id)
    document = (
        db.query(models.ClientBusinessDocument)
        .filter(
            models.ClientBusinessDocument.id == document_id,
            models.ClientBusinessDocument.account_id == account.id,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    target = (BUSINESS_DOCS_ROOT / document.storage_key).resolve()
    root = BUSINESS_DOCS_ROOT.resolve()
    if not str(target).startswith(str(root)) or not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Document file not found")
    return FileResponse(
        path=str(target),
        media_type=document.mime_type or "application/octet-stream",
        filename=document.file_name,
    )


@router.patch(
    "/client-workspaces/{account_id}/reports/{report_id}",
    response_model=admin_schemas.AdminClientWorkspaceReportOut,
)
def update_client_workspace_report_status(
    account_id: int,
    report_id: int,
    body: admin_schemas.AdminClientWorkspaceReportStatusBody,
    db: Session = Depends(get_db),
):
    account = _get_workspace_account_or_404(db, account_id)
    report = (
        db.query(models.ClientPlatformReport)
        .filter(
            models.ClientPlatformReport.id == report_id,
            models.ClientPlatformReport.account_id == account.id,
        )
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = body.status
    report.resolved_at = datetime.utcnow() if body.status in {"resolved", "dismissed"} else None
    db.commit()
    db.refresh(report)
    return admin_schemas.AdminClientWorkspaceReportOut(
        id=report.id,
        title=report.title,
        message=report.message,
        status=report.status,
        user_id=report.user_id,
        user_email=report.user_email,
        created_at=report.created_at,
        resolved_at=report.resolved_at,
    )


@router.post("/client-workspaces/{account_id}/notify", response_model=admin_schemas.NotificationOut)
def notify_client_workspace(
    account_id: int,
    data: admin_schemas.NotificationCreate,
    db: Session = Depends(get_db),
):
    account = _get_workspace_account_or_404(db, account_id)
    notification = models.AdminNotification(
        title=data.title,
        message=data.message,
        type=data.type,
        target=NotificationTarget.specific,
        target_value=account.workspace_id,
        is_sent=True,
        recipient_count=1,
        sent_at=datetime.utcnow(),
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return admin_schemas.NotificationOut.model_validate(notification)


# ── Subscriptions ────────────────────────────────────
@router.get("/subscriptions", response_model=List[admin_schemas.AdminWorkspaceSubscriptionRow])
def list_subscriptions(
    q: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    plan_tier: Optional[str] = Query(default=None),
    account_id: Optional[int] = Query(default=None),
    access_status: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(models.ClientWorkspaceAccount).order_by(
        models.ClientWorkspaceAccount.created_at.desc(),
        models.ClientWorkspaceAccount.id.desc(),
    )
    if account_id:
        query = query.filter(models.ClientWorkspaceAccount.id == account_id)
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(models.ClientWorkspaceAccount.business_name).like(term)
            | func.lower(models.ClientWorkspaceAccount.business_slug).like(term)
            | func.lower(func.coalesce(models.ClientWorkspaceAccount.owner_name, "")).like(term)
            | func.lower(func.coalesce(models.ClientWorkspaceAccount.user_email, "")).like(term)
            | func.lower(func.coalesce(models.ClientWorkspaceAccount.country, "")).like(term)
        )
    if plan_tier and plan_tier.strip() and plan_tier != "all":
        try:
            query = query.filter(models.ClientWorkspaceAccount.plan_tier == models.PlanTier(plan_tier.strip().lower()))
        except ValueError:
            return []

    accounts = query.limit(limit).all()
    if not accounts:
        return []

    document_counts, open_reports_counts, linked_clients, linked_subscriptions = _workspace_setup_maps(db, accounts)
    payload = [
        _serialize_workspace_subscription_row(
            db=db,
            account=account,
            linked_client=linked_clients.get(account.client_org_id),
            linked_subscription=linked_subscriptions.get(account.subscription_id),
            documents_count=document_counts.get(account.id, 0),
            open_reports_count=open_reports_counts.get(account.id, 0),
        )
        for account in accounts
    ]
    if status and status != "all":
        payload = [row for row in payload if row.status == status]
    if access_status and access_status != "all":
        payload = [row for row in payload if row.access_status == access_status]
    return payload


@router.get("/subscriptions/{id}", response_model=admin_schemas.AdminWorkspaceSubscriptionRow)
def get_subscription(id: int, db: Session = Depends(get_db)):
    account, subscription = _resolve_account_for_subscription(db, id)
    document_counts, open_reports_counts, linked_clients, linked_subscriptions = _workspace_setup_maps(db, [account])
    return _serialize_workspace_subscription_row(
        db=db,
        account=account,
        linked_client=linked_clients.get(account.client_org_id),
        linked_subscription=linked_subscriptions.get(subscription.id),
        documents_count=document_counts.get(account.id, 0),
        open_reports_count=open_reports_counts.get(account.id, 0),
    )


@router.post("/subscriptions", response_model=admin_schemas.AdminWorkspaceSubscriptionRow)
def create_subscription(data: admin_schemas.AdminWorkspaceSubscriptionCreate, db: Session = Depends(get_db)):
    account = _get_workspace_account_or_404(db, data.account_id)
    normalized_plan = _normalize_plan_tier(data.plan_tier, fallback=account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier))
    account.plan_tier = models.PlanTier(normalized_plan)
    if data.status == "suspended":
        account.payment_required = True
    _sync_client_org_and_subscription(db, account, account.user_email, account.owner_name)
    linked_subscription = db.query(models.Subscription).filter(models.Subscription.id == account.subscription_id).first()
    if not linked_subscription:
        raise HTTPException(status_code=500, detail="Could not create linked subscription")
    current_status = (
        linked_subscription.status.value
        if hasattr(linked_subscription.status, "value")
        else str(linked_subscription.status)
    )
    linked_subscription.plan_tier = models.PlanTier(normalized_plan)
    linked_subscription.status = models.PlanStatus(data.status or current_status or "trial")
    linked_subscription.price_monthly = float(data.price_monthly)
    linked_subscription.seats = int(data.seats)
    linked_subscription.modules = data.modules.strip()
    linked_subscription.billing_cycle = data.billing_cycle.strip() or "monthly"
    linked_subscription.trial_ends_at = data.trial_ends_at
    linked_subscription.current_period_start = data.current_period_start
    linked_subscription.current_period_end = data.current_period_end
    if linked_subscription.status == models.PlanStatus.cancelled and not linked_subscription.cancelled_at:
        linked_subscription.cancelled_at = datetime.utcnow()
    account.subscription_id = linked_subscription.id
    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    document_counts, open_reports_counts, linked_clients, linked_subscriptions = _workspace_setup_maps(db, [account])
    return _serialize_workspace_subscription_row(
        db=db,
        account=account,
        linked_client=linked_clients.get(account.client_org_id),
        linked_subscription=linked_subscriptions.get(linked_subscription.id),
        documents_count=document_counts.get(account.id, 0),
        open_reports_count=open_reports_counts.get(account.id, 0),
    )


@router.put("/subscriptions/{id}", response_model=admin_schemas.AdminWorkspaceSubscriptionRow)
def update_subscription(id: int, data: admin_schemas.AdminWorkspaceSubscriptionUpdate, db: Session = Depends(get_db)):
    account, subscription = _resolve_account_for_subscription(db, id, requested_account_id=data.account_id)

    if data.plan_tier:
        normalized_plan = _normalize_plan_tier(data.plan_tier, fallback=account.plan_tier.value if hasattr(account.plan_tier, "value") else str(account.plan_tier))
        account.plan_tier = models.PlanTier(normalized_plan)
        subscription.plan_tier = models.PlanTier(normalized_plan)
    if data.status:
        subscription.status = models.PlanStatus(data.status)
        if data.status == "suspended":
            account.payment_required = True
        elif data.status in {"trial", "active"}:
            account.payment_required = False
    if data.price_monthly is not None:
        subscription.price_monthly = float(data.price_monthly)
    if data.seats is not None:
        subscription.seats = int(data.seats)
    if data.modules is not None:
        subscription.modules = data.modules.strip()
    if data.billing_cycle is not None:
        subscription.billing_cycle = data.billing_cycle.strip() or subscription.billing_cycle
    if data.trial_ends_at is not None:
        subscription.trial_ends_at = data.trial_ends_at
    if data.current_period_start is not None:
        subscription.current_period_start = data.current_period_start
    if data.current_period_end is not None:
        subscription.current_period_end = data.current_period_end
    if data.cancelled_at is not None:
        subscription.cancelled_at = data.cancelled_at
    if data.cancel_reason is not None:
        subscription.cancel_reason = data.cancel_reason

    if subscription.status == models.PlanStatus.cancelled and not subscription.cancelled_at:
        subscription.cancelled_at = datetime.utcnow()

    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    document_counts, open_reports_counts, linked_clients, linked_subscriptions = _workspace_setup_maps(db, [account])
    return _serialize_workspace_subscription_row(
        db=db,
        account=account,
        linked_client=linked_clients.get(account.client_org_id),
        linked_subscription=linked_subscriptions.get(subscription.id),
        documents_count=document_counts.get(account.id, 0),
        open_reports_count=open_reports_counts.get(account.id, 0),
    )


@router.patch("/subscriptions/{id}/cancel", response_model=admin_schemas.AdminWorkspaceSubscriptionRow)
def cancel_subscription(id: int, body: Optional[admin_schemas.CancelSubscriptionBody] = None, db: Session = Depends(get_db)):
    reason = body.reason if body else None
    account, subscription = _resolve_account_for_subscription(db, id)
    subscription.status = models.PlanStatus.cancelled
    subscription.cancelled_at = datetime.utcnow()
    subscription.cancel_reason = reason
    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    document_counts, open_reports_counts, linked_clients, linked_subscriptions = _workspace_setup_maps(db, [account])
    return _serialize_workspace_subscription_row(
        db=db,
        account=account,
        linked_client=linked_clients.get(account.client_org_id),
        linked_subscription=linked_subscriptions.get(subscription.id),
        documents_count=document_counts.get(account.id, 0),
        open_reports_count=open_reports_counts.get(account.id, 0),
    )


# ── Payments ──────────────────────────────────────────
@router.get("/payments/summary", response_model=admin_schemas.PaymentSummaryOut)
def payments_summary(
    account_id: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(models.Payment)
    if account_id:
        account = _get_workspace_account_or_404(db, account_id)
        if not account.client_org_id:
            return admin_schemas.PaymentSummaryOut(
                total_payments=0,
                paid_count=0,
                pending_count=0,
                failed_count=0,
                refunded_count=0,
                paid_volume=0,
                pending_volume=0,
            )
        query = query.filter(models.Payment.client_id == account.client_org_id)
    if status:
        try:
            query = query.filter(models.Payment.status == models.PaymentStatus(status))
        except ValueError:
            return admin_schemas.PaymentSummaryOut(
                total_payments=0,
                paid_count=0,
                pending_count=0,
                failed_count=0,
                refunded_count=0,
                paid_volume=0,
                pending_volume=0,
            )

    rows = query.all()
    return admin_schemas.PaymentSummaryOut(
        total_payments=len(rows),
        paid_count=sum(1 for row in rows if row.status == models.PaymentStatus.paid),
        pending_count=sum(1 for row in rows if row.status == models.PaymentStatus.pending),
        failed_count=sum(1 for row in rows if row.status == models.PaymentStatus.failed),
        refunded_count=sum(1 for row in rows if row.status == models.PaymentStatus.refunded),
        paid_volume=round(sum(float(row.amount) for row in rows if row.status == models.PaymentStatus.paid), 2),
        pending_volume=round(sum(float(row.amount) for row in rows if row.status == models.PaymentStatus.pending), 2),
    )


@router.get("/payments", response_model=List[admin_schemas.AdminWorkspacePaymentRow])
def list_payments(
    q: Optional[str] = Query(default=None),
    account_id: Optional[int] = Query(default=None),
    workspace_id: Optional[str] = Query(default=None),
    method: Optional[str] = Query(default=None),
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    query = db.query(models.Payment).order_by(models.Payment.created_at.desc(), models.Payment.id.desc())
    if status:
        try:
            query = query.filter(models.Payment.status == models.PaymentStatus(status))
        except ValueError:
            return []
    if method:
        query = query.filter(func.lower(func.coalesce(models.Payment.payment_method, "")) == method.strip().lower())
    if account_id:
        account = _get_workspace_account_or_404(db, account_id)
        if not account.client_org_id:
            return []
        query = query.filter(models.Payment.client_id == account.client_org_id)

    payments = query.offset(skip).limit(limit * 2).all()
    rows: list[admin_schemas.AdminWorkspacePaymentRow] = []
    needle = (q or "").strip().lower()
    for payment in payments:
        account = _resolve_payment_account(db, payment)
        if workspace_id and (not account or account.workspace_id != workspace_id):
            continue
        subscription = (
            db.query(models.Subscription).filter(models.Subscription.id == payment.subscription_id).first()
            if payment.subscription_id
            else (db.query(models.Subscription).filter(models.Subscription.id == account.subscription_id).first() if account and account.subscription_id else None)
        )
        row = _serialize_workspace_payment_row(payment, account, subscription)
        if needle:
            haystack = " ".join(
                [
                    row.business_name,
                    row.workspace_id or "",
                    row.owner_email or "",
                    row.invoice_number or "",
                    row.transaction_id or "",
                    row.payment_method or "",
                    row.status,
                    row.plan_tier or "",
                ]
            ).lower()
            if needle not in haystack:
                continue
        rows.append(row)
        if len(rows) >= limit:
            break
    return rows


@router.get("/payments/client/{client_id}", response_model=List[admin_schemas.PaymentOut])
def list_payments_by_client(client_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_payments(db, skip, limit, client_id=client_id)


@router.post("/payments", response_model=admin_schemas.AdminWorkspacePaymentRow)
def create_payment(data: admin_schemas.AdminWorkspacePaymentCreate, db: Session = Depends(get_db)):
    account = _get_workspace_account_or_404(db, data.account_id)
    _sync_client_org_and_subscription(db, account, account.user_email, account.owner_name)
    if not account.client_org_id:
        raise HTTPException(status_code=400, detail="Client workspace is missing linked billing context")
    payment = models.Payment(
        client_id=account.client_org_id,
        subscription_id=account.subscription_id,
        amount=float(data.amount),
        currency=(data.currency or "USD").upper(),
        status=data.status,
        payment_method=(data.payment_method or None),
        description=(data.description or None),
        invoice_number=(data.invoice_number or None),
        transaction_id=(data.transaction_id or None),
        paid_at=data.paid_at if data.paid_at else (datetime.utcnow() if data.status == models.PaymentStatus.paid else None),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    subscription = db.query(models.Subscription).filter(models.Subscription.id == account.subscription_id).first() if account.subscription_id else None
    return _serialize_workspace_payment_row(payment, account, subscription)


@router.patch("/payments/{id}/status", response_model=admin_schemas.AdminWorkspacePaymentRow)
def update_payment_status(
    id: int,
    body: admin_schemas.PaymentStatusUpdate,
    db: Session = Depends(get_db),
):
    payment = crud.update_payment_status(db, id, body.status, paid_at=body.paid_at)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    account = _resolve_payment_account(db, payment)
    subscription = db.query(models.Subscription).filter(models.Subscription.id == payment.subscription_id).first() if payment.subscription_id else None
    return _serialize_workspace_payment_row(payment, account, subscription)


@router.get("/payment-methods", response_model=List[admin_schemas.PaymentMethodOut])
def list_payment_methods(
    active_only: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
):
    return crud.get_payment_methods(db, active_only=active_only)


@router.post("/payment-methods", response_model=admin_schemas.PaymentMethodOut)
def create_payment_method(data: admin_schemas.PaymentMethodCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_payment_method(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/payment-methods/{id}", response_model=admin_schemas.PaymentMethodOut)
def update_payment_method(id: int, data: admin_schemas.PaymentMethodUpdate, db: Session = Depends(get_db)):
    try:
        method = crud.update_payment_method(db, id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    return method


@router.patch("/payment-methods/{id}/default", response_model=admin_schemas.PaymentMethodOut)
def set_default_payment_method(id: int, db: Session = Depends(get_db)):
    try:
        method = crud.set_default_payment_method(db, id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    return method


@router.patch("/payment-methods/{id}/status", response_model=admin_schemas.PaymentMethodOut)
def set_payment_method_status(
    id: int,
    body: admin_schemas.PaymentMethodStatusBody,
    db: Session = Depends(get_db),
):
    method = crud.set_payment_method_status(db, id, body.is_active)
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    return method


# ── Notifications ─────────────────────────────────────
@router.get("/notifications", response_model=List[admin_schemas.NotificationOut])
def list_notifications(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_notifications(db, skip, limit)


@router.post("/notifications", response_model=admin_schemas.NotificationOut)
def create_notification(data: admin_schemas.NotificationCreate, db: Session = Depends(get_db)):
    return crud.create_notification(db, data)


@router.post("/notifications/{id}/send", response_model=admin_schemas.NotificationOut)
def send_notification(id: int, body: SendNotificationBody, db: Session = Depends(get_db)):
    notification = crud.get_notification(db, id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    recipients = _resolve_notification_recipients(db, notification.target, notification.target_value)
    n = crud.send_notification(db, id, len(recipients))
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    return n


@router.delete("/notifications/{id}")
def delete_notification(id: int, db: Session = Depends(get_db)):
    if not crud.delete_notification(db, id):
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


# ── Site Compliances ──────────────────────────────────
@router.get("/site-compliances/summary", response_model=admin_schemas.SiteComplianceSummary)
def site_compliances_summary(db: Session = Depends(get_db)):
    rows = db.query(models.ClientPlatformReport).all()
    now = datetime.utcnow()
    return admin_schemas.SiteComplianceSummary(
        total=len(rows),
        open=sum(1 for row in rows if row.status == "open"),
        reviewing=sum(1 for row in rows if row.status == "reviewing"),
        resolved=sum(1 for row in rows if row.status == "resolved"),
        dismissed=sum(1 for row in rows if row.status == "dismissed"),
        aging_over_24h=sum(1 for row in rows if (now - row.created_at) > timedelta(hours=24) and row.status not in {"resolved", "dismissed"}),
        aging_over_72h=sum(1 for row in rows if (now - row.created_at) > timedelta(hours=72) and row.status not in {"resolved", "dismissed"}),
    )


@router.get("/site-compliances", response_model=list[admin_schemas.SiteComplianceRow])
def list_site_compliances(
    q: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    account_id: Optional[int] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(models.ClientPlatformReport).order_by(
        models.ClientPlatformReport.created_at.desc(),
        models.ClientPlatformReport.id.desc(),
    )
    if account_id:
        query = query.filter(models.ClientPlatformReport.account_id == account_id)
    if status and status != "all":
        query = query.filter(models.ClientPlatformReport.status == status)
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(models.ClientPlatformReport.title).like(term)
            | func.lower(models.ClientPlatformReport.message).like(term)
            | func.lower(func.coalesce(models.ClientPlatformReport.user_email, "")).like(term)
        )
    reports = query.limit(limit).all()
    if not reports:
        return []
    account_ids = [item.account_id for item in reports if item.account_id]
    accounts = {
        item.id: item
        for item in (
            db.query(models.ClientWorkspaceAccount)
            .filter(models.ClientWorkspaceAccount.id.in_(account_ids))
            .all()
            if account_ids
            else []
        )
    }
    return [_serialize_site_compliance_row(db, report, accounts.get(report.account_id)) for report in reports]


@router.get("/site-compliances/{report_id}", response_model=admin_schemas.SiteComplianceDetail)
def get_site_compliance(report_id: int, db: Session = Depends(get_db)):
    report = db.query(models.ClientPlatformReport).filter(models.ClientPlatformReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    account = (
        db.query(models.ClientWorkspaceAccount).filter(models.ClientWorkspaceAccount.id == report.account_id).first()
        if report.account_id
        else None
    )
    base = _serialize_site_compliance_row(db, report, account)
    return admin_schemas.SiteComplianceDetail(
        **base.model_dump(),
        country=account.country if account else None,
        city=account.city if account else None,
        onboarding_completed=bool(account.onboarding_completed) if account else False,
        payment_required=bool(account.payment_required) if account else False,
        open_reports_count=(
            db.query(models.ClientPlatformReport)
            .filter(
                models.ClientPlatformReport.account_id == account.id,
                models.ClientPlatformReport.status.notin_(["resolved", "dismissed"]),
            )
            .count()
            if account
            else 0
        ),
    )


@router.patch("/site-compliances/{report_id}", response_model=admin_schemas.SiteComplianceDetail)
def update_site_compliance_status(
    report_id: int,
    body: admin_schemas.SiteComplianceStatusBody,
    db: Session = Depends(get_db),
):
    report = db.query(models.ClientPlatformReport).filter(models.ClientPlatformReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = body.status
    report.resolved_at = datetime.utcnow() if body.status in {"resolved", "dismissed"} else None
    db.commit()
    return get_site_compliance(report_id, db)


@router.post("/site-compliances/{report_id}/reply", response_model=admin_schemas.NotificationOut)
def reply_site_compliance(
    report_id: int,
    body: admin_schemas.SiteComplianceReplyBody,
    db: Session = Depends(get_db),
):
    report = db.query(models.ClientPlatformReport).filter(models.ClientPlatformReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    account = (
        db.query(models.ClientWorkspaceAccount).filter(models.ClientWorkspaceAccount.id == report.account_id).first()
        if report.account_id
        else None
    )
    if not account or not account.workspace_id:
        raise HTTPException(status_code=400, detail="Report is not linked to a workspace")
    notification = models.AdminNotification(
        title=(body.title or f"Response to: {report.title}").strip(),
        message=body.message.strip(),
        type=body.type,
        target=models.NotificationTarget.specific,
        target_value=account.workspace_id,
        is_sent=True,
        sent_at=datetime.utcnow(),
        recipient_count=1,
    )
    db.add(notification)
    if body.mark_status:
        report.status = body.mark_status
        report.resolved_at = datetime.utcnow() if body.mark_status in {"resolved", "dismissed"} else None
    db.commit()
    db.refresh(notification)
    return admin_schemas.NotificationOut.model_validate(notification)


# ── Activity ───────────────────────────────────────────
@router.get("/activity", response_model=List[admin_schemas.ActivityOut])
def list_activity(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_activity(db, skip, limit)


@router.get("/activity/client/{client_id}", response_model=List[admin_schemas.ActivityOut])
def list_activity_by_client(client_id: int, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return crud.get_activity_by_client(db, client_id, skip, limit)


# ── Analytics ─────────────────────────────────────────
@router.get("/analytics/revenue")
def analytics_revenue(db: Session = Depends(get_db)):
    return crud.get_revenue_chart(db)


@router.get("/analytics/growth")
def analytics_growth(months: int = 12, db: Session = Depends(get_db)):
    return crud.get_analytics_growth(db, months)


@router.get("/analytics/churn")
def analytics_churn(months: int = 12, db: Session = Depends(get_db)):
    return crud.get_analytics_churn(db, months)


# ── Platform Settings ─────────────────────────────────
@router.get("/settings", response_model=admin_schemas.PlatformSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return crud.get_platform_settings(db)


@router.put("/settings", response_model=admin_schemas.PlatformSettingsOut)
def update_settings(data: admin_schemas.PlatformSettingsUpdate, db: Session = Depends(get_db)):
    try:
        return crud.update_platform_settings(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/settings/maintenance", response_model=admin_schemas.PlatformSettingsOut)
def set_maintenance_mode(body: admin_schemas.MaintenanceModeBody, db: Session = Depends(get_db)):
    return crud.set_maintenance_mode(db, body.enabled)


@router.post("/settings/emergency-lockdown", response_model=admin_schemas.PlatformSettingsOut)
def emergency_lockdown(db: Session = Depends(get_db)):
    return crud.emergency_lockdown(db)


@router.post("/settings/rotate-api-key")
def rotate_api_key(db: Session = Depends(get_db)):
    return {"platform_api_key": crud.rotate_platform_api_key(db)}


@router.post("/settings/rotate-webhook-secret")
def rotate_webhook_secret(db: Session = Depends(get_db)):
    return {"webhook_signing_secret": crud.rotate_webhook_signing_secret(db)}


@router.get("/about", response_model=admin_schemas.PlatformAboutPageOut)
def get_about_page(db: Session = Depends(get_db)):
    return crud.get_platform_about_page(db)


@router.put("/about", response_model=admin_schemas.PlatformAboutPageOut)
def update_about_page(data: admin_schemas.PlatformAboutPageUpdate, db: Session = Depends(get_db)):
    return crud.update_platform_about_page(db, data)


@router.get("/blog/summary", response_model=admin_schemas.AdminBlogSummaryOut)
def get_blog_summary(db: Session = Depends(get_db)):
    return crud.get_platform_blog_summary(db)


@router.get("/blog/posts", response_model=List[admin_schemas.AdminBlogPostListOut])
def list_blog_posts(
    q: Optional[str] = Query(default=None),
    status: str = Query(default="all"),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return crud.list_platform_blog_posts(db, q=q, status=status, limit=limit)


@router.get("/blog/posts/{post_id}", response_model=admin_schemas.AdminBlogPostDetailOut)
def get_blog_post(post_id: int, db: Session = Depends(get_db)):
    post = crud.get_platform_blog_post(db, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return post


@router.post("/blog/posts", response_model=admin_schemas.AdminBlogPostDetailOut)
def create_blog_post(data: admin_schemas.AdminBlogPostCreate, db: Session = Depends(get_db)):
    return crud.create_platform_blog_post(db, data)


@router.put("/blog/posts/{post_id}", response_model=admin_schemas.AdminBlogPostDetailOut)
def update_blog_post(post_id: int, data: admin_schemas.AdminBlogPostUpdate, db: Session = Depends(get_db)):
    post = crud.update_platform_blog_post(db, post_id, data)
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return post


@router.delete("/blog/posts/{post_id}")
def delete_blog_post(post_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_platform_blog_post(db, post_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return {"ok": True}


@router.get("/blog/comments", response_model=List[admin_schemas.AdminBlogCommentOut])
def list_blog_comments(
    status: str = Query(default="all"),
    post_id: Optional[int] = Query(default=None),
    limit: int = Query(default=300, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return crud.list_platform_blog_comments(db, status=status, post_id=post_id, limit=limit)


@router.patch("/blog/comments/{comment_id}", response_model=admin_schemas.AdminBlogCommentOut)
def update_blog_comment(comment_id: int, body: admin_schemas.AdminBlogCommentStatusBody, db: Session = Depends(get_db)):
    comment = crud.update_platform_blog_comment_status(db, comment_id, body.status)
    if not comment:
        raise HTTPException(status_code=404, detail="Blog comment not found")
    return comment


@router.post("/media/images", response_model=admin_schemas.AdminUploadedImageOut)
async def upload_admin_image(
    asset_type: str = Form(default="general"),
    file: UploadFile = File(...),
):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    if len(payload) > MAX_PLATFORM_IMAGE_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Uploaded image is too large.")
    if file.content_type and file.content_type.lower() not in _ALLOWED_PLATFORM_IMAGE_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type.")

    try:
        image = Image.open(BytesIO(payload))
        image = ImageOps.exif_transpose(image)
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")

    if image.width < 32 or image.height < 32:
        raise HTTPException(status_code=400, detail="Image is too small.")

    image.thumbnail((2400, 2400))
    converted = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    output = BytesIO()
    converted.save(output, format="WEBP", quality=90)
    normalized = output.getvalue()

    file_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:12]}.webp"
    relative_path = build_platform_image_relative_path(
        safe_platform_media_segment(asset_type, "general"),
        file_name,
    )
    absolute_path = (PLATFORM_IMAGE_ROOT / relative_path).resolve()
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    absolute_path.write_bytes(normalized)

    return admin_schemas.AdminUploadedImageOut(
        url=build_platform_image_public_url(relative_path),
        asset_type=safe_platform_media_segment(asset_type, "general"),
        width=converted.width,
        height=converted.height,
        content_type="image/webp",
        size_bytes=len(normalized),
        file_name=file_name,
    )


# ── AI Trainer ────────────────────────────────────────
@router.get("/ai-trainer/profiles", response_model=List[admin_schemas.AITrainerProfileOut])
def list_ai_trainer_profiles(db: Session = Depends(get_db)):
    return crud.get_ai_trainer_profiles(db)


@router.get("/ai-trainer/profile/{section}", response_model=admin_schemas.AITrainerProfileOut)
def get_ai_trainer_profile(section: str, db: Session = Depends(get_db)):
    try:
        profile = crud.get_ai_trainer_profile(db, section)
        sources = crud.list_ai_trainer_sources(db, section, limit=1000)
        chunks_total = sum(item.chunk_count for item in sources)
        ready_total = sum(1 for item in sources if item.status == "ready")
        payload = admin_schemas.AITrainerProfileOut.model_validate(profile).model_dump()
        payload["sources_total"] = len(sources)
        payload["sources_ready"] = ready_total
        payload["chunks_total"] = chunks_total
        return payload
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/ai-trainer/profile/{section}", response_model=admin_schemas.AITrainerProfileOut)
def update_ai_trainer_profile(
    section: str,
    data: admin_schemas.AITrainerProfileUpdate,
    db: Session = Depends(get_db),
):
    try:
        profile = crud.update_ai_trainer_profile(db, section, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return profile


@router.get("/ai-trainer/sources", response_model=List[admin_schemas.AITrainerSourceOut])
def list_ai_trainer_sources(
    section: str = Query(...),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        return crud.list_ai_trainer_sources(db, section, limit=limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-trainer/sources/url", response_model=admin_schemas.AITrainerSourceOut)
def add_ai_trainer_source_url(
    data: admin_schemas.AITrainerSourceCreateURL,
    db: Session = Depends(get_db),
):
    try:
        return crud.create_ai_trainer_source_from_url(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-trainer/sources/text", response_model=admin_schemas.AITrainerSourceOut)
def add_ai_trainer_source_text(
    data: admin_schemas.AITrainerSourceCreateText,
    db: Session = Depends(get_db),
):
    try:
        return crud.create_ai_trainer_source_from_text(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-trainer/sources/file", response_model=admin_schemas.AITrainerSourceOut)
async def add_ai_trainer_source_file(
    section: str = Form(...),
    title: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    try:
        return crud.create_ai_trainer_source_from_file(
            db,
            section=section,
            file_name=file.filename or "source.bin",
            mime_type=file.content_type,
            payload=payload,
            title=title,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-trainer/sources/{source_id}/reindex", response_model=admin_schemas.AITrainerSourceOut)
def reindex_ai_trainer_source(source_id: int, db: Session = Depends(get_db)):
    source = crud.reindex_ai_trainer_source(db, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


@router.delete("/ai-trainer/sources/{source_id}")
def delete_ai_trainer_source(source_id: int, db: Session = Depends(get_db)):
    if not crud.delete_ai_trainer_source(db, source_id):
        raise HTTPException(status_code=404, detail="Source not found")
    return {"ok": True}


@router.post("/ai-trainer/context-preview")
def ai_trainer_context_preview(body: AITrainerContextPreviewBody, db: Session = Depends(get_db)):
    context = crud.get_ai_trainer_training_context(
        db=db,
        section=body.section,
        query=body.message,
        max_context_chars=body.max_context_chars or 12000,
        max_chunks=body.max_chunks or 8,
    )
    return {"context": context}
