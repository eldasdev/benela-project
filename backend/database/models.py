from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.connection import Base
import enum

# ── Enums ─────────────────────────────────────────────
class TransactionType(str, enum.Enum):
    income = "income"
    expense = "expense"


class TransactionStatus(str, enum.Enum):
    paid = "paid"
    pending = "pending"
    received = "received"
    overdue = "overdue"


class EmployeeStatus(str, enum.Enum):
    active = "active"
    on_leave = "on_leave"
    terminated = "terminated"


class PositionStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    on_hold = "on_hold"


class SalesProductStatus(str, enum.Enum):
    active = "active"
    low_stock = "low_stock"
    out_of_stock = "out_of_stock"
    discontinued = "discontinued"
    archived = "archived"


class SalesOrderStatus(str, enum.Enum):
    draft = "draft"
    pending = "pending"
    paid = "paid"
    fulfilled = "fulfilled"
    cancelled = "cancelled"
    refunded = "refunded"


class SalesOrderChannel(str, enum.Enum):
    direct = "direct"
    online = "online"
    marketplace = "marketplace"
    partner = "partner"
    wholesale = "wholesale"
    retail = "retail"


class SupportTicketStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    waiting_customer = "waiting_customer"
    resolved = "resolved"
    closed = "closed"


class SupportTicketPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class SupportTicketChannel(str, enum.Enum):
    email = "email"
    chat = "chat"
    phone = "phone"
    portal = "portal"
    social = "social"


class SupplyChainItemStatus(str, enum.Enum):
    healthy = "healthy"
    low_stock = "low_stock"
    out_of_stock = "out_of_stock"
    discontinued = "discontinued"


class SupplyChainShipmentDirection(str, enum.Enum):
    inbound = "inbound"
    outbound = "outbound"


class SupplyChainShipmentStatus(str, enum.Enum):
    planned = "planned"
    in_transit = "in_transit"
    delivered = "delivered"
    delayed = "delayed"
    cancelled = "cancelled"


class ProcurementRequestStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"
    ordered = "ordered"
    partially_received = "partially_received"
    received = "received"
    cancelled = "cancelled"


class ProcurementRequestPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class InsightReportStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    paused = "paused"
    error = "error"


class MarketingCampaignStatus(str, enum.Enum):
    draft = "draft"
    scheduled = "scheduled"
    active = "active"
    paused = "paused"
    completed = "completed"


class MarketingObjective(str, enum.Enum):
    awareness = "awareness"
    traffic = "traffic"
    leads = "leads"
    conversion = "conversion"
    retention = "retention"


class MarketingContentType(str, enum.Enum):
    social_post = "social_post"
    email = "email"
    blog = "blog"
    landing_page = "landing_page"
    ad_creative = "ad_creative"
    video = "video"
    webinar = "webinar"


class MarketingContentStatus(str, enum.Enum):
    idea = "idea"
    in_production = "in_production"
    scheduled = "scheduled"
    published = "published"
    archived = "archived"


class MarketingLeadStatus(str, enum.Enum):
    new = "new"
    mql = "mql"
    sql = "sql"
    opportunity = "opportunity"
    customer = "customer"
    disqualified = "disqualified"


class LegalDocumentSource(str, enum.Enum):
    internal = "internal"
    lex_uz = "lex_uz"
    uploaded = "uploaded"
    external = "external"


class LegalDocumentStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    superseded = "superseded"
    archived = "archived"


class LegalContractStatus(str, enum.Enum):
    draft = "draft"
    in_review = "in_review"
    active = "active"
    expiring = "expiring"
    expired = "expired"
    terminated = "terminated"


class LegalRiskLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class LegalTaskStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    blocked = "blocked"
    completed = "completed"


class ProjectStatus(str, enum.Enum):
    active = "active"
    on_hold = "on_hold"
    completed = "completed"
    archived = "archived"


class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


# ── Finance Models ────────────────────────────────────
class Transaction(Base):
    __tablename__ = "transactions"
    id          = Column(Integer, primary_key=True, index=True)
    date        = Column(DateTime, default=func.now())
    description = Column(String(255), nullable=False)
    category    = Column(String(100), nullable=False)
    amount      = Column(Float, nullable=False)
    type        = Column(Enum(TransactionType), nullable=False)
    status      = Column(Enum(TransactionStatus), default=TransactionStatus.pending)
    notes       = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=func.now())
    updated_at  = Column(DateTime, default=func.now(), onupdate=func.now())

class Invoice(Base):
    __tablename__ = "invoices"
    id             = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(50), unique=True, nullable=False)
    client_name    = Column(String(255), nullable=False)
    client_email   = Column(String(255), nullable=True)
    amount         = Column(Float, nullable=False)
    tax            = Column(Float, default=0)
    status         = Column(String(50), default="draft")
    issue_date     = Column(DateTime, default=func.now())
    due_date       = Column(DateTime, nullable=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=func.now())

# ── HR Models ─────────────────────────────────────────
class Department(Base):
    __tablename__ = "departments"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False, unique=True)
    head       = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=func.now())

class Employee(Base):
    __tablename__ = "employees"
    id           = Column(Integer, primary_key=True, index=True)
    full_name    = Column(String(255), nullable=False)
    email        = Column(String(255), unique=True, nullable=False)
    phone        = Column(String(50), nullable=True)
    department   = Column(String(100), nullable=False)
    role         = Column(String(100), nullable=False)
    salary       = Column(Float, nullable=True)
    status       = Column(Enum(EmployeeStatus), default=EmployeeStatus.active)
    start_date   = Column(DateTime, default=func.now())
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=func.now())
    updated_at   = Column(DateTime, default=func.now(), onupdate=func.now())

class Position(Base):
    __tablename__ = "positions"
    id           = Column(Integer, primary_key=True, index=True)
    title        = Column(String(100), nullable=False)
    department   = Column(String(100), nullable=False)
    description  = Column(Text, nullable=True)
    salary_min   = Column(Float, nullable=True)
    salary_max   = Column(Float, nullable=True)
    status       = Column(Enum(PositionStatus), default=PositionStatus.open)
    opened_date  = Column(DateTime, default=func.now())
    created_at   = Column(DateTime, default=func.now())


# ── Sales Models ──────────────────────────────────────
class SalesProduct(Base):
    __tablename__ = "sales_products"

    id                  = Column(Integer, primary_key=True, index=True)
    sku                 = Column(String(80), nullable=False, unique=True, index=True)
    name                = Column(String(255), nullable=False)
    category            = Column(String(120), nullable=False, default="general")
    brand               = Column(String(120), nullable=True)
    description         = Column(Text, nullable=True)
    status              = Column(Enum(SalesProductStatus), nullable=False, default=SalesProductStatus.active)
    is_current          = Column(Boolean, nullable=False, default=True)
    unit_price          = Column(Float, nullable=False, default=0)
    unit_cost           = Column(Float, nullable=False, default=0)
    stock_qty           = Column(Integer, nullable=False, default=0)
    reorder_level       = Column(Integer, nullable=False, default=0)
    location            = Column(String(120), nullable=True)
    image_url           = Column(String(500), nullable=True)
    tags                = Column(String(500), nullable=True)
    total_sold_units    = Column(Integer, nullable=False, default=0)
    total_revenue       = Column(Float, nullable=False, default=0)
    last_sold_at        = Column(DateTime, nullable=True)
    created_at          = Column(DateTime, default=func.now())
    updated_at          = Column(DateTime, default=func.now(), onupdate=func.now())
    order_items         = relationship("SalesOrderItem", back_populates="product")
    inventory_movements = relationship("SalesInventoryAdjustment", back_populates="product")


class SalesOrder(Base):
    __tablename__ = "sales_orders"

    id             = Column(Integer, primary_key=True, index=True)
    order_number   = Column(String(120), nullable=False, unique=True, index=True)
    customer_name  = Column(String(255), nullable=False)
    customer_email = Column(String(255), nullable=True)
    customer_phone = Column(String(80), nullable=True)
    channel        = Column(Enum(SalesOrderChannel), nullable=False, default=SalesOrderChannel.online)
    status         = Column(Enum(SalesOrderStatus), nullable=False, default=SalesOrderStatus.pending)
    currency       = Column(String(10), nullable=False, default="USD")
    subtotal       = Column(Float, nullable=False, default=0)
    discount_total = Column(Float, nullable=False, default=0)
    tax_total      = Column(Float, nullable=False, default=0)
    shipping_total = Column(Float, nullable=False, default=0)
    total          = Column(Float, nullable=False, default=0)
    order_date     = Column(DateTime, nullable=False, default=func.now())
    due_date       = Column(DateTime, nullable=True)
    fulfilled_at   = Column(DateTime, nullable=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=func.now())
    updated_at     = Column(DateTime, default=func.now(), onupdate=func.now())
    items          = relationship(
        "SalesOrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class SalesOrderItem(Base):
    __tablename__ = "sales_order_items"

    id           = Column(Integer, primary_key=True, index=True)
    order_id     = Column(Integer, ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id   = Column(Integer, ForeignKey("sales_products.id", ondelete="SET NULL"), nullable=True, index=True)
    sku          = Column(String(80), nullable=False)
    product_name = Column(String(255), nullable=False)
    quantity     = Column(Integer, nullable=False, default=1)
    unit_price   = Column(Float, nullable=False, default=0)
    unit_cost    = Column(Float, nullable=False, default=0)
    line_discount = Column(Float, nullable=False, default=0)
    line_total   = Column(Float, nullable=False, default=0)
    created_at   = Column(DateTime, default=func.now())
    order        = relationship("SalesOrder", back_populates="items")
    product      = relationship("SalesProduct", back_populates="order_items")


class SalesInventoryAdjustment(Base):
    __tablename__ = "sales_inventory_adjustments"

    id         = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("sales_products.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id   = Column(Integer, ForeignKey("sales_orders.id", ondelete="SET NULL"), nullable=True, index=True)
    change_qty = Column(Integer, nullable=False)
    reason     = Column(String(120), nullable=False, default="manual_adjustment")
    reference  = Column(String(255), nullable=True)
    notes      = Column(Text, nullable=True)
    actor      = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=func.now())
    product    = relationship("SalesProduct", back_populates="inventory_movements")


# ── Support Models ────────────────────────────────────
class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id                 = Column(Integer, primary_key=True, index=True)
    ticket_number      = Column(String(120), nullable=False, unique=True, index=True)
    subject            = Column(String(255), nullable=False)
    customer_name      = Column(String(255), nullable=False)
    customer_email     = Column(String(255), nullable=True)
    channel            = Column(Enum(SupportTicketChannel), nullable=False, default=SupportTicketChannel.portal)
    module             = Column(String(120), nullable=True)
    priority           = Column(Enum(SupportTicketPriority), nullable=False, default=SupportTicketPriority.medium)
    status             = Column(Enum(SupportTicketStatus), nullable=False, default=SupportTicketStatus.open)
    assignee           = Column(String(120), nullable=True)
    first_response_at  = Column(DateTime, nullable=True)
    sla_due_at         = Column(DateTime, nullable=True)
    resolved_at        = Column(DateTime, nullable=True)
    satisfaction_score = Column(Integer, nullable=True)
    notes              = Column(Text, nullable=True)
    created_at         = Column(DateTime, default=func.now())
    updated_at         = Column(DateTime, default=func.now(), onupdate=func.now())


# ── Supply Chain Models ───────────────────────────────
class SupplyChainItem(Base):
    __tablename__ = "supply_chain_items"

    id             = Column(Integer, primary_key=True, index=True)
    sku            = Column(String(120), nullable=False, unique=True, index=True)
    name           = Column(String(255), nullable=False)
    category       = Column(String(120), nullable=False, default="general")
    supplier       = Column(String(255), nullable=True)
    warehouse      = Column(String(120), nullable=True)
    status         = Column(Enum(SupplyChainItemStatus), nullable=False, default=SupplyChainItemStatus.healthy)
    on_hand_qty    = Column(Integer, nullable=False, default=0)
    reserved_qty   = Column(Integer, nullable=False, default=0)
    safety_stock   = Column(Integer, nullable=False, default=0)
    reorder_point  = Column(Integer, nullable=False, default=0)
    lead_time_days = Column(Integer, nullable=False, default=0)
    unit_cost      = Column(Float, nullable=False, default=0)
    last_received_at = Column(DateTime, nullable=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=func.now())
    updated_at     = Column(DateTime, default=func.now(), onupdate=func.now())


class SupplyChainShipment(Base):
    __tablename__ = "supply_chain_shipments"

    id            = Column(Integer, primary_key=True, index=True)
    shipment_ref  = Column(String(120), nullable=False, unique=True, index=True)
    direction     = Column(Enum(SupplyChainShipmentDirection), nullable=False, default=SupplyChainShipmentDirection.inbound)
    status        = Column(Enum(SupplyChainShipmentStatus), nullable=False, default=SupplyChainShipmentStatus.planned)
    partner       = Column(String(255), nullable=True)
    origin        = Column(String(180), nullable=True)
    destination   = Column(String(180), nullable=True)
    eta           = Column(DateTime, nullable=True)
    shipped_at    = Column(DateTime, nullable=True)
    delivered_at  = Column(DateTime, nullable=True)
    freight_cost  = Column(Float, nullable=False, default=0)
    notes         = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=func.now())
    updated_at    = Column(DateTime, default=func.now(), onupdate=func.now())


# ── Procurement Models ────────────────────────────────
class ProcurementRequest(Base):
    __tablename__ = "procurement_requests"

    id            = Column(Integer, primary_key=True, index=True)
    request_number = Column(String(120), nullable=False, unique=True, index=True)
    title         = Column(String(255), nullable=False)
    department    = Column(String(120), nullable=True)
    requester     = Column(String(120), nullable=True)
    supplier      = Column(String(255), nullable=True)
    status        = Column(Enum(ProcurementRequestStatus), nullable=False, default=ProcurementRequestStatus.draft)
    priority      = Column(Enum(ProcurementRequestPriority), nullable=False, default=ProcurementRequestPriority.medium)
    amount        = Column(Float, nullable=False, default=0)
    currency      = Column(String(10), nullable=False, default="USD")
    due_date      = Column(DateTime, nullable=True)
    approved_by   = Column(String(120), nullable=True)
    ordered_at    = Column(DateTime, nullable=True)
    received_at   = Column(DateTime, nullable=True)
    notes         = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=func.now())
    updated_at    = Column(DateTime, default=func.now(), onupdate=func.now())


# ── Insights Models ───────────────────────────────────
class InsightReport(Base):
    __tablename__ = "insight_reports"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(255), nullable=False)
    report_type    = Column(String(120), nullable=False, default="executive")
    owner          = Column(String(120), nullable=True)
    status         = Column(Enum(InsightReportStatus), nullable=False, default=InsightReportStatus.draft)
    schedule       = Column(String(80), nullable=True)  # daily | weekly | monthly
    kpi_target     = Column(String(120), nullable=True)
    last_run_at    = Column(DateTime, nullable=True)
    next_run_at    = Column(DateTime, nullable=True)
    summary        = Column(Text, nullable=True)
    config_json    = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=func.now())
    updated_at     = Column(DateTime, default=func.now(), onupdate=func.now())


# ── Marketing Models ──────────────────────────────────
class MarketingCampaign(Base):
    __tablename__ = "marketing_campaigns"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(255), nullable=False)
    channel     = Column(String(100), nullable=False)
    objective   = Column(Enum(MarketingObjective), default=MarketingObjective.leads, nullable=False)
    status      = Column(Enum(MarketingCampaignStatus), default=MarketingCampaignStatus.draft, nullable=False)
    owner       = Column(String(120), nullable=True)
    budget      = Column(Float, nullable=False, default=0)
    spent       = Column(Float, nullable=False, default=0)
    revenue     = Column(Float, nullable=False, default=0)
    impressions = Column(Integer, nullable=False, default=0)
    clicks      = Column(Integer, nullable=False, default=0)
    conversions = Column(Integer, nullable=False, default=0)
    start_date  = Column(DateTime, default=func.now())
    end_date    = Column(DateTime, nullable=True)
    notes       = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=func.now())
    updated_at  = Column(DateTime, default=func.now(), onupdate=func.now())


class MarketingContentItem(Base):
    __tablename__ = "marketing_content_items"

    id            = Column(Integer, primary_key=True, index=True)
    title         = Column(String(255), nullable=False)
    content_type  = Column(Enum(MarketingContentType), default=MarketingContentType.social_post, nullable=False)
    channel       = Column(String(100), nullable=False)
    status        = Column(Enum(MarketingContentStatus), default=MarketingContentStatus.idea, nullable=False)
    campaign_id   = Column(Integer, ForeignKey("marketing_campaigns.id", ondelete="SET NULL"), nullable=True)
    assignee      = Column(String(120), nullable=True)
    publish_date  = Column(DateTime, nullable=True)
    asset_url     = Column(String(500), nullable=True)
    cta           = Column(String(255), nullable=True)
    created_at    = Column(DateTime, default=func.now())
    updated_at    = Column(DateTime, default=func.now(), onupdate=func.now())


class MarketingLead(Base):
    __tablename__ = "marketing_leads"

    id                     = Column(Integer, primary_key=True, index=True)
    full_name              = Column(String(255), nullable=False)
    email                  = Column(String(255), nullable=False)
    company                = Column(String(255), nullable=True)
    source_channel         = Column(String(100), nullable=False)
    campaign_id            = Column(Integer, ForeignKey("marketing_campaigns.id", ondelete="SET NULL"), nullable=True)
    status                 = Column(Enum(MarketingLeadStatus), default=MarketingLeadStatus.new, nullable=False)
    score                  = Column(Integer, nullable=False, default=0)
    estimated_value        = Column(Float, nullable=False, default=0)
    conversion_probability = Column(Float, nullable=False, default=0)
    notes                  = Column(Text, nullable=True)
    created_at             = Column(DateTime, default=func.now())
    updated_at             = Column(DateTime, default=func.now(), onupdate=func.now())


class MarketingChannelMetric(Base):
    __tablename__ = "marketing_channel_metrics"

    id             = Column(Integer, primary_key=True, index=True)
    channel        = Column(String(100), nullable=False, index=True)
    period_label   = Column(String(50), nullable=False, default="Current")
    spend          = Column(Float, nullable=False, default=0)
    revenue        = Column(Float, nullable=False, default=0)
    impressions    = Column(Integer, nullable=False, default=0)
    clicks         = Column(Integer, nullable=False, default=0)
    leads          = Column(Integer, nullable=False, default=0)
    customers      = Column(Integer, nullable=False, default=0)
    conversions    = Column(Integer, nullable=False, default=0)
    benchmark_roas = Column(Float, nullable=False, default=3.0)
    benchmark_cvr  = Column(Float, nullable=False, default=2.5)
    benchmark_ctr  = Column(Float, nullable=False, default=1.8)
    created_at     = Column(DateTime, default=func.now())
    updated_at     = Column(DateTime, default=func.now(), onupdate=func.now())


# ── Legal Models ───────────────────────────────────────
class LegalDocument(Base):
    __tablename__ = "legal_documents"

    id                = Column(Integer, primary_key=True, index=True)
    title             = Column(String(255), nullable=False)
    document_number   = Column(String(120), nullable=True, index=True)
    jurisdiction      = Column(String(120), nullable=False, default="Uzbekistan")
    category          = Column(String(120), nullable=False, default="general")
    issuing_authority = Column(String(180), nullable=True)
    source            = Column(Enum(LegalDocumentSource), default=LegalDocumentSource.internal, nullable=False)
    status            = Column(Enum(LegalDocumentStatus), default=LegalDocumentStatus.active, nullable=False)
    source_url        = Column(String(700), nullable=True)
    summary           = Column(Text, nullable=True)
    full_text         = Column(Text, nullable=True)
    tags              = Column(String(500), nullable=True)
    published_at      = Column(DateTime, nullable=True)
    effective_from    = Column(DateTime, nullable=True)
    effective_to      = Column(DateTime, nullable=True)
    last_reviewed_at  = Column(DateTime, nullable=True)
    created_at        = Column(DateTime, default=func.now())
    updated_at        = Column(DateTime, default=func.now(), onupdate=func.now())


class LegalContract(Base):
    __tablename__ = "legal_contracts"

    id            = Column(Integer, primary_key=True, index=True)
    contract_ref  = Column(String(120), nullable=True, index=True)
    title         = Column(String(255), nullable=False)
    counterparty  = Column(String(255), nullable=False)
    owner         = Column(String(120), nullable=True)
    status        = Column(Enum(LegalContractStatus), default=LegalContractStatus.draft, nullable=False)
    risk_level    = Column(Enum(LegalRiskLevel), default=LegalRiskLevel.medium, nullable=False)
    value_amount  = Column(Float, nullable=False, default=0)
    currency      = Column(String(10), nullable=False, default="USD")
    start_date    = Column(DateTime, nullable=True)
    end_date      = Column(DateTime, nullable=True)
    renewal_date  = Column(DateTime, nullable=True)
    governing_law = Column(String(180), nullable=True)
    document_id   = Column(Integer, ForeignKey("legal_documents.id", ondelete="SET NULL"), nullable=True)
    notes         = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=func.now())
    updated_at    = Column(DateTime, default=func.now(), onupdate=func.now())


class LegalComplianceTask(Base):
    __tablename__ = "legal_compliance_tasks"

    id                  = Column(Integer, primary_key=True, index=True)
    title               = Column(String(255), nullable=False)
    framework           = Column(String(180), nullable=True)
    owner               = Column(String(120), nullable=True)
    status              = Column(Enum(LegalTaskStatus), default=LegalTaskStatus.open, nullable=False)
    risk_level          = Column(Enum(LegalRiskLevel), default=LegalRiskLevel.medium, nullable=False)
    due_date            = Column(DateTime, nullable=True)
    completed_at        = Column(DateTime, nullable=True)
    related_document_id = Column(Integer, ForeignKey("legal_documents.id", ondelete="SET NULL"), nullable=True)
    related_contract_id = Column(Integer, ForeignKey("legal_contracts.id", ondelete="SET NULL"), nullable=True)
    description         = Column(Text, nullable=True)
    remediation_plan    = Column(Text, nullable=True)
    created_at          = Column(DateTime, default=func.now())
    updated_at          = Column(DateTime, default=func.now(), onupdate=func.now())


class LegalSearchLog(Base):
    __tablename__ = "legal_search_logs"

    id           = Column(Integer, primary_key=True, index=True)
    query_text   = Column(Text, nullable=False)
    jurisdiction = Column(String(120), nullable=True)
    category     = Column(String(120), nullable=True)
    source       = Column(String(120), nullable=True)
    provider     = Column(String(120), nullable=True)
    results_count = Column(Integer, nullable=False, default=0)
    created_at   = Column(DateTime, default=func.now())


# ── Projects & Kanban Models ─────────────────────────
class Project(Base):
    __tablename__ = "projects"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status      = Column(Enum(ProjectStatus), default=ProjectStatus.active)
    color       = Column(String(20), default="#7c6aff")
    owner       = Column(String(100), nullable=True)
    due_date    = Column(DateTime, nullable=True)
    created_at  = Column(DateTime, default=func.now())
    updated_at  = Column(DateTime, default=func.now(), onupdate=func.now())


class KanbanColumn(Base):
    __tablename__ = "kanban_columns"

    id         = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name       = Column(String(100), nullable=False)
    color      = Column(String(20), default="#555")
    position   = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())


class KanbanTask(Base):
    __tablename__ = "kanban_tasks"

    id          = Column(Integer, primary_key=True, index=True)
    column_id   = Column(Integer, ForeignKey("kanban_columns.id", ondelete="CASCADE"), nullable=False)
    project_id  = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title       = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    priority    = Column(Enum(TaskPriority), default=TaskPriority.medium)
    assignee    = Column(String(100), nullable=True)
    due_date    = Column(DateTime, nullable=True)
    position    = Column(Integer, default=0)
    tags        = Column(String(500), nullable=True)
    created_at  = Column(DateTime, default=func.now())
    updated_at  = Column(DateTime, default=func.now(), onupdate=func.now())


# ── Admin / Owner Dashboard Models ────────────────────
class PlanTier(str, enum.Enum):
    trial = "trial"
    starter = "starter"
    pro = "pro"
    enterprise = "enterprise"


class PlanStatus(str, enum.Enum):
    active = "active"
    expired = "expired"
    cancelled = "cancelled"
    suspended = "suspended"
    trial = "trial"


class PaymentStatus(str, enum.Enum):
    paid = "paid"
    pending = "pending"
    failed = "failed"
    refunded = "refunded"


class PaymentMethodType(str, enum.Enum):
    card = "card"
    bank = "bank"
    wallet = "wallet"
    manual = "manual"
    other = "other"


class NotificationType(str, enum.Enum):
    info = "info"
    warning = "warning"
    success = "success"
    critical = "critical"


class NotificationTarget(str, enum.Enum):
    all = "all"
    plan_tier = "plan_tier"
    specific = "specific"


class ClientOrg(Base):
    __tablename__ = "client_orgs"
    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(255), nullable=False)
    slug        = Column(String(100), unique=True, nullable=False)
    owner_name  = Column(String(255), nullable=False)
    owner_email = Column(String(255), unique=True, nullable=False)
    owner_phone = Column(String(50), nullable=True)
    industry    = Column(String(100), nullable=True)
    company_size = Column(String(50), nullable=True)
    country     = Column(String(100), nullable=True)
    logo_url    = Column(String(500), nullable=True)
    is_active   = Column(Boolean, default=True)
    is_suspended = Column(Boolean, default=False)
    notes       = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=func.now())
    updated_at  = Column(DateTime, default=func.now(), onupdate=func.now())


class Subscription(Base):
    __tablename__ = "subscriptions"
    id                  = Column(Integer, primary_key=True, index=True)
    client_id           = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False)
    plan_tier           = Column(Enum(PlanTier), nullable=False)
    status              = Column(Enum(PlanStatus), default=PlanStatus.trial)
    price_monthly       = Column(Float, nullable=False)
    seats               = Column(Integer, default=10)
    modules             = Column(String(500), default="finance,hr")
    billing_cycle       = Column(String(20), default="monthly")
    trial_ends_at       = Column(DateTime, nullable=True)
    current_period_start = Column(DateTime, default=func.now())
    current_period_end   = Column(DateTime, nullable=True)
    cancelled_at        = Column(DateTime, nullable=True)
    cancel_reason       = Column(Text, nullable=True)
    created_at          = Column(DateTime, default=func.now())
    updated_at          = Column(DateTime, default=func.now(), onupdate=func.now())


class Payment(Base):
    __tablename__ = "payments"
    id              = Column(Integer, primary_key=True, index=True)
    client_id       = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=True)
    amount          = Column(Float, nullable=False)
    currency        = Column(String(10), default="USD")
    status          = Column(Enum(PaymentStatus), default=PaymentStatus.pending)
    payment_method  = Column(String(50), nullable=True)
    transaction_id  = Column(String(255), nullable=True)
    description     = Column(String(500), nullable=True)
    invoice_number  = Column(String(100), nullable=True)
    paid_at         = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=func.now())


class PaymentMethod(Base):
    __tablename__ = "payment_methods"
    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String(100), nullable=False)
    provider         = Column(String(100), nullable=False)
    method_type      = Column(Enum(PaymentMethodType), default=PaymentMethodType.other, nullable=False)
    details          = Column(String(255), nullable=True)
    fee_percent      = Column(Float, default=0, nullable=False)
    fee_fixed        = Column(Float, default=0, nullable=False)
    supports_refunds = Column(Boolean, default=True, nullable=False)
    is_active        = Column(Boolean, default=True, nullable=False)
    is_default       = Column(Boolean, default=False, nullable=False)
    created_at       = Column(DateTime, default=func.now())
    updated_at       = Column(DateTime, default=func.now(), onupdate=func.now())


class AdminNotification(Base):
    __tablename__ = "admin_notifications"
    id              = Column(Integer, primary_key=True, index=True)
    title           = Column(String(255), nullable=False)
    message         = Column(Text, nullable=False)
    type            = Column(Enum(NotificationType), default=NotificationType.info)
    target          = Column(Enum(NotificationTarget), default=NotificationTarget.all)
    target_value    = Column(String(255), nullable=True)
    is_sent         = Column(Boolean, default=False)
    sent_at         = Column(DateTime, nullable=True)
    recipient_count = Column(Integer, default=0)
    created_at      = Column(DateTime, default=func.now())


class ClientActivity(Base):
    __tablename__ = "client_activity"
    id        = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False)
    action    = Column(String(255), nullable=False)
    actor     = Column(String(100), nullable=True)
    extra_data  = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())


# ── Platform Settings ─────────────────────────────────
class PlatformSettings(Base):
    __tablename__ = "platform_settings"
    id                        = Column(Integer, primary_key=True, index=True)
    platform_name             = Column(String(255), default="Benela AI", nullable=False)
    support_email             = Column(String(255), nullable=True)
    status_page_url           = Column(String(500), nullable=True)
    default_currency          = Column(String(10), default="USD", nullable=False)
    default_trial_days        = Column(Integer, default=14, nullable=False)
    default_tax_rate          = Column(Float, default=0, nullable=False)
    invoice_prefix            = Column(String(20), default="BNL", nullable=False)
    maintenance_mode          = Column(Boolean, default=False)
    allow_new_signups         = Column(Boolean, default=True)
    enforce_admin_mfa         = Column(Boolean, default=False)
    session_timeout_minutes   = Column(Integer, default=60, nullable=False)
    trusted_ip_ranges         = Column(Text, nullable=True)
    allow_marketplace         = Column(Boolean, default=True)
    allow_plugin_purchases    = Column(Boolean, default=True)
    webhook_signing_secret    = Column(String(255), nullable=True)
    platform_api_key          = Column(String(255), nullable=True)
    created_at                = Column(DateTime, default=func.now())
    updated_at                = Column(DateTime, default=func.now(), onupdate=func.now())


# ── AI Trainer Models ────────────────────────────────
class AITrainerProfile(Base):
    __tablename__ = "ai_trainer_profiles"

    id                 = Column(Integer, primary_key=True, index=True)
    section            = Column(String(50), nullable=False, unique=True, index=True)
    provider           = Column(String(20), nullable=False, default="anthropic")
    model              = Column(String(120), nullable=True)
    system_instructions = Column(Text, nullable=True)
    temperature        = Column(Float, nullable=False, default=0.2)
    max_context_chars  = Column(Integer, nullable=False, default=12000)
    is_enabled         = Column(Boolean, nullable=False, default=True)
    last_trained_at    = Column(DateTime, nullable=True)
    created_at         = Column(DateTime, default=func.now())
    updated_at         = Column(DateTime, default=func.now(), onupdate=func.now())


class AITrainerSource(Base):
    __tablename__ = "ai_trainer_sources"

    id            = Column(Integer, primary_key=True, index=True)
    section       = Column(String(50), nullable=False, index=True)
    source_type   = Column(String(20), nullable=False)  # url | file | text
    title         = Column(String(255), nullable=False)
    source_url    = Column(String(1000), nullable=True)
    file_name     = Column(String(255), nullable=True)
    mime_type     = Column(String(120), nullable=True)
    status        = Column(String(20), nullable=False, default="processing")  # processing | ready | failed
    summary       = Column(Text, nullable=True)
    raw_text      = Column(Text, nullable=True)
    content_hash  = Column(String(64), nullable=True, index=True)
    word_count    = Column(Integer, nullable=False, default=0)
    chunk_count   = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=func.now())
    updated_at    = Column(DateTime, default=func.now(), onupdate=func.now())
    chunks        = relationship(
        "AITrainerChunk",
        back_populates="source",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class AITrainerChunk(Base):
    __tablename__ = "ai_trainer_chunks"

    id            = Column(Integer, primary_key=True, index=True)
    source_id     = Column(Integer, ForeignKey("ai_trainer_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    section       = Column(String(50), nullable=False, index=True)
    chunk_index   = Column(Integer, nullable=False, default=0)
    content       = Column(Text, nullable=False)
    keywords      = Column(String(1000), nullable=True)
    token_estimate = Column(Integer, nullable=False, default=0)
    created_at    = Column(DateTime, default=func.now())
    source        = relationship("AITrainerSource", back_populates="chunks")


# ── Chat Models ───────────────────────────────────────
class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), nullable=False, index=True)
    # format: "{user_identifier}_{section}" e.g. "user123_finance"
    section = Column(String(50), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())
    attachments = relationship(
        "ChatAttachment",
        back_populates="message",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ChatAttachment(Base):
    __tablename__ = "chat_attachments"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(120), nullable=True)
    size_bytes = Column(Integer, nullable=False, default=0)
    content_excerpt = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    message = relationship("ChatMessage", back_populates="attachments")


# ── Marketplace Models ────────────────────────────────
class PluginCategory(str, enum.Enum):
    finance = "finance"
    hr = "hr"
    operations = "operations"
    analytics = "analytics"
    communication = "communication"
    security = "security"
    other = "other"


class BillingCycle(str, enum.Enum):
    monthly = "monthly"
    yearly = "yearly"
    one_time = "one_time"


class PurchaseStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    cancelled = "cancelled"
    refunded = "refunded"


class InstallStatus(str, enum.Enum):
    pending = "pending"
    installed = "installed"
    failed = "failed"
    uninstalled = "uninstalled"


class MarketplacePlugin(Base):
    __tablename__ = "marketplace_plugins"
    id            = Column(Integer, primary_key=True, index=True)
    slug          = Column(String(100), unique=True, nullable=False, index=True)
    name          = Column(String(255), nullable=False)
    description   = Column(Text, nullable=True)
    vendor        = Column(String(255), nullable=False, default="Benela")
    category      = Column(Enum(PluginCategory), default=PluginCategory.other, nullable=False)
    icon          = Column(String(20), nullable=True)
    tags          = Column(String(500), nullable=True)
    price_monthly = Column(Float, nullable=False, default=0)
    price_yearly  = Column(Float, nullable=True)
    is_active     = Column(Boolean, default=True)
    is_featured   = Column(Boolean, default=False)
    created_at    = Column(DateTime, default=func.now())
    updated_at    = Column(DateTime, default=func.now(), onupdate=func.now())


class PluginPurchase(Base):
    __tablename__ = "plugin_purchases"
    id            = Column(Integer, primary_key=True, index=True)
    workspace_id  = Column(String(120), nullable=False, index=True)
    plugin_id     = Column(Integer, ForeignKey("marketplace_plugins.id", ondelete="CASCADE"), nullable=False)
    billing_cycle = Column(Enum(BillingCycle), default=BillingCycle.monthly, nullable=False)
    status        = Column(Enum(PurchaseStatus), default=PurchaseStatus.pending, nullable=False)
    amount        = Column(Float, nullable=False, default=0)
    currency      = Column(String(10), nullable=False, default="USD")
    started_at    = Column(DateTime, nullable=True)
    ended_at      = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=func.now())
    updated_at    = Column(DateTime, default=func.now(), onupdate=func.now())


class PluginInstall(Base):
    __tablename__ = "plugin_installs"
    id           = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(String(120), nullable=False, index=True)
    plugin_id    = Column(Integer, ForeignKey("marketplace_plugins.id", ondelete="CASCADE"), nullable=False)
    purchase_id  = Column(Integer, ForeignKey("plugin_purchases.id", ondelete="SET NULL"), nullable=True)
    status       = Column(Enum(InstallStatus), default=InstallStatus.pending, nullable=False)
    is_enabled   = Column(Boolean, default=False)
    installed_at = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=func.now())
    updated_at   = Column(DateTime, default=func.now(), onupdate=func.now())
