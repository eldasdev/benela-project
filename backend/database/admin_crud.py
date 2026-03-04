from datetime import datetime, timedelta
import hashlib
import html as html_lib
import json
import re
import secrets
from typing import List, Optional

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func

from database.models import (
    ClientOrg,
    Subscription,
    Payment,
    PaymentMethod,
    PaymentMethodType,
    AdminNotification,
    ClientActivity,
    PlanTier,
    PlanStatus,
    PaymentStatus,
    NotificationType,
    NotificationTarget,
    PlatformSettings,
    AITrainerProfile,
    AITrainerSource,
    AITrainerChunk,
)
from database import admin_schemas

_PAYMENT_METHODS_SEEDED = False


# ── Platform summary ──────────────────────────────────
def get_platform_summary(db: Session):
    total_clients = db.query(func.count(ClientOrg.id)).scalar() or 0
    active_clients = (
        db.query(func.count(ClientOrg.id))
        .filter(ClientOrg.is_active == True)
        .scalar()
        or 0
    )
    suspended = (
        db.query(func.count(ClientOrg.id))
        .filter(ClientOrg.is_suspended == True)
        .scalar()
        or 0
    )
    total_mrr = (
        db.query(func.sum(Subscription.price_monthly))
        .filter(Subscription.status.in_([PlanStatus.active, PlanStatus.trial]))
        .scalar()
        or 0
    )
    trial_count = (
        db.query(func.count(Subscription.id))
        .filter(Subscription.status == PlanStatus.trial)
        .scalar()
        or 0
    )
    start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    paid_this_month = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.status == PaymentStatus.paid, Payment.paid_at >= start_of_month)
        .scalar()
        or 0
    )
    plan_breakdown = {}
    for tier in PlanTier:
        count = (
            db.query(func.count(Subscription.id))
            .filter(
                Subscription.plan_tier == tier,
                Subscription.status.in_([PlanStatus.active, PlanStatus.trial]),
            )
            .scalar()
            or 0
        )
        plan_breakdown[tier.value] = count
    return {
        "total_clients": total_clients,
        "active_clients": active_clients,
        "suspended": suspended,
        "monthly_recurring_revenue": round(float(total_mrr), 2),
        "paid_this_month": round(float(paid_this_month), 2),
        "trials_active": trial_count,
        "plan_breakdown": plan_breakdown,
    }


def get_revenue_chart(db: Session, months: int = 12) -> List[dict]:
    result = []
    today = datetime.now()
    for i in range(months - 1, -1, -1):
        # i months ago
        year = today.year
        month = today.month - (i + 1)
        while month <= 0:
            month += 12
            year -= 1
        start = datetime(year, month, 1, 0, 0, 0, 0)
        if month == 12:
            end = datetime(year + 1, 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        else:
            end = datetime(year, month + 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        revenue = (
            db.query(func.sum(Payment.amount))
            .filter(
                Payment.status == PaymentStatus.paid,
                Payment.paid_at >= start,
                Payment.paid_at <= end,
            )
            .scalar()
            or 0
        )
        result.append({
            "month": start.strftime("%b %Y"),
            "revenue": round(float(revenue), 2),
        })
    return result


def get_clients_with_subscriptions(db: Session) -> List[dict]:
    clients = db.query(ClientOrg).order_by(ClientOrg.created_at.desc()).all()
    result = []
    for c in clients:
        sub = (
            db.query(Subscription)
            .filter(Subscription.client_id == c.id)
            .order_by(Subscription.created_at.desc())
            .first()
        )
        result.append({"client": c, "subscription": sub})
    return result


# ── Platform Settings ─────────────────────────────────
def _ensure_platform_settings(db: Session):
    settings = db.query(PlatformSettings).first()
    if settings:
        return settings
    settings = PlatformSettings(
        platform_name="Benela AI",
        default_currency="USD",
        default_trial_days=14,
        default_tax_rate=0,
        invoice_prefix="BNL",
        maintenance_mode=False,
        allow_new_signups=True,
        enforce_admin_mfa=False,
        session_timeout_minutes=60,
        allow_marketplace=True,
        allow_plugin_purchases=True,
        webhook_signing_secret=f"whsec_{secrets.token_urlsafe(24)}",
        platform_api_key=f"bnl_{secrets.token_urlsafe(24)}",
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def get_platform_settings(db: Session):
    return _ensure_platform_settings(db)


def update_platform_settings(db: Session, data: admin_schemas.PlatformSettingsUpdate):
    settings = _ensure_platform_settings(db)
    updates = data.model_dump(exclude_unset=True)

    if "default_currency" in updates and updates["default_currency"] is not None:
        updates["default_currency"] = updates["default_currency"].upper().strip()
    if "invoice_prefix" in updates and updates["invoice_prefix"] is not None:
        updates["invoice_prefix"] = updates["invoice_prefix"].upper().strip()

    if "default_trial_days" in updates:
        days = updates["default_trial_days"]
        if days is not None and (days < 0 or days > 365):
            raise ValueError("default_trial_days must be between 0 and 365")

    if "default_tax_rate" in updates:
        tax = updates["default_tax_rate"]
        if tax is not None and (tax < 0 or tax > 100):
            raise ValueError("default_tax_rate must be between 0 and 100")

    if "session_timeout_minutes" in updates:
        timeout = updates["session_timeout_minutes"]
        if timeout is not None and (timeout < 5 or timeout > 1440):
            raise ValueError("session_timeout_minutes must be between 5 and 1440")

    for key, value in updates.items():
        setattr(settings, key, value)

    db.commit()
    db.refresh(settings)
    return settings


def set_maintenance_mode(db: Session, enabled: bool):
    settings = _ensure_platform_settings(db)
    settings.maintenance_mode = enabled
    db.commit()
    db.refresh(settings)
    return settings


def emergency_lockdown(db: Session):
    settings = _ensure_platform_settings(db)
    settings.maintenance_mode = True
    settings.allow_new_signups = False
    settings.allow_plugin_purchases = False
    db.commit()
    db.refresh(settings)
    return settings


def rotate_platform_api_key(db: Session):
    settings = _ensure_platform_settings(db)
    settings.platform_api_key = f"bnl_{secrets.token_urlsafe(24)}"
    db.commit()
    db.refresh(settings)
    return settings.platform_api_key


def rotate_webhook_signing_secret(db: Session):
    settings = _ensure_platform_settings(db)
    settings.webhook_signing_secret = f"whsec_{secrets.token_urlsafe(24)}"
    db.commit()
    db.refresh(settings)
    return settings.webhook_signing_secret


# ── ClientOrg CRUD ────────────────────────────────────
def get_client(db: Session, id: int):
    return db.query(ClientOrg).filter(ClientOrg.id == id).first()


def create_client(db: Session, data: admin_schemas.ClientCreate):
    c = ClientOrg(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def update_client(db: Session, id: int, data: admin_schemas.ClientUpdate):
    c = db.query(ClientOrg).filter(ClientOrg.id == id).first()
    if not c:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


def delete_client(db: Session, id: int) -> bool:
    c = db.query(ClientOrg).filter(ClientOrg.id == id).first()
    if not c:
        return False
    db.delete(c)
    db.commit()
    return True


def suspend_client(db: Session, id: int):
    c = db.query(ClientOrg).filter(ClientOrg.id == id).first()
    if not c:
        return None
    c.is_suspended = True
    c.is_active = False
    db.commit()
    db.refresh(c)
    return c


def unsuspend_client(db: Session, id: int):
    c = db.query(ClientOrg).filter(ClientOrg.id == id).first()
    if not c:
        return None
    c.is_suspended = False
    c.is_active = True
    db.commit()
    db.refresh(c)
    return c


# ── Subscription CRUD ─────────────────────────────────
def get_subscriptions(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(Subscription)
        .order_by(Subscription.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_subscription(db: Session, id: int):
    return db.query(Subscription).filter(Subscription.id == id).first()


def get_subscription_by_client(db: Session, client_id: int):
    return (
        db.query(Subscription)
        .filter(Subscription.client_id == client_id)
        .order_by(Subscription.created_at.desc())
        .first()
    )


def create_subscription(db: Session, data: admin_schemas.SubscriptionCreate):
    s = Subscription(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def update_subscription(db: Session, id: int, data: admin_schemas.SubscriptionUpdate):
    s = db.query(Subscription).filter(Subscription.id == id).first()
    if not s:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


def cancel_subscription(db: Session, id: int, reason: Optional[str] = None):
    s = db.query(Subscription).filter(Subscription.id == id).first()
    if not s:
        return None
    s.status = PlanStatus.cancelled
    s.cancelled_at = datetime.now()
    s.cancel_reason = reason
    db.commit()
    db.refresh(s)
    return s


# ── Payment CRUD ───────────────────────────────────────
def _seed_payment_methods_if_empty(db: Session):
    global _PAYMENT_METHODS_SEEDED
    if _PAYMENT_METHODS_SEEDED:
        return
    count = db.query(func.count(PaymentMethod.id)).scalar() or 0
    if count > 0:
        _PAYMENT_METHODS_SEEDED = True
        return
    methods = [
        PaymentMethod(
            name="Primary Card Processor",
            provider="Stripe",
            method_type=PaymentMethodType.card,
            details="Visa/Mastercard",
            fee_percent=2.9,
            fee_fixed=0.3,
            supports_refunds=True,
            is_active=True,
            is_default=True,
        ),
        PaymentMethod(
            name="Bank Transfer",
            provider="Bank",
            method_type=PaymentMethodType.bank,
            details="ACH / Wire",
            fee_percent=1.0,
            fee_fixed=0,
            supports_refunds=False,
            is_active=True,
            is_default=False,
        ),
        PaymentMethod(
            name="Manual Invoice",
            provider="Internal",
            method_type=PaymentMethodType.manual,
            details="Offline settlement",
            fee_percent=0,
            fee_fixed=0,
            supports_refunds=False,
            is_active=True,
            is_default=False,
        ),
    ]
    for m in methods:
        db.add(m)
    db.commit()
    _PAYMENT_METHODS_SEEDED = True


def _validate_payment_method_values(fee_percent: Optional[float], fee_fixed: Optional[float]):
    if fee_percent is not None and (fee_percent < 0 or fee_percent > 100):
        raise ValueError("fee_percent must be between 0 and 100")
    if fee_fixed is not None and fee_fixed < 0:
        raise ValueError("fee_fixed cannot be negative")


def _ensure_single_default(db: Session, method_id: Optional[int] = None):
    query = db.query(PaymentMethod)
    if method_id is not None:
        query = query.filter(PaymentMethod.id != method_id)
    query.update({PaymentMethod.is_default: False}, synchronize_session=False)


def _ensure_any_default(db: Session):
    has_default = (
        db.query(func.count(PaymentMethod.id))
        .filter(PaymentMethod.is_default == True, PaymentMethod.is_active == True)
        .scalar()
        or 0
    )
    if has_default:
        return
    fallback = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.is_active == True)
        .order_by(PaymentMethod.created_at.asc())
        .first()
    )
    if fallback:
        fallback.is_default = True


def get_payment_summary(db: Session):
    total_payments = db.query(func.count(Payment.id)).scalar() or 0
    paid_count = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == PaymentStatus.paid)
        .scalar()
        or 0
    )
    pending_count = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == PaymentStatus.pending)
        .scalar()
        or 0
    )
    failed_count = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == PaymentStatus.failed)
        .scalar()
        or 0
    )
    refunded_count = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == PaymentStatus.refunded)
        .scalar()
        or 0
    )
    paid_volume = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.status == PaymentStatus.paid)
        .scalar()
        or 0
    )
    pending_volume = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.status == PaymentStatus.pending)
        .scalar()
        or 0
    )
    return {
        "total_payments": total_payments,
        "paid_count": paid_count,
        "pending_count": pending_count,
        "failed_count": failed_count,
        "refunded_count": refunded_count,
        "paid_volume": round(float(paid_volume), 2),
        "pending_volume": round(float(pending_volume), 2),
    }


def get_payments(
    db: Session,
    skip: int = 0,
    limit: int = 200,
    client_id: Optional[int] = None,
    status: Optional[str] = None,
):
    q = db.query(Payment).order_by(Payment.created_at.desc())
    if client_id is not None:
        q = q.filter(Payment.client_id == client_id)
    if status is not None:
        q = q.filter(Payment.status == status)
    return q.offset(skip).limit(limit).all()


def get_payment(db: Session, id: int):
    return db.query(Payment).filter(Payment.id == id).first()


def get_payment_methods(db: Session, active_only: Optional[bool] = None):
    _seed_payment_methods_if_empty(db)
    query = db.query(PaymentMethod)
    if active_only is not None:
        query = query.filter(PaymentMethod.is_active == active_only)
    return (
        query.order_by(PaymentMethod.is_default.desc(), PaymentMethod.created_at.asc())
        .all()
    )


def create_payment_method(db: Session, data: admin_schemas.PaymentMethodCreate):
    _validate_payment_method_values(data.fee_percent, data.fee_fixed)
    payload = data.model_dump()
    method = PaymentMethod(**payload)

    if payload.get("is_default"):
        _ensure_single_default(db)

    db.add(method)
    db.commit()
    _ensure_any_default(db)
    db.commit()
    db.refresh(method)
    return method


def update_payment_method(db: Session, method_id: int, data: admin_schemas.PaymentMethodUpdate):
    method = db.query(PaymentMethod).filter(PaymentMethod.id == method_id).first()
    if not method:
        return None

    updates = data.model_dump(exclude_unset=True)
    _validate_payment_method_values(updates.get("fee_percent"), updates.get("fee_fixed"))

    if updates.get("is_default") is True:
        _ensure_single_default(db, method_id=method.id)

    for key, value in updates.items():
        setattr(method, key, value)

    if updates.get("is_active") is False and method.is_default:
        method.is_default = False

    _ensure_any_default(db)
    db.commit()
    db.refresh(method)
    return method


def set_default_payment_method(db: Session, method_id: int):
    method = db.query(PaymentMethod).filter(PaymentMethod.id == method_id).first()
    if not method:
        return None
    if not method.is_active:
        raise ValueError("Cannot set an inactive payment method as default")

    _ensure_single_default(db, method_id=method.id)
    method.is_default = True
    db.commit()
    db.refresh(method)
    return method


def set_payment_method_status(db: Session, method_id: int, is_active: bool):
    method = db.query(PaymentMethod).filter(PaymentMethod.id == method_id).first()
    if not method:
        return None

    method.is_active = is_active
    if not is_active and method.is_default:
        method.is_default = False
    _ensure_any_default(db)
    db.commit()
    db.refresh(method)
    return method


def create_payment(db: Session, data: admin_schemas.PaymentCreate):
    p = Payment(**data.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def update_payment_status(db: Session, id: int, status: PaymentStatus, paid_at: Optional[datetime] = None):
    p = db.query(Payment).filter(Payment.id == id).first()
    if not p:
        return None
    p.status = status
    if paid_at is not None:
        p.paid_at = paid_at
    elif status == PaymentStatus.paid:
        p.paid_at = p.paid_at or datetime.now()
    db.commit()
    db.refresh(p)
    return p


# ── Notifications ─────────────────────────────────────
def get_notifications(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(AdminNotification)
        .order_by(AdminNotification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_notification(db: Session, id: int):
    return db.query(AdminNotification).filter(AdminNotification.id == id).first()


def create_notification(db: Session, data: admin_schemas.NotificationCreate):
    n = AdminNotification(**data.model_dump())
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def delete_notification(db: Session, id: int) -> bool:
    n = db.query(AdminNotification).filter(AdminNotification.id == id).first()
    if not n:
        return False
    db.delete(n)
    db.commit()
    return True


def send_notification(db: Session, id: int, recipient_count: int):
    n = db.query(AdminNotification).filter(AdminNotification.id == id).first()
    if not n:
        return None
    n.is_sent = True
    n.sent_at = datetime.now()
    n.recipient_count = recipient_count
    db.commit()
    db.refresh(n)
    return n


def get_client_notifications(
    db: Session,
    workspace_id: Optional[str] = None,
    limit: int = 50,
):
    query = (
        db.query(AdminNotification)
        .filter(AdminNotification.is_sent == True)
        .order_by(AdminNotification.sent_at.desc(), AdminNotification.created_at.desc())
    )

    # Pull a wider slice first, then apply Python-side targeting filters.
    candidates = query.limit(max(limit * 3, limit)).all()
    filtered: List[AdminNotification] = []

    for notif in candidates:
        if notif.target == NotificationTarget.all:
            filtered.append(notif)
            continue

        if notif.target == NotificationTarget.specific:
            if not workspace_id or not notif.target_value:
                continue
            targets = {item.strip() for item in notif.target_value.split(",") if item.strip()}
            if workspace_id in targets:
                filtered.append(notif)
            continue

        # Plan-tier targeting is currently not mapped to tenant identity in client session.
        # Keep these visible until plan context is wired.
        if notif.target == NotificationTarget.plan_tier:
            filtered.append(notif)

    return filtered[:limit]


# ── Activity ───────────────────────────────────────────
def log_activity(
    db: Session,
    client_id: int,
    action: str,
    actor: Optional[str] = None,
    metadata: Optional[str] = None,
):
    a = ClientActivity(client_id=client_id, action=action, actor=actor, extra_data=metadata)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def get_activity(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(ClientActivity)
        .order_by(ClientActivity.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_activity_by_client(db: Session, client_id: int, skip: int = 0, limit: int = 50):
    return (
        db.query(ClientActivity)
        .filter(ClientActivity.client_id == client_id)
        .order_by(ClientActivity.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ── Analytics ──────────────────────────────────────────
def get_analytics_growth(db: Session, months: int = 12) -> List[dict]:
    result = []
    today = datetime.now()
    cumulative = 0
    for i in range(months - 1, -1, -1):
        year = today.year
        month = today.month - (i + 1)
        while month <= 0:
            month += 12
            year -= 1
        start = datetime(year, month, 1, 0, 0, 0, 0)
        if month == 12:
            end = datetime(year + 1, 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        else:
            end = datetime(year, month + 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        new_count = (
            db.query(func.count(ClientOrg.id))
            .filter(ClientOrg.created_at >= start, ClientOrg.created_at <= end)
            .scalar()
            or 0
        )
        cumulative += new_count
        result.append({
            "month": start.strftime("%b %Y"),
            "new_clients": new_count,
            "cumulative": cumulative,
        })
    return result


def get_analytics_churn(db: Session, months: int = 12) -> List[dict]:
    result = []
    today = datetime.now()
    for i in range(months - 1, -1, -1):
        year = today.year
        month = today.month - (i + 1)
        while month <= 0:
            month += 12
            year -= 1
        start = datetime(year, month, 1, 0, 0, 0, 0)
        if month == 12:
            end = datetime(year + 1, 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        else:
            end = datetime(year, month + 1, 1, 0, 0, 0, 0) - timedelta(seconds=1)
        churned = (
            db.query(func.count(Subscription.id))
            .filter(
                Subscription.status == PlanStatus.cancelled,
                Subscription.cancelled_at >= start,
                Subscription.cancelled_at <= end,
            )
            .scalar()
            or 0
        )
        result.append({
            "month": start.strftime("%b %Y"),
            "churned": churned,
        })
    return result


# ── AI Trainer ────────────────────────────────────────
_AI_TRAINER_SECTIONS = (
    "dashboard",
    "projects",
    "finance",
    "hr",
    "sales",
    "support",
    "legal",
    "marketing",
    "supply_chain",
    "procurement",
    "insights",
    "settings",
    "marketplace",
    "admin",
)
_AI_TRAINER_PROVIDERS = {"auto", "anthropic", "openai"}
_TEXT_EXTENSIONS = {"txt", "md", "csv", "json", "xml", "html", "htm", "log", "yaml", "yml"}
_DOCX_EXTENSIONS = {"docx"}
_STOPWORDS = {
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "from",
    "have",
    "your",
    "are",
    "you",
    "our",
    "into",
    "about",
    "will",
    "was",
    "were",
    "shall",
    "should",
    "would",
    "could",
    "they",
    "their",
    "them",
    "been",
    "where",
    "when",
    "what",
    "which",
    "how",
    "why",
}


def _tokenize_text(value: str) -> list[str]:
    return [token for token in re.split(r"\W+", (value or "").lower()) if len(token) > 2]


def _normalize_section(section: str) -> str:
    normalized = (section or "").strip().lower()
    if normalized not in _AI_TRAINER_SECTIONS:
        raise ValueError("Unknown section for AI trainer.")
    return normalized


def _normalize_provider(provider: str | None) -> str:
    if provider is None:
        return "auto"
    normalized = provider.strip().lower()
    if normalized not in _AI_TRAINER_PROVIDERS:
        raise ValueError("Provider must be one of: auto, anthropic, openai.")
    return normalized


def _strip_html(raw_html: str) -> str:
    no_script = re.sub(r"<script.*?>.*?</script>", " ", raw_html, flags=re.IGNORECASE | re.DOTALL)
    no_style = re.sub(r"<style.*?>.*?</style>", " ", no_script, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", no_style)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_pdf_text(payload: bytes) -> str:
    from io import BytesIO
    from pypdf import PdfReader  # type: ignore

    reader = PdfReader(BytesIO(payload))
    parts: list[str] = []
    for page in reader.pages:
        value = (page.extract_text() or "").strip()
        if value:
            parts.append(value)
    return "\n".join(parts).strip()


def _extract_docx_text(payload: bytes) -> str:
    import zipfile
    from io import BytesIO

    with zipfile.ZipFile(BytesIO(payload)) as archive:
        xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
    text = re.sub(r"</w:p>", "\n", xml)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_text_from_file(payload: bytes, file_name: str, mime_type: str | None) -> str:
    if not payload:
        raise ValueError("Uploaded file is empty.")

    normalized_mime = (mime_type or "").lower()
    extension = file_name.lower().split(".")[-1] if "." in file_name else ""

    if normalized_mime == "application/pdf" or extension == "pdf":
        text = _extract_pdf_text(payload)
        if text:
            return text
        raise ValueError("PDF was uploaded, but no readable text was found.")

    if extension in _DOCX_EXTENSIONS:
        text = _extract_docx_text(payload)
        if text:
            return text
        raise ValueError("DOCX was uploaded, but no readable text was found.")

    if (
        normalized_mime.startswith("text/")
        or normalized_mime in {"application/json", "application/xml", "application/csv"}
        or extension in _TEXT_EXTENSIONS
    ):
        decoded = payload.decode("utf-8", errors="ignore").strip()
        if not decoded:
            decoded = payload.decode("latin-1", errors="ignore").strip()
        if not decoded:
            raise ValueError("Text file is empty.")
        if extension in {"html", "htm"} or "html" in normalized_mime:
            return _strip_html(decoded)
        return decoded

    raise ValueError(
        "Unsupported file format for AI training. Supported: PDF, DOCX, TXT, MD, CSV, JSON, XML, HTML."
    )


def _chunk_text(text: str, max_chars: int = 1200, overlap: int = 180) -> list[str]:
    normalized = re.sub(r"\s+", " ", (text or "").strip())
    if not normalized:
        return []

    # Split on punctuation/newline boundaries to keep chunks semantically coherent.
    pieces = re.split(r"(?<=[\.\!\?\;\:])\s+", normalized)
    chunks: list[str] = []
    current = ""

    for piece in pieces:
        piece = piece.strip()
        if not piece:
            continue
        candidate = f"{current} {piece}".strip() if current else piece
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            chunks.append(current)
        if len(piece) <= max_chars:
            current = piece
        else:
            # Hard split very long sentences.
            start = 0
            while start < len(piece):
                end = min(len(piece), start + max_chars)
                chunks.append(piece[start:end].strip())
                start = max(0, end - overlap)
            current = ""

    if current:
        chunks.append(current)

    return [chunk for chunk in chunks if chunk]


def _extract_keywords(text: str, limit: int = 12) -> list[str]:
    counts: dict[str, int] = {}
    for token in _tokenize_text(text):
        if token in _STOPWORDS:
            continue
        counts[token] = counts.get(token, 0) + 1
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [token for token, _ in ordered[:limit]]


def _estimate_token_count(text: str) -> int:
    return max(1, int(len(text) / 4))


def _source_summary(text: str, fallback_title: str) -> str:
    normalized = re.sub(r"\s+", " ", (text or "").strip())
    if not normalized:
        return fallback_title
    return normalized[:260] + ("..." if len(normalized) > 260 else "")


def _word_count(text: str) -> int:
    return len([word for word in re.split(r"\s+", (text or "").strip()) if word])


def _mark_profile_trained(db: Session, section: str) -> None:
    profile = _ensure_ai_trainer_profile(db, section)
    profile.last_trained_at = datetime.now()


def _rebuild_source_chunks(db: Session, source: AITrainerSource, text: str) -> AITrainerSource:
    db.query(AITrainerChunk).filter(AITrainerChunk.source_id == source.id).delete(synchronize_session=False)

    chunks = _chunk_text(text)
    source.chunk_count = len(chunks)
    source.word_count = _word_count(text)
    source.raw_text = text
    source.summary = _source_summary(text, source.title)
    source.content_hash = hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()

    for idx, chunk in enumerate(chunks):
        keywords = _extract_keywords(chunk)
        db.add(
            AITrainerChunk(
                source_id=source.id,
                section=source.section,
                chunk_index=idx,
                content=chunk,
                keywords=",".join(keywords),
                token_estimate=_estimate_token_count(chunk),
            )
        )

    source.status = "ready"
    source.error_message = None
    source.updated_at = datetime.now()
    _mark_profile_trained(db, source.section)
    return source


def _ensure_ai_trainer_profile(db: Session, section: str) -> AITrainerProfile:
    normalized_section = _normalize_section(section)
    profile = (
        db.query(AITrainerProfile)
        .filter(AITrainerProfile.section == normalized_section)
        .first()
    )
    if profile:
        return profile

    profile = AITrainerProfile(
        section=normalized_section,
        provider="auto",
        model=None,
        system_instructions="",
        temperature=0.2,
        max_context_chars=12000,
        is_enabled=True,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def get_ai_trainer_profile(db: Session, section: str) -> AITrainerProfile:
    return _ensure_ai_trainer_profile(db, section)


def get_ai_trainer_profiles(db: Session) -> List[dict]:
    for section in _AI_TRAINER_SECTIONS:
        _ensure_ai_trainer_profile(db, section)

    profiles = (
        db.query(AITrainerProfile)
        .order_by(AITrainerProfile.section.asc())
        .all()
    )

    source_rows = (
        db.query(
            AITrainerSource.section,
            func.count(AITrainerSource.id),
        )
        .group_by(AITrainerSource.section)
        .all()
    )
    ready_rows = (
        db.query(
            AITrainerSource.section,
            func.count(AITrainerSource.id),
        )
        .filter(AITrainerSource.status == "ready")
        .group_by(AITrainerSource.section)
        .all()
    )
    chunk_rows = (
        db.query(AITrainerChunk.section, func.count(AITrainerChunk.id))
        .group_by(AITrainerChunk.section)
        .all()
    )

    source_totals = {row[0]: int(row[1] or 0) for row in source_rows}
    source_ready = {row[0]: int(row[1] or 0) for row in ready_rows}
    chunk_stats = {row[0]: int(row[1] or 0) for row in chunk_rows}

    response: list[dict] = []
    for profile in profiles:
        stats = {
            "total": source_totals.get(profile.section, 0),
            "ready": source_ready.get(profile.section, 0),
        }
        response.append(
            {
                **admin_schemas.AITrainerProfileOut.model_validate(profile).model_dump(),
                "sources_total": stats["total"],
                "sources_ready": stats["ready"],
                "chunks_total": chunk_stats.get(profile.section, 0),
            }
        )
    return response


def update_ai_trainer_profile(
    db: Session,
    section: str,
    data: admin_schemas.AITrainerProfileUpdate,
) -> AITrainerProfile:
    profile = _ensure_ai_trainer_profile(db, section)
    updates = data.model_dump(exclude_unset=True)

    if "provider" in updates:
        updates["provider"] = _normalize_provider(updates["provider"])
    if "model" in updates and updates["model"] is not None:
        updates["model"] = updates["model"].strip() or None
    if "system_instructions" in updates and updates["system_instructions"] is not None:
        updates["system_instructions"] = updates["system_instructions"].strip()
    if "temperature" in updates and updates["temperature"] is not None:
        value = float(updates["temperature"])
        if value < 0 or value > 1:
            raise ValueError("temperature must be between 0 and 1.")
        updates["temperature"] = value
    if "max_context_chars" in updates and updates["max_context_chars"] is not None:
        value = int(updates["max_context_chars"])
        if value < 2000 or value > 80000:
            raise ValueError("max_context_chars must be between 2000 and 80000.")
        updates["max_context_chars"] = value

    for key, value in updates.items():
        setattr(profile, key, value)

    db.commit()
    db.refresh(profile)
    return profile


def list_ai_trainer_sources(db: Session, section: str, limit: int = 200) -> List[AITrainerSource]:
    normalized_section = _normalize_section(section)
    return (
        db.query(AITrainerSource)
        .filter(AITrainerSource.section == normalized_section)
        .order_by(AITrainerSource.updated_at.desc(), AITrainerSource.id.desc())
        .limit(limit)
        .all()
    )


def create_ai_trainer_source_from_text(
    db: Session,
    data: admin_schemas.AITrainerSourceCreateText,
) -> AITrainerSource:
    section = _normalize_section(data.section)
    title = (data.title or "").strip() or f"{section.title()} training note"
    text = (data.text or "").strip()
    if len(text) < 30:
        raise ValueError("Text source must be at least 30 characters.")

    source = AITrainerSource(
        section=section,
        source_type="text",
        title=title,
        status="processing",
    )
    db.add(source)
    db.flush()
    _rebuild_source_chunks(db, source, text)
    db.commit()
    db.refresh(source)
    return source


def create_ai_trainer_source_from_url(
    db: Session,
    data: admin_schemas.AITrainerSourceCreateURL,
) -> AITrainerSource:
    section = _normalize_section(data.section)
    url = (data.url or "").strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise ValueError("URL must start with http:// or https://")

    title = (data.title or "").strip() or url
    source = AITrainerSource(
        section=section,
        source_type="url",
        title=title,
        source_url=url,
        status="processing",
    )
    db.add(source)
    db.flush()

    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            response = client.get(
                url,
                headers={"User-Agent": "Benela-AI-Trainer/1.0 (+https://benela.dev)"},
            )
            response.raise_for_status()
            body = response.text
    except Exception as exc:
        source.status = "failed"
        source.error_message = f"Could not fetch website: {exc}"
        db.commit()
        db.refresh(source)
        return source

    extracted_title = ""
    title_match = re.search(r"<title[^>]*>(.*?)</title>", body, flags=re.IGNORECASE | re.DOTALL)
    if title_match:
        extracted_title = re.sub(r"\s+", " ", html_lib.unescape(title_match.group(1))).strip()

    text = _strip_html(body)
    if len(text) < 80:
        source.status = "failed"
        source.error_message = "Website fetched, but no readable text content was extracted."
        db.commit()
        db.refresh(source)
        return source

    if not data.title and extracted_title:
        source.title = extracted_title[:255]
    source.metadata_json = json.dumps({"source_url": str(response.url), "status_code": response.status_code})
    _rebuild_source_chunks(db, source, text)
    db.commit()
    db.refresh(source)
    return source


def create_ai_trainer_source_from_file(
    db: Session,
    section: str,
    file_name: str,
    mime_type: str | None,
    payload: bytes,
    title: str | None = None,
) -> AITrainerSource:
    normalized_section = _normalize_section(section)
    source = AITrainerSource(
        section=normalized_section,
        source_type="file",
        title=(title or "").strip() or file_name,
        file_name=file_name,
        mime_type=(mime_type or "").strip() or None,
        status="processing",
    )
    db.add(source)
    db.flush()

    try:
        text = _extract_text_from_file(payload, file_name=file_name, mime_type=mime_type)
        _rebuild_source_chunks(db, source, text)
    except Exception as exc:
        source.status = "failed"
        source.error_message = str(exc)

    db.commit()
    db.refresh(source)
    return source


def reindex_ai_trainer_source(db: Session, source_id: int) -> AITrainerSource | None:
    source = db.query(AITrainerSource).filter(AITrainerSource.id == source_id).first()
    if not source:
        return None
    if not source.raw_text:
        source.status = "failed"
        source.error_message = "No raw text content found to reindex."
        db.commit()
        db.refresh(source)
        return source

    _rebuild_source_chunks(db, source, source.raw_text)
    db.commit()
    db.refresh(source)
    return source


def delete_ai_trainer_source(db: Session, source_id: int) -> bool:
    source = db.query(AITrainerSource).filter(AITrainerSource.id == source_id).first()
    if not source:
        return False
    section = source.section
    db.delete(source)
    _mark_profile_trained(db, section)
    db.commit()
    return True


def get_ai_trainer_runtime_profile(db: Session, section: str) -> AITrainerProfile | None:
    normalized_section = (section or "").strip().lower()
    if normalized_section not in _AI_TRAINER_SECTIONS:
        return None
    return (
        db.query(AITrainerProfile)
        .filter(AITrainerProfile.section == normalized_section)
        .first()
    )


def _score_chunk_relevance(content: str, query_tokens: list[str], full_query: str) -> int:
    if not content:
        return 0
    content_lower = content.lower()
    score = 0
    if full_query and full_query in content_lower:
        score += 10
    for token in query_tokens:
        hits = content_lower.count(token)
        if hits:
            score += min(5, hits)
    return score


def get_ai_trainer_training_context(
    db: Session,
    section: str,
    query: str,
    max_context_chars: int = 12000,
    max_chunks: int = 8,
) -> str:
    normalized_section = (section or "").strip().lower()
    if normalized_section not in _AI_TRAINER_SECTIONS:
        return ""

    query_tokens = [token for token in _tokenize_text(query) if token not in _STOPWORDS]
    query_phrase = " ".join(query_tokens).strip()

    rows = (
        db.query(AITrainerChunk, AITrainerSource)
        .join(AITrainerSource, AITrainerSource.id == AITrainerChunk.source_id)
        .filter(
            AITrainerChunk.section == normalized_section,
            AITrainerSource.status == "ready",
        )
        .all()
    )

    ranked: list[tuple[int, AITrainerChunk, AITrainerSource]] = []
    for chunk, source in rows:
        score = _score_chunk_relevance(chunk.content, query_tokens, query_phrase)
        if score > 0:
            ranked.append((score, chunk, source))

    if not ranked:
        # Fallback: most recent chunks when no lexical match.
        fallback_rows = (
            db.query(AITrainerChunk, AITrainerSource)
            .join(AITrainerSource, AITrainerSource.id == AITrainerChunk.source_id)
            .filter(
                AITrainerChunk.section == normalized_section,
                AITrainerSource.status == "ready",
            )
            .order_by(AITrainerChunk.created_at.desc(), AITrainerChunk.id.desc())
            .limit(max_chunks)
            .all()
        )
        ranked = [(1, chunk, source) for chunk, source in fallback_rows]
    else:
        ranked.sort(key=lambda item: item[0], reverse=True)

    selected = ranked[:max_chunks]
    if not selected:
        return ""

    lines = [
        "SECTION TRAINING KNOWLEDGE (curated by super admin; prioritize this when relevant):"
    ]
    current_len = len(lines[0])
    for _, chunk, source in selected:
        citation = source.title
        if source.source_url:
            citation = f"{citation} ({source.source_url})"
        block = f"\n[Source: {citation}]\n{chunk.content}\n"
        if current_len + len(block) > max_context_chars:
            break
        lines.append(block)
        current_len += len(block)

    return "\n".join(lines).strip()
