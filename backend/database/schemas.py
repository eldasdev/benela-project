from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from database.models import (
    TransactionType,
    TransactionStatus,
    EmployeeStatus,
    PositionStatus,
    SalesProductStatus,
    SalesOrderStatus,
    SalesOrderChannel,
    SupportTicketStatus,
    SupportTicketPriority,
    SupportTicketChannel,
    SupplyChainItemStatus,
    SupplyChainShipmentDirection,
    SupplyChainShipmentStatus,
    ProcurementRequestStatus,
    ProcurementRequestPriority,
    InsightReportStatus,
    MarketingCampaignStatus,
    MarketingObjective,
    MarketingContentType,
    MarketingContentStatus,
    MarketingLeadStatus,
    LegalDocumentSource,
    LegalDocumentStatus,
    LegalContractStatus,
    LegalRiskLevel,
    LegalTaskStatus,
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


# ── Sales Schemas ─────────────────────────────────────
class SalesProductCreate(BaseModel):
    sku: str
    name: str
    category: str = "general"
    brand: Optional[str] = None
    description: Optional[str] = None
    status: SalesProductStatus = SalesProductStatus.active
    is_current: bool = True
    unit_price: float = 0
    unit_cost: float = 0
    stock_qty: int = 0
    reorder_level: int = 0
    location: Optional[str] = None
    image_url: Optional[str] = None
    tags: Optional[str] = None


class SalesProductUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    status: Optional[SalesProductStatus] = None
    is_current: Optional[bool] = None
    unit_price: Optional[float] = None
    unit_cost: Optional[float] = None
    stock_qty: Optional[int] = None
    reorder_level: Optional[int] = None
    location: Optional[str] = None
    image_url: Optional[str] = None
    tags: Optional[str] = None


class SalesProductOut(BaseModel):
    id: int
    sku: str
    name: str
    category: str
    brand: Optional[str]
    description: Optional[str]
    status: SalesProductStatus
    is_current: bool
    unit_price: float
    unit_cost: float
    stock_qty: int
    reorder_level: int
    location: Optional[str]
    image_url: Optional[str]
    tags: Optional[str]
    total_sold_units: int
    total_revenue: float
    last_sold_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SalesOrderItemIn(BaseModel):
    product_id: Optional[int] = None
    sku: Optional[str] = None
    product_name: Optional[str] = None
    quantity: int = Field(default=1, ge=1)
    unit_price: Optional[float] = None
    unit_cost: Optional[float] = None
    line_discount: float = 0


class SalesOrderItemOut(BaseModel):
    id: int
    order_id: int
    product_id: Optional[int]
    sku: str
    product_name: str
    quantity: int
    unit_price: float
    unit_cost: float
    line_discount: float
    line_total: float
    created_at: datetime

    class Config:
        from_attributes = True


class SalesOrderCreate(BaseModel):
    order_number: str
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    channel: SalesOrderChannel = SalesOrderChannel.online
    status: SalesOrderStatus = SalesOrderStatus.pending
    currency: str = "USD"
    discount_total: float = 0
    tax_total: float = 0
    shipping_total: float = 0
    order_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    items: list[SalesOrderItemIn] = Field(default_factory=list)


class SalesOrderUpdate(BaseModel):
    order_number: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    channel: Optional[SalesOrderChannel] = None
    status: Optional[SalesOrderStatus] = None
    currency: Optional[str] = None
    discount_total: Optional[float] = None
    tax_total: Optional[float] = None
    shipping_total: Optional[float] = None
    order_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    fulfilled_at: Optional[datetime] = None
    notes: Optional[str] = None
    items: Optional[list[SalesOrderItemIn]] = None


class SalesOrderOut(BaseModel):
    id: int
    order_number: str
    customer_name: str
    customer_email: Optional[str]
    customer_phone: Optional[str]
    channel: SalesOrderChannel
    status: SalesOrderStatus
    currency: str
    subtotal: float
    discount_total: float
    tax_total: float
    shipping_total: float
    total: float
    order_date: datetime
    due_date: Optional[datetime]
    fulfilled_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    items: list[SalesOrderItemOut]

    class Config:
        from_attributes = True


class SalesInventoryAdjustmentCreate(BaseModel):
    product_id: int
    change_qty: int
    reason: str = "manual_adjustment"
    reference: Optional[str] = None
    notes: Optional[str] = None
    actor: Optional[str] = None


class SalesInventoryAdjustmentOut(BaseModel):
    id: int
    product_id: int
    order_id: Optional[int]
    change_qty: int
    reason: str
    reference: Optional[str]
    notes: Optional[str]
    actor: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Support Schemas ───────────────────────────────────
class SupportTicketCreate(BaseModel):
    ticket_number: str
    subject: str
    customer_name: str
    customer_email: Optional[str] = None
    channel: SupportTicketChannel = SupportTicketChannel.portal
    module: Optional[str] = None
    priority: SupportTicketPriority = SupportTicketPriority.medium
    status: SupportTicketStatus = SupportTicketStatus.open
    assignee: Optional[str] = None
    first_response_at: Optional[datetime] = None
    sla_due_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    satisfaction_score: Optional[int] = None
    notes: Optional[str] = None


class SupportTicketUpdate(BaseModel):
    ticket_number: Optional[str] = None
    subject: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    channel: Optional[SupportTicketChannel] = None
    module: Optional[str] = None
    priority: Optional[SupportTicketPriority] = None
    status: Optional[SupportTicketStatus] = None
    assignee: Optional[str] = None
    first_response_at: Optional[datetime] = None
    sla_due_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    satisfaction_score: Optional[int] = None
    notes: Optional[str] = None


class SupportTicketOut(BaseModel):
    id: int
    ticket_number: str
    subject: str
    customer_name: str
    customer_email: Optional[str]
    channel: SupportTicketChannel
    module: Optional[str]
    priority: SupportTicketPriority
    status: SupportTicketStatus
    assignee: Optional[str]
    first_response_at: Optional[datetime]
    sla_due_at: Optional[datetime]
    resolved_at: Optional[datetime]
    satisfaction_score: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Supply Chain Schemas ──────────────────────────────
class SupplyChainItemCreate(BaseModel):
    sku: str
    name: str
    category: str = "general"
    supplier: Optional[str] = None
    warehouse: Optional[str] = None
    status: SupplyChainItemStatus = SupplyChainItemStatus.healthy
    on_hand_qty: int = 0
    reserved_qty: int = 0
    safety_stock: int = 0
    reorder_point: int = 0
    lead_time_days: int = 0
    unit_cost: float = 0
    last_received_at: Optional[datetime] = None
    notes: Optional[str] = None


class SupplyChainItemUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    warehouse: Optional[str] = None
    status: Optional[SupplyChainItemStatus] = None
    on_hand_qty: Optional[int] = None
    reserved_qty: Optional[int] = None
    safety_stock: Optional[int] = None
    reorder_point: Optional[int] = None
    lead_time_days: Optional[int] = None
    unit_cost: Optional[float] = None
    last_received_at: Optional[datetime] = None
    notes: Optional[str] = None


class SupplyChainItemOut(BaseModel):
    id: int
    sku: str
    name: str
    category: str
    supplier: Optional[str]
    warehouse: Optional[str]
    status: SupplyChainItemStatus
    on_hand_qty: int
    reserved_qty: int
    safety_stock: int
    reorder_point: int
    lead_time_days: int
    unit_cost: float
    last_received_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SupplyChainShipmentCreate(BaseModel):
    shipment_ref: str
    direction: SupplyChainShipmentDirection = SupplyChainShipmentDirection.inbound
    status: SupplyChainShipmentStatus = SupplyChainShipmentStatus.planned
    partner: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    eta: Optional[datetime] = None
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    freight_cost: float = 0
    notes: Optional[str] = None


class SupplyChainShipmentUpdate(BaseModel):
    shipment_ref: Optional[str] = None
    direction: Optional[SupplyChainShipmentDirection] = None
    status: Optional[SupplyChainShipmentStatus] = None
    partner: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    eta: Optional[datetime] = None
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    freight_cost: Optional[float] = None
    notes: Optional[str] = None


class SupplyChainShipmentOut(BaseModel):
    id: int
    shipment_ref: str
    direction: SupplyChainShipmentDirection
    status: SupplyChainShipmentStatus
    partner: Optional[str]
    origin: Optional[str]
    destination: Optional[str]
    eta: Optional[datetime]
    shipped_at: Optional[datetime]
    delivered_at: Optional[datetime]
    freight_cost: float
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Procurement Schemas ───────────────────────────────
class ProcurementRequestCreate(BaseModel):
    request_number: str
    title: str
    department: Optional[str] = None
    requester: Optional[str] = None
    supplier: Optional[str] = None
    status: ProcurementRequestStatus = ProcurementRequestStatus.draft
    priority: ProcurementRequestPriority = ProcurementRequestPriority.medium
    amount: float = 0
    currency: str = "USD"
    due_date: Optional[datetime] = None
    approved_by: Optional[str] = None
    ordered_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    notes: Optional[str] = None


class ProcurementRequestUpdate(BaseModel):
    request_number: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    requester: Optional[str] = None
    supplier: Optional[str] = None
    status: Optional[ProcurementRequestStatus] = None
    priority: Optional[ProcurementRequestPriority] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    due_date: Optional[datetime] = None
    approved_by: Optional[str] = None
    ordered_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    notes: Optional[str] = None


class ProcurementRequestOut(BaseModel):
    id: int
    request_number: str
    title: str
    department: Optional[str]
    requester: Optional[str]
    supplier: Optional[str]
    status: ProcurementRequestStatus
    priority: ProcurementRequestPriority
    amount: float
    currency: str
    due_date: Optional[datetime]
    approved_by: Optional[str]
    ordered_at: Optional[datetime]
    received_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Insights Schemas ──────────────────────────────────
class InsightReportCreate(BaseModel):
    name: str
    report_type: str = "executive"
    owner: Optional[str] = None
    status: InsightReportStatus = InsightReportStatus.draft
    schedule: Optional[str] = None
    kpi_target: Optional[str] = None
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    summary: Optional[str] = None
    config_json: Optional[str] = None


class InsightReportUpdate(BaseModel):
    name: Optional[str] = None
    report_type: Optional[str] = None
    owner: Optional[str] = None
    status: Optional[InsightReportStatus] = None
    schedule: Optional[str] = None
    kpi_target: Optional[str] = None
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    summary: Optional[str] = None
    config_json: Optional[str] = None


class InsightReportOut(BaseModel):
    id: int
    name: str
    report_type: str
    owner: Optional[str]
    status: InsightReportStatus
    schedule: Optional[str]
    kpi_target: Optional[str]
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    summary: Optional[str]
    config_json: Optional[str]
    created_at: datetime
    updated_at: datetime

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


# ── Legal Schemas ──────────────────────────────────────
class LegalDocumentCreate(BaseModel):
    title: str
    document_number: Optional[str] = None
    jurisdiction: str = "Uzbekistan"
    category: str = "general"
    issuing_authority: Optional[str] = None
    source: LegalDocumentSource = LegalDocumentSource.internal
    status: LegalDocumentStatus = LegalDocumentStatus.active
    source_url: Optional[str] = None
    summary: Optional[str] = None
    full_text: Optional[str] = None
    tags: Optional[str] = None
    published_at: Optional[datetime] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    last_reviewed_at: Optional[datetime] = None


class LegalDocumentUpdate(BaseModel):
    title: Optional[str] = None
    document_number: Optional[str] = None
    jurisdiction: Optional[str] = None
    category: Optional[str] = None
    issuing_authority: Optional[str] = None
    source: Optional[LegalDocumentSource] = None
    status: Optional[LegalDocumentStatus] = None
    source_url: Optional[str] = None
    summary: Optional[str] = None
    full_text: Optional[str] = None
    tags: Optional[str] = None
    published_at: Optional[datetime] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    last_reviewed_at: Optional[datetime] = None


class LegalDocumentOut(BaseModel):
    id: int
    title: str
    document_number: Optional[str]
    jurisdiction: str
    category: str
    issuing_authority: Optional[str]
    source: LegalDocumentSource
    status: LegalDocumentStatus
    source_url: Optional[str]
    summary: Optional[str]
    full_text: Optional[str]
    tags: Optional[str]
    published_at: Optional[datetime]
    effective_from: Optional[datetime]
    effective_to: Optional[datetime]
    last_reviewed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LegalContractCreate(BaseModel):
    contract_ref: Optional[str] = None
    title: str
    counterparty: str
    owner: Optional[str] = None
    status: LegalContractStatus = LegalContractStatus.draft
    risk_level: LegalRiskLevel = LegalRiskLevel.medium
    value_amount: float = 0
    currency: str = "USD"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    renewal_date: Optional[datetime] = None
    governing_law: Optional[str] = None
    document_id: Optional[int] = None
    notes: Optional[str] = None


class LegalContractUpdate(BaseModel):
    contract_ref: Optional[str] = None
    title: Optional[str] = None
    counterparty: Optional[str] = None
    owner: Optional[str] = None
    status: Optional[LegalContractStatus] = None
    risk_level: Optional[LegalRiskLevel] = None
    value_amount: Optional[float] = None
    currency: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    renewal_date: Optional[datetime] = None
    governing_law: Optional[str] = None
    document_id: Optional[int] = None
    notes: Optional[str] = None


class LegalContractOut(BaseModel):
    id: int
    contract_ref: Optional[str]
    title: str
    counterparty: str
    owner: Optional[str]
    status: LegalContractStatus
    risk_level: LegalRiskLevel
    value_amount: float
    currency: str
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    renewal_date: Optional[datetime]
    governing_law: Optional[str]
    document_id: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LegalComplianceTaskCreate(BaseModel):
    title: str
    framework: Optional[str] = None
    owner: Optional[str] = None
    status: LegalTaskStatus = LegalTaskStatus.open
    risk_level: LegalRiskLevel = LegalRiskLevel.medium
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    related_document_id: Optional[int] = None
    related_contract_id: Optional[int] = None
    description: Optional[str] = None
    remediation_plan: Optional[str] = None


class LegalComplianceTaskUpdate(BaseModel):
    title: Optional[str] = None
    framework: Optional[str] = None
    owner: Optional[str] = None
    status: Optional[LegalTaskStatus] = None
    risk_level: Optional[LegalRiskLevel] = None
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    related_document_id: Optional[int] = None
    related_contract_id: Optional[int] = None
    description: Optional[str] = None
    remediation_plan: Optional[str] = None


class LegalComplianceTaskOut(BaseModel):
    id: int
    title: str
    framework: Optional[str]
    owner: Optional[str]
    status: LegalTaskStatus
    risk_level: LegalRiskLevel
    due_date: Optional[datetime]
    completed_at: Optional[datetime]
    related_document_id: Optional[int]
    related_contract_id: Optional[int]
    description: Optional[str]
    remediation_plan: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LegalSearchDocument(BaseModel):
    id: Optional[int] = None
    title: str
    document_number: Optional[str] = None
    jurisdiction: str
    category: str
    source: str
    source_url: Optional[str] = None
    published_at: Optional[datetime] = None
    excerpt: Optional[str] = None
    relevance_score: float = 0


class LegalSearchResponse(BaseModel):
    query: str
    provider: str
    total: int
    documents: list[LegalSearchDocument]
    generated_at: datetime


class LegalRecommendationRequest(BaseModel):
    query: str
    model: Optional[str] = None
    provider: Optional[str] = None
    jurisdiction: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    top_k: int = 5
    response_language: Optional[str] = "uz"
    instructions: Optional[str] = None


class LegalRecommendationResponse(BaseModel):
    query: str
    provider: str
    recommendation: str
    references: list[LegalSearchDocument]
    model: Optional[str] = None
    confidence: Optional[str] = None
    disclaimer: Optional[str] = None
    generated_at: datetime


class LegalIntegrationStatusResponse(BaseModel):
    configured: bool
    api_key_configured: bool
    live_fallback_enabled: bool
    search_url: Optional[str] = None
    advice_url: Optional[str] = None
    ping_url: Optional[str] = None
    reachable: bool
    service: Optional[str] = None
    checked_at: datetime
    detail: str


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
