from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum, Boolean, ForeignKey
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
