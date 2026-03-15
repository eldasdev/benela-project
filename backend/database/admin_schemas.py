from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, Field

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


class AdminClientWorkspaceLegacyClientOut(BaseModel):
    id: int
    name: str
    slug: str
    is_active: bool
    is_suspended: bool

    class Config:
        from_attributes = True


class AdminClientWorkspaceSubscriptionOut(BaseModel):
    id: int
    plan_tier: PlanTier
    status: PlanStatus
    price_monthly: float
    billing_cycle: str
    seats: int
    current_period_end: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class AdminClientWorkspaceDocumentOut(BaseModel):
    id: int
    file_name: str
    mime_type: Optional[str]
    size_bytes: int
    document_type: str
    verification_status: str
    created_at: datetime
    download_url: str


class AdminClientWorkspaceReportOut(BaseModel):
    id: int
    title: str
    message: str
    status: str
    user_id: str
    user_email: Optional[str]
    created_at: datetime
    resolved_at: Optional[datetime]


class AdminClientWorkspaceListOut(BaseModel):
    id: int
    user_id: str
    user_email: Optional[str]
    workspace_id: str
    business_name: str
    business_slug: str
    registration_number: Optional[str]
    owner_name: Optional[str]
    owner_phone: Optional[str]
    country: Optional[str]
    city: Optional[str]
    industry: Optional[str]
    employee_count: Optional[int]
    plan_tier: str
    payment_required: bool
    onboarding_completed: bool
    duplicate_of_account_id: Optional[int]
    linked_client_org_id: Optional[int]
    linked_subscription_id: Optional[int]
    is_suspended: bool
    access_status: str
    access_label: str
    trial_started_at: Optional[datetime]
    trial_ends_at: Optional[datetime]
    trial_seconds_remaining: int
    trial_progress_percent: float
    documents_uploaded_count: int
    open_reports_count: int
    setup_progress_percent: float
    current_mrr: float
    created_at: datetime
    updated_at: datetime


class AdminClientWorkspaceDetailOut(AdminClientWorkspaceListOut):
    address: Optional[str]
    missing_setup_fields: list[str]
    documents: list[AdminClientWorkspaceDocumentOut]
    reports: list[AdminClientWorkspaceReportOut]
    linked_client: Optional[AdminClientWorkspaceLegacyClientOut]
    linked_subscription: Optional[AdminClientWorkspaceSubscriptionOut]


class AdminClientWorkspaceUpdate(BaseModel):
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


class AdminClientWorkspaceDocumentStatusBody(BaseModel):
    verification_status: Literal["pending", "approved", "rejected"]


class AdminClientWorkspaceReportStatusBody(BaseModel):
    status: Literal["open", "reviewing", "resolved", "dismissed"]


# ── Platform Pricing ─────────────────────────────────
class PricingPlanFeatureIn(BaseModel):
    label: str
    included: bool = True


class PricingPlanConfigIn(BaseModel):
    id: str
    name: str
    description: str = ""
    price_monthly: float = Field(default=0, ge=0)
    price_yearly: float = Field(default=0, ge=0)
    users: str = ""
    features: list[PricingPlanFeatureIn] = Field(default_factory=list)
    recommended: bool = False


class PricingPlanConfigOut(PricingPlanConfigIn):
    pass


class PlatformPricingUpdate(BaseModel):
    plans: list[PricingPlanConfigIn] = Field(default_factory=list)


# ── Workspace-Centric Admin Subscriptions ───────────
class AdminWorkspaceSubscriptionRow(BaseModel):
    subscription_id: Optional[int] = None
    account_id: Optional[int] = None
    workspace_id: Optional[str] = None
    business_name: str
    business_slug: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    country: Optional[str] = None
    plan_tier: str
    status: str
    billing_cycle: str
    price_monthly: float
    seats: int
    modules: str
    trial_ends_at: Optional[datetime] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    access_status: str
    onboarding_completed: bool
    payment_required: bool
    documents_uploaded_count: int = 0
    open_reports_count: int = 0
    current_mrr: float = 0
    linked_client_org_id: Optional[int] = None
    is_unlinked_legacy: bool = False
    created_at: datetime


class AdminWorkspaceSubscriptionCreate(BaseModel):
    account_id: int
    plan_tier: str
    status: Optional[str] = None
    price_monthly: float = Field(default=0, ge=0)
    seats: int = Field(default=10, ge=1)
    modules: str = "finance,hr"
    billing_cycle: str = "monthly"
    trial_ends_at: Optional[datetime] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None


class AdminWorkspaceSubscriptionUpdate(BaseModel):
    account_id: Optional[int] = None
    plan_tier: Optional[str] = None
    status: Optional[str] = None
    price_monthly: Optional[float] = Field(default=None, ge=0)
    seats: Optional[int] = Field(default=None, ge=1)
    modules: Optional[str] = None
    billing_cycle: Optional[str] = None
    trial_ends_at: Optional[datetime] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None


# ── Workspace-Centric Admin Payments ────────────────
class AdminWorkspacePaymentRow(BaseModel):
    id: int
    account_id: Optional[int] = None
    workspace_id: Optional[str] = None
    business_name: str
    owner_email: Optional[str] = None
    amount: float
    currency: str
    status: str
    payment_method: Optional[str] = None
    invoice_number: Optional[str] = None
    transaction_id: Optional[str] = None
    description: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime
    linked_subscription_id: Optional[int] = None
    linked_client_org_id: Optional[int] = None
    plan_tier: Optional[str] = None
    is_unlinked_legacy: bool = False


class AdminWorkspacePaymentCreate(BaseModel):
    account_id: int
    amount: float = Field(gt=0)
    currency: str = "USD"
    status: PaymentStatus = PaymentStatus.pending
    payment_method: Optional[str] = None
    description: Optional[str] = None
    invoice_number: Optional[str] = None
    transaction_id: Optional[str] = None
    paid_at: Optional[datetime] = None


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


class NotificationAudiencePreview(BaseModel):
    recipient_count: int
    workspace_ids: list[str] = Field(default_factory=list)


# ── Site Compliances ─────────────────────────────────
class SiteComplianceRow(BaseModel):
    id: int
    account_id: Optional[int] = None
    workspace_id: Optional[str] = None
    business_name: str
    business_slug: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    user_email: Optional[str] = None
    title: str
    message: str
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None
    age_hours: int
    plan_tier: Optional[str] = None
    access_status: Optional[str] = None
    documents_uploaded_count: int = 0
    setup_progress_percent: float = 0


class SiteComplianceDetail(SiteComplianceRow):
    country: Optional[str] = None
    city: Optional[str] = None
    onboarding_completed: bool = False
    payment_required: bool = False
    open_reports_count: int = 0


class SiteComplianceStatusBody(BaseModel):
    status: Literal["open", "reviewing", "resolved", "dismissed"]


class SiteComplianceReplyBody(BaseModel):
    message: str
    title: Optional[str] = None
    type: NotificationType = NotificationType.info
    mark_status: Optional[Literal["open", "reviewing", "resolved", "dismissed"]] = None


class SiteComplianceSummary(BaseModel):
    total: int
    open: int
    reviewing: int
    resolved: int
    dismissed: int
    aging_over_24h: int
    aging_over_72h: int


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
    pricing_plans: Optional[list[PricingPlanConfigIn]] = None


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
    pricing_plans: list[PricingPlanConfigOut] = Field(default_factory=list)
    webhook_signing_secret: Optional[str]
    platform_api_key: Optional[str]
    updated_at: datetime

    class Config:
        from_attributes = True


class PlatformRuntimeStatusOut(BaseModel):
    platform_name: str
    support_email: Optional[str]
    status_page_url: Optional[str]
    maintenance_mode: bool
    allow_new_signups: bool
    allow_marketplace: bool
    allow_plugin_purchases: bool
    updated_at: datetime


# ── Client Workspace Admin ───────────────────────────
class ClientWorkspaceDocumentOut(BaseModel):
    id: int
    file_name: str
    mime_type: Optional[str]
    size_bytes: int
    document_type: str
    verification_status: str
    created_at: datetime
    download_url: str


class ClientWorkspaceReportOut(BaseModel):
    id: int
    title: str
    message: str
    status: str
    user_email: Optional[str]
    created_at: datetime
    resolved_at: Optional[datetime]


class ClientWorkspaceListOut(BaseModel):
    id: int
    user_id: str
    user_email: Optional[str]
    workspace_id: str
    business_name: str
    business_slug: str
    owner_name: Optional[str]
    owner_phone: Optional[str]
    industry: Optional[str]
    country: Optional[str]
    city: Optional[str]
    employee_count: Optional[int]
    plan_tier: str
    monthly_price: float
    onboarding_completed: bool
    payment_required: bool
    is_suspended: bool
    documents_uploaded_count: int
    verified_documents_count: int
    pending_documents_count: int
    reports_total_count: int
    reports_open_count: int
    duplicate_of_account_id: Optional[int]
    lifecycle_status: str
    trial_started_at: Optional[datetime]
    trial_ends_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ClientWorkspaceDetailOut(ClientWorkspaceListOut):
    registration_number: Optional[str]
    address: Optional[str]
    client_org_id: Optional[int]
    subscription_id: Optional[int]
    subscription_status: Optional[str]
    billing_cycle: Optional[str]
    documents: list[ClientWorkspaceDocumentOut]
    reports: list[ClientWorkspaceReportOut]


class ClientWorkspaceSuspendBody(BaseModel):
    suspended: bool


class ClientWorkspaceReportStatusBody(BaseModel):
    status: str


class ClientWorkspaceDocumentStatusBody(BaseModel):
    verification_status: Literal["pending", "verified", "rejected"]


class MaintenanceModeBody(BaseModel):
    enabled: bool


class PlatformAboutHighlight(BaseModel):
    title: str
    description: str
    metric: Optional[str] = None


class PlatformAboutMissionPoint(BaseModel):
    title: str
    description: str


class PlatformAboutTeamMember(BaseModel):
    name: str
    role: str
    bio: str


class PlatformAboutFaqItem(BaseModel):
    question: str
    answer: str


class PlatformAboutPageUpdate(BaseModel):
    hero_eyebrow: Optional[str] = None
    hero_title: Optional[str] = None
    hero_subtitle: Optional[str] = None
    story_title: Optional[str] = None
    story_body: Optional[str] = None
    platform_highlights: Optional[List[PlatformAboutHighlight]] = None
    mission_title: Optional[str] = None
    mission_body: Optional[str] = None
    mission_points: Optional[List[PlatformAboutMissionPoint]] = None
    team_title: Optional[str] = None
    team_body: Optional[str] = None
    team_members: Optional[List[PlatformAboutTeamMember]] = None
    faq_title: Optional[str] = None
    faq_body: Optional[str] = None
    faqs: Optional[List[PlatformAboutFaqItem]] = None


class PlatformAboutPageOut(BaseModel):
    id: int
    hero_eyebrow: str
    hero_title: str
    hero_subtitle: str
    story_title: str
    story_body: str
    platform_highlights: List[PlatformAboutHighlight] = Field(default_factory=list)
    mission_title: str
    mission_body: str
    mission_points: List[PlatformAboutMissionPoint] = Field(default_factory=list)
    team_title: str
    team_body: str
    team_members: List[PlatformAboutTeamMember] = Field(default_factory=list)
    faq_title: str
    faq_body: str
    faqs: List[PlatformAboutFaqItem] = Field(default_factory=list)
    updated_at: datetime

    class Config:
        from_attributes = True


# ── AI Trainer ────────────────────────────────────────
class AITrainerProfileUpdate(BaseModel):
    provider: Optional[Literal["auto", "anthropic", "openai"]] = None
    model: Optional[str] = None
    system_instructions: Optional[str] = None
    temperature: Optional[float] = None
    max_context_chars: Optional[int] = None
    is_enabled: Optional[bool] = None


class AITrainerProfileOut(BaseModel):
    id: int
    section: str
    provider: str
    model: Optional[str]
    system_instructions: Optional[str]
    temperature: float
    max_context_chars: int
    is_enabled: bool
    last_trained_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    sources_total: int = 0
    sources_ready: int = 0
    chunks_total: int = 0

    class Config:
        from_attributes = True


class AITrainerSourceCreateURL(BaseModel):
    section: str
    url: str
    title: Optional[str] = None


class AITrainerSourceCreateText(BaseModel):
    section: str
    title: str
    text: str


class AITrainerSourceOut(BaseModel):
    id: int
    section: str
    source_type: str
    title: str
    source_url: Optional[str]
    file_name: Optional[str]
    mime_type: Optional[str]
    status: str
    summary: Optional[str]
    word_count: int
    chunk_count: int
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
