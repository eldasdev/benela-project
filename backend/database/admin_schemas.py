from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from database.models import (
    PlanTier,
    PlanStatus,
    PaymentStatus,
    NotificationType,
    NotificationTarget,
)


# ── ClientOrg ─────────────────────────────────────────
class ClientCreate(BaseModel):
    name: str
    slug: str
    owner_name: str
    owner_email: str
    owner_phone: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    owner_phone: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    country: Optional[str] = None
    is_active: Optional[bool] = None
    is_suspended: Optional[bool] = None
    notes: Optional[str] = None


class ClientOut(BaseModel):
    id: int
    name: str
    slug: str
    owner_name: str
    owner_email: str
    owner_phone: Optional[str]
    industry: Optional[str]
    company_size: Optional[str]
    country: Optional[str]
    is_active: bool
    is_suspended: bool
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Subscription ─────────────────────────────────────
class SubscriptionCreate(BaseModel):
    client_id: int
    plan_tier: PlanTier
    status: PlanStatus = PlanStatus.trial
    price_monthly: float = 0
    seats: int = 10
    modules: str = "finance,hr"
    billing_cycle: str = "monthly"
    trial_ends_at: Optional[datetime] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None


class SubscriptionUpdate(BaseModel):
    plan_tier: Optional[PlanTier] = None
    status: Optional[PlanStatus] = None
    price_monthly: Optional[float] = None
    seats: Optional[int] = None
    modules: Optional[str] = None
    billing_cycle: Optional[str] = None
    trial_ends_at: Optional[datetime] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None


class SubscriptionOut(BaseModel):
    id: int
    client_id: int
    plan_tier: PlanTier
    status: PlanStatus
    price_monthly: float
    seats: int
    modules: str
    billing_cycle: str
    trial_ends_at: Optional[datetime]
    current_period_start: Optional[datetime]
    current_period_end: Optional[datetime]
    cancelled_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Payment ───────────────────────────────────────────
class PaymentCreate(BaseModel):
    client_id: int
    subscription_id: Optional[int] = None
    amount: float
    currency: str = "USD"
    status: PaymentStatus = PaymentStatus.pending
    payment_method: Optional[str] = None
    description: Optional[str] = None
    invoice_number: Optional[str] = None
    transaction_id: Optional[str] = None
    paid_at: Optional[datetime] = None


class PaymentStatusUpdate(BaseModel):
    status: PaymentStatus
    paid_at: Optional[datetime] = None


class PaymentOut(BaseModel):
    id: int
    client_id: int
    subscription_id: Optional[int]
    amount: float
    currency: str
    status: PaymentStatus
    payment_method: Optional[str]
    transaction_id: Optional[str]
    description: Optional[str]
    invoice_number: Optional[str]
    paid_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Notification ─────────────────────────────────────
class NotificationCreate(BaseModel):
    title: str
    message: str
    type: NotificationType = NotificationType.info
    target: NotificationTarget = NotificationTarget.all
    target_value: Optional[str] = None


class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    type: NotificationType
    target: NotificationTarget
    target_value: Optional[str]
    is_sent: bool
    sent_at: Optional[datetime]
    recipient_count: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Activity ─────────────────────────────────────────
class ActivityOut(BaseModel):
    id: int
    client_id: int
    action: str
    actor: Optional[str]
    metadata: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class CancelSubscriptionBody(BaseModel):
    reason: Optional[str] = None
