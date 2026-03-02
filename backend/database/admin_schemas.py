from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from database.models import (
    PlanTier,
    PlanStatus,
    PaymentStatus,
    PaymentMethodType,
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


class PaymentSummaryOut(BaseModel):
    total_payments: int
    paid_count: int
    pending_count: int
    failed_count: int
    refunded_count: int
    paid_volume: float
    pending_volume: float


class PaymentMethodCreate(BaseModel):
    name: str
    provider: str
    method_type: PaymentMethodType = PaymentMethodType.other
    details: Optional[str] = None
    fee_percent: float = 0
    fee_fixed: float = 0
    supports_refunds: bool = True
    is_active: bool = True
    is_default: bool = False


class PaymentMethodUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    method_type: Optional[PaymentMethodType] = None
    details: Optional[str] = None
    fee_percent: Optional[float] = None
    fee_fixed: Optional[float] = None
    supports_refunds: Optional[bool] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class PaymentMethodOut(BaseModel):
    id: int
    name: str
    provider: str
    method_type: PaymentMethodType
    details: Optional[str]
    fee_percent: float
    fee_fixed: float
    supports_refunds: bool
    is_active: bool
    is_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentMethodStatusBody(BaseModel):
    is_active: bool


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
    actor: Optional[str] = None
    extra_data: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CancelSubscriptionBody(BaseModel):
    reason: Optional[str] = None


# ── Platform Settings ─────────────────────────────────
class PlatformSettingsUpdate(BaseModel):
    platform_name: Optional[str] = None
    support_email: Optional[str] = None
    status_page_url: Optional[str] = None
    default_currency: Optional[str] = None
    default_trial_days: Optional[int] = None
    default_tax_rate: Optional[float] = None
    invoice_prefix: Optional[str] = None
    maintenance_mode: Optional[bool] = None
    allow_new_signups: Optional[bool] = None
    enforce_admin_mfa: Optional[bool] = None
    session_timeout_minutes: Optional[int] = None
    trusted_ip_ranges: Optional[str] = None
    allow_marketplace: Optional[bool] = None
    allow_plugin_purchases: Optional[bool] = None


class PlatformSettingsOut(BaseModel):
    id: int
    platform_name: str
    support_email: Optional[str]
    status_page_url: Optional[str]
    default_currency: str
    default_trial_days: int
    default_tax_rate: float
    invoice_prefix: str
    maintenance_mode: bool
    allow_new_signups: bool
    enforce_admin_mfa: bool
    session_timeout_minutes: int
    trusted_ip_ranges: Optional[str]
    allow_marketplace: bool
    allow_plugin_purchases: bool
    webhook_signing_secret: Optional[str]
    platform_api_key: Optional[str]
    updated_at: datetime

    class Config:
        from_attributes = True


class MaintenanceModeBody(BaseModel):
    enabled: bool
