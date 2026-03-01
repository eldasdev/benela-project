from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from database.models import (
    ClientOrg,
    Subscription,
    Payment,
    AdminNotification,
    ClientActivity,
    PlanTier,
    PlanStatus,
    PaymentStatus,
    NotificationType,
    NotificationTarget,
)
from database import admin_schemas


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


# ── Activity ───────────────────────────────────────────
def log_activity(db: Session, client_id: int, action: str, actor: Optional[str] = None, metadata: Optional[str] = None):
    a = ClientActivity(client_id=client_id, action=action, actor=actor, metadata=metadata)
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
