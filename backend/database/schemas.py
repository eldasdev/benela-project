from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from database.models import (
    TransactionType,
    TransactionStatus,
    EmployeeStatus,
    PositionStatus,
    MarketingCampaignStatus,
    MarketingObjective,
    MarketingContentType,
    MarketingContentStatus,
    MarketingLeadStatus,
    ProjectStatus,
    TaskPriority,
    PluginCategory,
    BillingCycle,
    PurchaseStatus,
    InstallStatus,
)


# ── Finance Schemas ───────────────────────────────────
class TransactionCreate(BaseModel):
    description: str
    category: str
    amount: float
    type: TransactionType
    status: TransactionStatus = TransactionStatus.pending
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[TransactionType] = None
    status: Optional[TransactionStatus] = None
    notes: Optional[str] = None


class TransactionOut(BaseModel):
    id: int
    date: datetime
    description: str
    category: str
    amount: float
    type: TransactionType
    status: TransactionStatus
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class InvoiceCreate(BaseModel):
    invoice_number: str
    client_name: str
    client_email: Optional[str] = None
    amount: float
    tax: float = 0
    status: str = "draft"
    notes: Optional[str] = None


class InvoiceUpdate(BaseModel):
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    amount: Optional[float] = None
    tax: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    client_name: str
    client_email: Optional[str]
    amount: float
    tax: float
    status: str
    issue_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# ── HR Schemas ────────────────────────────────────────
class EmployeeCreate(BaseModel):
    full_name: str
    email: str
    phone: Optional[str] = None
    department: str
    role: str
    salary: Optional[float] = None
    status: EmployeeStatus = EmployeeStatus.active
    notes: Optional[str] = None


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    salary: Optional[float] = None
    status: Optional[EmployeeStatus] = None
    notes: Optional[str] = None


class EmployeeOut(BaseModel):
    id: int
    full_name: str
    email: str
    phone: Optional[str]
    department: str
    role: str
    salary: Optional[float]
    status: EmployeeStatus
    start_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class PositionCreate(BaseModel):
    title: str
    department: str
    description: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    status: PositionStatus = PositionStatus.open


class PositionUpdate(BaseModel):
    title: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    status: Optional[PositionStatus] = None


class PositionOut(BaseModel):
    id: int
    title: str
    department: str
    description: Optional[str]
    salary_min: Optional[float]
    salary_max: Optional[float]
    status: PositionStatus
    opened_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    name: str
    head: Optional[str] = None


class DepartmentOut(BaseModel):
    id: int
    name: str
    head: Optional[str]

    class Config:
        from_attributes = True


# ── Marketing Schemas ─────────────────────────────────
class MarketingCampaignCreate(BaseModel):
    name: str
    channel: str
    objective: MarketingObjective = MarketingObjective.leads
    status: MarketingCampaignStatus = MarketingCampaignStatus.draft
    owner: Optional[str] = None
    budget: float = 0
    spent: float = 0
    revenue: float = 0
    impressions: int = 0
    clicks: int = 0
    conversions: int = 0
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    notes: Optional[str] = None


class MarketingCampaignUpdate(BaseModel):
    name: Optional[str] = None
    channel: Optional[str] = None
    objective: Optional[MarketingObjective] = None
    status: Optional[MarketingCampaignStatus] = None
    owner: Optional[str] = None
    budget: Optional[float] = None
    spent: Optional[float] = None
    revenue: Optional[float] = None
    impressions: Optional[int] = None
    clicks: Optional[int] = None
    conversions: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    notes: Optional[str] = None


class MarketingCampaignOut(BaseModel):
    id: int
    name: str
    channel: str
    objective: MarketingObjective
    status: MarketingCampaignStatus
    owner: Optional[str]
    budget: float
    spent: float
    revenue: float
    impressions: int
    clicks: int
    conversions: int
    start_date: datetime
    end_date: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MarketingContentCreate(BaseModel):
    title: str
    content_type: MarketingContentType = MarketingContentType.social_post
    channel: str
    status: MarketingContentStatus = MarketingContentStatus.idea
    campaign_id: Optional[int] = None
    assignee: Optional[str] = None
    publish_date: Optional[datetime] = None
    asset_url: Optional[str] = None
    cta: Optional[str] = None


class MarketingContentUpdate(BaseModel):
    title: Optional[str] = None
    content_type: Optional[MarketingContentType] = None
    channel: Optional[str] = None
    status: Optional[MarketingContentStatus] = None
    campaign_id: Optional[int] = None
    assignee: Optional[str] = None
    publish_date: Optional[datetime] = None
    asset_url: Optional[str] = None
    cta: Optional[str] = None


class MarketingContentOut(BaseModel):
    id: int
    title: str
    content_type: MarketingContentType
    channel: str
    status: MarketingContentStatus
    campaign_id: Optional[int]
    assignee: Optional[str]
    publish_date: Optional[datetime]
    asset_url: Optional[str]
    cta: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MarketingLeadCreate(BaseModel):
    full_name: str
    email: str
    company: Optional[str] = None
    source_channel: str
    campaign_id: Optional[int] = None
    status: MarketingLeadStatus = MarketingLeadStatus.new
    score: int = 0
    estimated_value: float = 0
    conversion_probability: float = 0
    notes: Optional[str] = None


class MarketingLeadUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    source_channel: Optional[str] = None
    campaign_id: Optional[int] = None
    status: Optional[MarketingLeadStatus] = None
    score: Optional[int] = None
    estimated_value: Optional[float] = None
    conversion_probability: Optional[float] = None
    notes: Optional[str] = None


class MarketingLeadOut(BaseModel):
    id: int
    full_name: str
    email: str
    company: Optional[str]
    source_channel: str
    campaign_id: Optional[int]
    status: MarketingLeadStatus
    score: int
    estimated_value: float
    conversion_probability: float
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MarketingChannelMetricCreate(BaseModel):
    channel: str
    period_label: str = "Current"
    spend: float = 0
    revenue: float = 0
    impressions: int = 0
    clicks: int = 0
    leads: int = 0
    customers: int = 0
    conversions: int = 0
    benchmark_roas: float = 3.0
    benchmark_cvr: float = 2.5
    benchmark_ctr: float = 1.8


class MarketingChannelMetricUpdate(BaseModel):
    channel: Optional[str] = None
    period_label: Optional[str] = None
    spend: Optional[float] = None
    revenue: Optional[float] = None
    impressions: Optional[int] = None
    clicks: Optional[int] = None
    leads: Optional[int] = None
    customers: Optional[int] = None
    conversions: Optional[int] = None
    benchmark_roas: Optional[float] = None
    benchmark_cvr: Optional[float] = None
    benchmark_ctr: Optional[float] = None


class MarketingChannelMetricOut(BaseModel):
    id: int
    channel: str
    period_label: str
    spend: float
    revenue: float
    impressions: int
    clicks: int
    leads: int
    customers: int
    conversions: int
    benchmark_roas: float
    benchmark_cvr: float
    benchmark_ctr: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Projects & Kanban Schemas ────────────────────────
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.active
    color: str = "#7c6aff"
    owner: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    color: Optional[str] = None
    owner: Optional[str] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: ProjectStatus
    color: str
    owner: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ColumnCreate(BaseModel):
    project_id: int
    name: str
    color: str = "#555"
    position: int = 0


class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None


class ColumnOut(BaseModel):
    id: int
    project_id: int
    name: str
    color: str
    position: int

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    column_id: int
    project_id: int
    title: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.medium
    assignee: Optional[str] = None
    tags: Optional[str] = None
    position: int = 0


class TaskUpdate(BaseModel):
    column_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[TaskPriority] = None
    assignee: Optional[str] = None
    tags: Optional[str] = None
    position: Optional[int] = None


class TaskOut(BaseModel):
    id: int
    column_id: int
    project_id: int
    title: str
    description: Optional[str]
    priority: TaskPriority
    assignee: Optional[str]
    tags: Optional[str]
    position: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Marketplace Schemas ───────────────────────────────
class MarketplacePluginCreate(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    vendor: str = "Benela"
    category: PluginCategory = PluginCategory.other
    icon: Optional[str] = None
    tags: Optional[str] = None
    price_monthly: float = 0
    price_yearly: Optional[float] = None
    is_active: bool = True
    is_featured: bool = False


class MarketplacePluginUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    vendor: Optional[str] = None
    category: Optional[PluginCategory] = None
    icon: Optional[str] = None
    tags: Optional[str] = None
    price_monthly: Optional[float] = None
    price_yearly: Optional[float] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None


class MarketplacePluginOut(BaseModel):
    id: int
    slug: str
    name: str
    description: Optional[str]
    vendor: str
    category: PluginCategory
    icon: Optional[str]
    tags: Optional[str]
    price_monthly: float
    price_yearly: Optional[float]
    is_active: bool
    is_featured: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PluginPurchaseCreate(BaseModel):
    workspace_id: str
    plugin_id: int
    billing_cycle: BillingCycle = BillingCycle.monthly
    currency: str = "USD"


class PluginPurchaseOut(BaseModel):
    id: int
    workspace_id: str
    plugin_id: int
    billing_cycle: BillingCycle
    status: PurchaseStatus
    amount: float
    currency: str
    started_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class PluginInstallToggle(BaseModel):
    workspace_id: str
    is_enabled: bool


class PluginInstallOut(BaseModel):
    id: int
    workspace_id: str
    plugin_id: int
    purchase_id: Optional[int]
    status: InstallStatus
    is_enabled: bool
    installed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Chat Schemas ──────────────────────────────────────
class ChatAttachmentCreate(BaseModel):
    file_name: str
    mime_type: Optional[str] = None
    size_bytes: int = 0
    content_excerpt: Optional[str] = None


class ChatAttachmentOut(BaseModel):
    id: int
    file_name: str
    mime_type: Optional[str]
    size_bytes: int
    content_excerpt: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ChatMessageCreate(BaseModel):
    session_id: str
    section: str
    role: str
    content: str
    attachments: list[ChatAttachmentCreate] = Field(default_factory=list)


class ChatMessageOut(BaseModel):
    id: int
    session_id: str
    section: str
    role: str
    content: str
    attachments: list[ChatAttachmentOut] = Field(default_factory=list)
    created_at: datetime

    class Config:
        from_attributes = True


# ── Client Notification Feed ──────────────────────────
class ClientNotificationOut(BaseModel):
    id: int
    title: str
    message: str
    type: str
    target: str
    target_value: Optional[str]
    sent_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True
