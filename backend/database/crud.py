from datetime import datetime, timedelta

from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_
from database.models import (
    Transaction,
    Invoice,
    Employee,
    Position,
    Department,
    TransactionType,
    MarketingCampaign,
    MarketingContentItem,
    MarketingLead,
    MarketingChannelMetric,
    MarketingCampaignStatus,
    MarketingContentStatus,
    MarketingLeadStatus,
    Project,
    KanbanColumn,
    KanbanTask,
    MarketplacePlugin,
    PluginPurchase,
    PluginInstall,
    PluginCategory,
    BillingCycle,
    PurchaseStatus,
    InstallStatus,
    ChatMessage,
    ChatAttachment,
)
from database import schemas


def _month_bounds(now: datetime):
    month_start = datetime(now.year, now.month, 1)
    if now.month == 12:
        next_month_start = datetime(now.year + 1, 1, 1)
    else:
        next_month_start = datetime(now.year, now.month + 1, 1)

    prev_month_end = month_start
    if month_start.month == 1:
        prev_month_start = datetime(month_start.year - 1, 12, 1)
    else:
        prev_month_start = datetime(month_start.year, month_start.month - 1, 1)
    return month_start, next_month_start, prev_month_start, prev_month_end


def _change_percent(current: float, previous: float):
    if previous == 0:
        if current == 0:
            return "0%", True
        return "+100%", True
    pct = ((current - previous) / abs(previous)) * 100
    return f"{pct:+.0f}%", pct >= 0


def _change_number(current: int, previous: int):
    diff = current - previous
    if diff == 0:
        return "0", True
    return f"{diff:+d}", diff >= 0


def _time_ago(value: datetime | None):
    if not value:
        return "—"
    ref = value.replace(tzinfo=None) if value.tzinfo else value
    delta = datetime.utcnow() - ref
    seconds = max(int(delta.total_seconds()), 0)
    if seconds < 60:
        return "Just now"
    if seconds < 3600:
        mins = seconds // 60
        return f"{mins} min ago"
    if seconds < 86400:
        hours = seconds // 3600
        return f"{hours} hour ago" if hours == 1 else f"{hours} hours ago"
    days = seconds // 86400
    return f"{days} day ago" if days == 1 else f"{days} days ago"


def _status_from_alerts(alerts: int):
    if alerts >= 5:
        return "Critical"
    if alerts > 0:
        return "Warning"
    return "Healthy"


def _max_dt(*values: datetime | None):
    filtered = [v for v in values if v is not None]
    if not filtered:
        return None
    return max(filtered)


def _safe_div(numerator: float, denominator: float):
    if denominator == 0:
        return 0.0
    return float(numerator) / float(denominator)


# ── Dashboard ─────────────────────────────────────────
def get_dashboard_overview(db: Session, workspace_id: str = "default-workspace"):
    _seed_marketplace_if_empty(db)

    now = datetime.utcnow()
    month_start, next_month_start, prev_month_start, prev_month_end = _month_bounds(now)
    today_start = datetime(now.year, now.month, now.day)

    income_total = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.type == TransactionType.income)
        .scalar()
        or 0
    )
    expense_total = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.type == TransactionType.expense)
        .scalar()
        or 0
    )
    income_this_month = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.type == TransactionType.income,
            Transaction.date >= month_start,
            Transaction.date < next_month_start,
        )
        .scalar()
        or 0
    )
    income_prev_month = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.type == TransactionType.income,
            Transaction.date >= prev_month_start,
            Transaction.date < prev_month_end,
        )
        .scalar()
        or 0
    )
    expense_this_month = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.type == TransactionType.expense,
            Transaction.date >= month_start,
            Transaction.date < next_month_start,
        )
        .scalar()
        or 0
    )
    expense_prev_month = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.type == TransactionType.expense,
            Transaction.date >= prev_month_start,
            Transaction.date < prev_month_end,
        )
        .scalar()
        or 0
    )

    active_employees = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "active")
        .scalar()
        or 0
    )
    hires_this_month = (
        db.query(func.count(Employee.id))
        .filter(Employee.created_at >= month_start, Employee.created_at < next_month_start)
        .scalar()
        or 0
    )
    hires_prev_month = (
        db.query(func.count(Employee.id))
        .filter(Employee.created_at >= prev_month_start, Employee.created_at < prev_month_end)
        .scalar()
        or 0
    )

    active_projects = (
        db.query(func.count(Project.id))
        .filter(Project.status == "active")
        .scalar()
        or 0
    )
    projects_this_month = (
        db.query(func.count(Project.id))
        .filter(Project.created_at >= month_start, Project.created_at < next_month_start)
        .scalar()
        or 0
    )
    projects_prev_month = (
        db.query(func.count(Project.id))
        .filter(Project.created_at >= prev_month_start, Project.created_at < prev_month_end)
        .scalar()
        or 0
    )

    net_total = income_total - expense_total
    net_this_month = income_this_month - expense_this_month
    net_prev_month = income_prev_month - expense_prev_month

    revenue_change, revenue_up = _change_percent(float(income_this_month), float(income_prev_month))
    net_change, net_up = _change_percent(float(net_this_month), float(net_prev_month))
    employees_change, employees_up = _change_number(active_employees, active_employees - hires_this_month + hires_prev_month)
    projects_change, projects_up = _change_number(active_projects, active_projects - projects_this_month + projects_prev_month)

    finance_tasks_today = (
        db.query(func.count(Transaction.id))
        .filter(Transaction.date >= today_start)
        .scalar()
        or 0
    )
    finance_alerts = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.status.in_(["pending", "overdue"]))
        .scalar()
        or 0
    )
    finance_last = _max_dt(
        db.query(func.max(Transaction.created_at)).scalar(),
        db.query(func.max(Invoice.created_at)).scalar(),
    )

    hr_tasks_today = (
        (db.query(func.count(Employee.id)).filter(Employee.created_at >= today_start).scalar() or 0)
        + (db.query(func.count(Position.id)).filter(Position.created_at >= today_start).scalar() or 0)
    )
    hr_alerts = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "on_leave")
        .scalar()
        or 0
    )
    hr_last = _max_dt(
        db.query(func.max(Employee.updated_at)).scalar(),
        db.query(func.max(Position.created_at)).scalar(),
    )

    project_tasks_today = (
        db.query(func.count(KanbanTask.id))
        .filter(KanbanTask.created_at >= today_start)
        .scalar()
        or 0
    )
    project_alerts = (
        db.query(func.count(KanbanTask.id))
        .filter(KanbanTask.due_date.isnot(None), KanbanTask.due_date < now)
        .scalar()
        or 0
    )
    project_last = _max_dt(
        db.query(func.max(KanbanTask.updated_at)).scalar(),
        db.query(func.max(Project.updated_at)).scalar(),
    )

    marketplace_tasks_today = (
        db.query(func.count(PluginPurchase.id))
        .filter(PluginPurchase.workspace_id == workspace_id, PluginPurchase.created_at >= today_start)
        .scalar()
        or 0
    )
    marketplace_alerts = (
        db.query(func.count(PluginPurchase.id))
        .filter(PluginPurchase.workspace_id == workspace_id, PluginPurchase.status == PurchaseStatus.pending)
        .scalar()
        or 0
    )
    marketplace_last = _max_dt(
        db.query(func.max(PluginPurchase.updated_at)).filter(PluginPurchase.workspace_id == workspace_id).scalar(),
        db.query(func.max(PluginInstall.updated_at)).filter(PluginInstall.workspace_id == workspace_id).scalar(),
    )

    return {
        "cards": [
            {
                "label": "Total Revenue",
                "value": f"${float(income_total):,.0f}",
                "change": revenue_change,
                "up": revenue_up,
                "color": "#34d399",
            },
            {
                "label": "Net Profit",
                "value": f"${float(net_total):,.0f}",
                "change": net_change,
                "up": net_up,
                "color": "#60a5fa",
            },
            {
                "label": "Active Employees",
                "value": str(active_employees),
                "change": employees_change,
                "up": employees_up,
                "color": "#a78bfa",
            },
            {
                "label": "Active Projects",
                "value": str(active_projects),
                "change": projects_change,
                "up": projects_up,
                "color": "#fbbf24",
            },
        ],
        "modules": [
            {
                "module": "💰 Finance",
                "status": _status_from_alerts(finance_alerts),
                "tasks_today": str(finance_tasks_today),
                "alerts": str(finance_alerts),
                "last_activity": _time_ago(finance_last),
            },
            {
                "module": "👥 HR",
                "status": _status_from_alerts(hr_alerts),
                "tasks_today": str(hr_tasks_today),
                "alerts": str(hr_alerts),
                "last_activity": _time_ago(hr_last),
            },
            {
                "module": "📋 Projects",
                "status": _status_from_alerts(project_alerts),
                "tasks_today": str(project_tasks_today),
                "alerts": str(project_alerts),
                "last_activity": _time_ago(project_last),
            },
            {
                "module": "📦 Marketplace",
                "status": _status_from_alerts(marketplace_alerts),
                "tasks_today": str(marketplace_tasks_today),
                "alerts": str(marketplace_alerts),
                "last_activity": _time_ago(marketplace_last),
            },
        ],
        "generated_at": now.isoformat() + "Z",
    }


# ── Finance ───────────────────────────────────────────
def get_transactions(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(Transaction)
        .order_by(Transaction.date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

def get_transaction(db: Session, id: int):
    return db.query(Transaction).filter(Transaction.id == id).first()

def create_transaction(db: Session, data: schemas.TransactionCreate):
    tx = Transaction(**data.model_dump())
    db.add(tx); db.commit(); db.refresh(tx)
    return tx

def update_transaction(db: Session, id: int, data: schemas.TransactionUpdate):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(tx, k, v)
    db.commit(); db.refresh(tx)
    return tx

def delete_transaction(db: Session, id: int):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx: return False
    db.delete(tx); db.commit()
    return True

def get_finance_summary(db: Session):
    income = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.type == TransactionType.income)
        .scalar()
        or 0
    )
    expenses = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.type == TransactionType.expense)
        .scalar()
        or 0
    )
    pending = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.status == "pending")
        .scalar()
        or 0
    )
    return {
        "total_income": round(income, 2),
        "total_expenses": round(expenses, 2),
        "net_profit": round(income - expenses, 2),
        "pending_invoices": pending,
    }

def get_invoices(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Invoice).order_by(Invoice.issue_date.desc()).offset(skip).limit(limit).all()

def get_invoice(db: Session, id: int):
    return db.query(Invoice).filter(Invoice.id == id).first()

def create_invoice(db: Session, data: schemas.InvoiceCreate):
    inv = Invoice(**data.model_dump())
    db.add(inv); db.commit(); db.refresh(inv)
    return inv

def update_invoice(db: Session, id: int, data: schemas.InvoiceUpdate):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(inv, k, v)
    db.commit(); db.refresh(inv)
    return inv

def delete_invoice(db: Session, id: int):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv: return False
    db.delete(inv); db.commit()
    return True

# ── HR ────────────────────────────────────────────────
def get_employees(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(Employee)
        .order_by(Employee.full_name)
        .offset(skip)
        .limit(limit)
        .all()
    )

def get_employee(db: Session, id: int):
    return db.query(Employee).filter(Employee.id == id).first()

def create_employee(db: Session, data: schemas.EmployeeCreate):
    emp = Employee(**data.model_dump())
    db.add(emp); db.commit(); db.refresh(emp)
    return emp

def update_employee(db: Session, id: int, data: schemas.EmployeeUpdate):
    emp = db.query(Employee).filter(Employee.id == id).first()
    if not emp: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(emp, k, v)
    db.commit(); db.refresh(emp)
    return emp

def delete_employee(db: Session, id: int):
    emp = db.query(Employee).filter(Employee.id == id).first()
    if not emp: return False
    db.delete(emp); db.commit()
    return True

def get_hr_summary(db: Session):
    total = db.query(func.count(Employee.id)).scalar() or 0
    active = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "active")
        .scalar()
        or 0
    )
    on_leave = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "on_leave")
        .scalar()
        or 0
    )
    open_roles = (
        db.query(func.count(Position.id))
        .filter(Position.status == "open")
        .scalar()
        or 0
    )
    return {
        "total_employees": total,
        "active": active,
        "on_leave": on_leave,
        "open_positions": open_roles,
    }


def get_positions(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(Position)
        .order_by(Position.opened_date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

def get_position(db: Session, id: int):
    return db.query(Position).filter(Position.id == id).first()

def create_position(db: Session, data: schemas.PositionCreate):
    pos = Position(**data.model_dump())
    db.add(pos); db.commit(); db.refresh(pos)
    return pos

def update_position(db: Session, id: int, data: schemas.PositionUpdate):
    pos = db.query(Position).filter(Position.id == id).first()
    if not pos: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(pos, k, v)
    db.commit(); db.refresh(pos)
    return pos

def delete_position(db: Session, id: int):
    pos = db.query(Position).filter(Position.id == id).first()
    if not pos: return False
    db.delete(pos); db.commit()
    return True

def get_departments(db: Session):
    return db.query(Department).order_by(Department.name).all()


def create_department(db: Session, data: schemas.DepartmentCreate):
    dept = Department(**data.model_dump())
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


# ── Marketing ─────────────────────────────────────────
DEFAULT_MARKETING_BENCHMARKS = {
    "roas": 3.2,
    "ctr": 1.8,
    "cvr": 2.5,
    "cac": 180.0,
}


def get_marketing_campaigns(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(MarketingCampaign)
        .order_by(MarketingCampaign.updated_at.desc(), MarketingCampaign.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_marketing_campaign(db: Session, data: schemas.MarketingCampaignCreate):
    payload = data.model_dump()
    if payload.get("start_date") is None:
        payload["start_date"] = datetime.utcnow()
    campaign = MarketingCampaign(**payload)
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


def update_marketing_campaign(db: Session, id: int, data: schemas.MarketingCampaignUpdate):
    campaign = db.query(MarketingCampaign).filter(MarketingCampaign.id == id).first()
    if not campaign:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(campaign, key, value)
    db.commit()
    db.refresh(campaign)
    return campaign


def delete_marketing_campaign(db: Session, id: int):
    campaign = db.query(MarketingCampaign).filter(MarketingCampaign.id == id).first()
    if not campaign:
        return False
    db.delete(campaign)
    db.commit()
    return True


def get_marketing_content(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(MarketingContentItem)
        .order_by(MarketingContentItem.updated_at.desc(), MarketingContentItem.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_marketing_content(db: Session, data: schemas.MarketingContentCreate):
    item = MarketingContentItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_marketing_content(db: Session, id: int, data: schemas.MarketingContentUpdate):
    item = db.query(MarketingContentItem).filter(MarketingContentItem.id == id).first()
    if not item:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def delete_marketing_content(db: Session, id: int):
    item = db.query(MarketingContentItem).filter(MarketingContentItem.id == id).first()
    if not item:
        return False
    db.delete(item)
    db.commit()
    return True


def get_marketing_leads(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(MarketingLead)
        .order_by(MarketingLead.updated_at.desc(), MarketingLead.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_marketing_lead(db: Session, data: schemas.MarketingLeadCreate):
    lead = MarketingLead(**data.model_dump())
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


def update_marketing_lead(db: Session, id: int, data: schemas.MarketingLeadUpdate):
    lead = db.query(MarketingLead).filter(MarketingLead.id == id).first()
    if not lead:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(lead, key, value)
    db.commit()
    db.refresh(lead)
    return lead


def delete_marketing_lead(db: Session, id: int):
    lead = db.query(MarketingLead).filter(MarketingLead.id == id).first()
    if not lead:
        return False
    db.delete(lead)
    db.commit()
    return True


def get_marketing_channel_metrics(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(MarketingChannelMetric)
        .order_by(MarketingChannelMetric.updated_at.desc(), MarketingChannelMetric.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_marketing_channel_metric(db: Session, data: schemas.MarketingChannelMetricCreate):
    row = MarketingChannelMetric(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_marketing_channel_metric(db: Session, id: int, data: schemas.MarketingChannelMetricUpdate):
    row = db.query(MarketingChannelMetric).filter(MarketingChannelMetric.id == id).first()
    if not row:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_marketing_channel_metric(db: Session, id: int):
    row = db.query(MarketingChannelMetric).filter(MarketingChannelMetric.id == id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def get_marketing_funnel(db: Session):
    def _count(status: MarketingLeadStatus):
        return (
            db.query(func.count(MarketingLead.id))
            .filter(MarketingLead.status == status)
            .scalar()
            or 0
        )

    return {
        "new": _count(MarketingLeadStatus.new),
        "mql": _count(MarketingLeadStatus.mql),
        "sql": _count(MarketingLeadStatus.sql),
        "opportunity": _count(MarketingLeadStatus.opportunity),
        "customer": _count(MarketingLeadStatus.customer),
        "disqualified": _count(MarketingLeadStatus.disqualified),
    }


def get_marketing_benchmarks():
    return {
        "source": "Internal global benchmark profile (B2B SaaS blended channels)",
        "roas_target": DEFAULT_MARKETING_BENCHMARKS["roas"],
        "ctr_target_percent": DEFAULT_MARKETING_BENCHMARKS["ctr"],
        "cvr_target_percent": DEFAULT_MARKETING_BENCHMARKS["cvr"],
        "cac_target": DEFAULT_MARKETING_BENCHMARKS["cac"],
    }


def get_marketing_summary(db: Session):
    campaigns_total = db.query(func.count(MarketingCampaign.id)).scalar() or 0
    active_campaigns = (
        db.query(func.count(MarketingCampaign.id))
        .filter(
            MarketingCampaign.status.in_(
                [
                    MarketingCampaignStatus.active,
                    MarketingCampaignStatus.scheduled,
                ]
            )
        )
        .scalar()
        or 0
    )
    campaigns_spend = db.query(func.sum(MarketingCampaign.spent)).scalar() or 0
    campaigns_revenue = db.query(func.sum(MarketingCampaign.revenue)).scalar() or 0
    campaigns_impressions = db.query(func.sum(MarketingCampaign.impressions)).scalar() or 0
    campaigns_clicks = db.query(func.sum(MarketingCampaign.clicks)).scalar() or 0
    campaigns_conversions = db.query(func.sum(MarketingCampaign.conversions)).scalar() or 0

    content_total = db.query(func.count(MarketingContentItem.id)).scalar() or 0
    content_scheduled = (
        db.query(func.count(MarketingContentItem.id))
        .filter(
            MarketingContentItem.status.in_(
                [MarketingContentStatus.scheduled, MarketingContentStatus.in_production]
            )
        )
        .scalar()
        or 0
    )

    leads_total = db.query(func.count(MarketingLead.id)).scalar() or 0
    mql_count = (
        db.query(func.count(MarketingLead.id))
        .filter(
            MarketingLead.status.in_(
                [MarketingLeadStatus.mql, MarketingLeadStatus.sql, MarketingLeadStatus.opportunity]
            )
        )
        .scalar()
        or 0
    )
    customer_count = (
        db.query(func.count(MarketingLead.id))
        .filter(MarketingLead.status == MarketingLeadStatus.customer)
        .scalar()
        or 0
    )
    pipeline_value = db.query(func.sum(MarketingLead.estimated_value)).scalar() or 0

    channel_spend = db.query(func.sum(MarketingChannelMetric.spend)).scalar() or 0
    channel_revenue = db.query(func.sum(MarketingChannelMetric.revenue)).scalar() or 0
    channel_impressions = db.query(func.sum(MarketingChannelMetric.impressions)).scalar() or 0
    channel_clicks = db.query(func.sum(MarketingChannelMetric.clicks)).scalar() or 0
    channel_conversions = db.query(func.sum(MarketingChannelMetric.conversions)).scalar() or 0
    benchmark_roas_avg = db.query(func.avg(MarketingChannelMetric.benchmark_roas)).scalar()
    benchmark_ctr_avg = db.query(func.avg(MarketingChannelMetric.benchmark_ctr)).scalar()
    benchmark_cvr_avg = db.query(func.avg(MarketingChannelMetric.benchmark_cvr)).scalar()

    spend = float(channel_spend or campaigns_spend or 0)
    revenue = float(channel_revenue or campaigns_revenue or 0)
    impressions = int(channel_impressions or campaigns_impressions or 0)
    clicks = int(channel_clicks or campaigns_clicks or 0)
    conversions = int(channel_conversions or campaigns_conversions or 0)

    roas = _safe_div(revenue, spend)
    ctr = _safe_div(clicks, impressions) * 100
    cvr = _safe_div(conversions, clicks) * 100
    cpa = _safe_div(spend, conversions) if conversions > 0 else 0.0
    cac = _safe_div(spend, customer_count) if customer_count > 0 else 0.0

    roas_target = float(benchmark_roas_avg or DEFAULT_MARKETING_BENCHMARKS["roas"])
    ctr_target = float(benchmark_ctr_avg or DEFAULT_MARKETING_BENCHMARKS["ctr"])
    cvr_target = float(benchmark_cvr_avg or DEFAULT_MARKETING_BENCHMARKS["cvr"])
    cac_target = DEFAULT_MARKETING_BENCHMARKS["cac"]

    return {
        "total_campaigns": campaigns_total,
        "active_campaigns": active_campaigns,
        "total_content_items": content_total,
        "content_pipeline": content_scheduled,
        "total_leads": leads_total,
        "mql_count": mql_count,
        "customers": customer_count,
        "pipeline_value": round(float(pipeline_value), 2),
        "spend": round(spend, 2),
        "revenue": round(revenue, 2),
        "roas": round(roas, 2),
        "ctr": round(ctr, 2),
        "cvr": round(cvr, 2),
        "cpa": round(cpa, 2),
        "cac": round(cac, 2),
        "benchmark_roas": round(roas_target, 2),
        "benchmark_ctr": round(ctr_target, 2),
        "benchmark_cvr": round(cvr_target, 2),
        "benchmark_cac": round(float(cac_target), 2),
        "roas_gap_percent": round((roas - roas_target) * 100 / roas_target, 2) if roas_target else 0,
        "ctr_gap_percent": round((ctr - ctr_target) * 100 / ctr_target, 2) if ctr_target else 0,
        "cvr_gap_percent": round((cvr - cvr_target) * 100 / cvr_target, 2) if cvr_target else 0,
        "cac_gap_percent": round((cac_target - cac) * 100 / cac_target, 2) if cac_target and cac else 0,
    }


# ── Projects & Kanban ─────────────────────────────────
def get_projects(db: Session):
    return db.query(Project).order_by(Project.created_at.desc()).all()


def get_project(db: Session, id: int):
    return db.query(Project).filter(Project.id == id).first()


def create_project(db: Session, data: schemas.ProjectCreate):
    project = Project(**data.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, id: int, data: schemas.ProjectUpdate):
    project = db.query(Project).filter(Project.id == id).first()
    if not project:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(project, k, v)
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, id: int):
    project = db.query(Project).filter(Project.id == id).first()
    if not project:
        return False
    db.delete(project)
    db.commit()
    return True


def get_project_summary(db: Session):
    total = db.query(func.count(Project.id)).scalar() or 0
    active = (
        db.query(func.count(Project.id))
        .filter(Project.status == "active")
        .scalar()
        or 0
    )
    completed = (
        db.query(func.count(Project.id))
        .filter(Project.status == "completed")
        .scalar()
        or 0
    )
    tasks_open = db.query(func.count(KanbanTask.id)).scalar() or 0
    return {
        "total_projects": total,
        "active": active,
        "completed": completed,
        "total_tasks": tasks_open,
    }


def get_columns(db: Session, project_id: int):
    return (
        db.query(KanbanColumn)
        .filter(KanbanColumn.project_id == project_id)
        .order_by(KanbanColumn.position)
        .all()
    )


def create_column(db: Session, data: schemas.ColumnCreate):
    column = KanbanColumn(**data.model_dump())
    db.add(column)
    db.commit()
    db.refresh(column)
    return column


def update_column(db: Session, id: int, data: schemas.ColumnUpdate):
    column = db.query(KanbanColumn).filter(KanbanColumn.id == id).first()
    if not column:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(column, k, v)
    db.commit()
    db.refresh(column)
    return column


def delete_column(db: Session, id: int):
    column = db.query(KanbanColumn).filter(KanbanColumn.id == id).first()
    if not column:
        return False
    db.delete(column)
    db.commit()
    return True


def get_tasks(db: Session, project_id: int):
    return (
        db.query(KanbanTask)
        .filter(KanbanTask.project_id == project_id)
        .order_by(KanbanTask.position)
        .all()
    )


def get_tasks_by_column(db: Session, column_id: int):
    return (
        db.query(KanbanTask)
        .filter(KanbanTask.column_id == column_id)
        .order_by(KanbanTask.position)
        .all()
    )


def create_task(db: Session, data: schemas.TaskCreate):
    task = KanbanTask(**data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, id: int, data: schemas.TaskUpdate):
    task = db.query(KanbanTask).filter(KanbanTask.id == id).first()
    if not task:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(task, k, v)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, id: int):
    task = db.query(KanbanTask).filter(KanbanTask.id == id).first()
    if not task:
        return False
    db.delete(task)
    db.commit()
    return True


def move_task(db: Session, task_id: int, new_column_id: int, new_position: int):
    task = db.query(KanbanTask).filter(KanbanTask.id == task_id).first()
    if not task:
        return None
    task.column_id = new_column_id
    task.position = new_position
    db.commit()
    db.refresh(task)
    return task


# ── Marketplace ───────────────────────────────────────
ESSENTIAL_PLUGINS = [
    {
        "slug": "stripe-billing",
        "name": "Stripe Billing",
        "description": "Sync subscriptions, invoices, and payment statuses from Stripe.",
        "vendor": "Benela",
        "category": PluginCategory.finance,
        "icon": "💳",
        "tags": "payments,billing,finance",
        "price_monthly": 49,
        "price_yearly": 490,
        "is_featured": True,
    },
    {
        "slug": "quickbooks-online",
        "name": "QuickBooks Online",
        "description": "Bi-directional sync for accounts, ledgers, invoices, and expenses.",
        "vendor": "Benela",
        "category": PluginCategory.finance,
        "icon": "📒",
        "tags": "accounting,bookkeeping,finance",
        "price_monthly": 39,
        "price_yearly": 390,
        "is_featured": True,
    },
    {
        "slug": "slack-notify",
        "name": "Slack Notifications",
        "description": "Send workflow alerts and approvals into Slack channels in real time.",
        "vendor": "Benela",
        "category": PluginCategory.communication,
        "icon": "💬",
        "tags": "alerts,chat,automation",
        "price_monthly": 19,
        "price_yearly": 190,
        "is_featured": False,
    },
    {
        "slug": "docu-sign",
        "name": "DocuSign Contracts",
        "description": "Create and manage legally binding e-signature contract workflows.",
        "vendor": "Benela",
        "category": PluginCategory.operations,
        "icon": "✍️",
        "tags": "contracts,legal,operations",
        "price_monthly": 29,
        "price_yearly": 290,
        "is_featured": False,
    },
    {
        "slug": "power-bi-export",
        "name": "Power BI Export",
        "description": "Push curated ERP data marts into Power BI dashboards.",
        "vendor": "Benela",
        "category": PluginCategory.analytics,
        "icon": "📊",
        "tags": "analytics,bi,reporting",
        "price_monthly": 59,
        "price_yearly": 590,
        "is_featured": True,
    },
]

_MARKETPLACE_SEEDED = False


def _seed_marketplace_if_empty(db: Session):
    global _MARKETPLACE_SEEDED
    if _MARKETPLACE_SEEDED:
        return
    count = db.query(func.count(MarketplacePlugin.id)).scalar() or 0
    if count > 0:
        _MARKETPLACE_SEEDED = True
        return
    for plugin_data in ESSENTIAL_PLUGINS:
        db.add(MarketplacePlugin(**plugin_data))
    db.commit()
    _MARKETPLACE_SEEDED = True


def get_marketplace_summary(db: Session, workspace_id: str):
    _seed_marketplace_if_empty(db)
    total_items = (
        db.query(func.count(MarketplacePlugin.id))
        .filter(MarketplacePlugin.is_active == True)
        .scalar()
        or 0
    )
    active = (
        db.query(func.count(PluginInstall.id))
        .filter(
            PluginInstall.workspace_id == workspace_id,
            PluginInstall.status == InstallStatus.installed,
            PluginInstall.is_enabled == True,
        )
        .scalar()
        or 0
    )
    pending = (
        db.query(func.count(PluginPurchase.id))
        .filter(
            PluginPurchase.workspace_id == workspace_id,
            PluginPurchase.status == PurchaseStatus.pending,
        )
        .scalar()
        or 0
    )
    completed = (
        db.query(func.count(PluginPurchase.id))
        .filter(
            PluginPurchase.workspace_id == workspace_id,
            PluginPurchase.status == PurchaseStatus.active,
        )
        .scalar()
        or 0
    )
    monthly_spend = (
        db.query(func.sum(PluginPurchase.amount))
        .filter(
            PluginPurchase.workspace_id == workspace_id,
            PluginPurchase.status == PurchaseStatus.active,
            PluginPurchase.billing_cycle == BillingCycle.monthly,
        )
        .scalar()
        or 0
    )
    return {
        "total_items": total_items,
        "active": active,
        "pending": pending,
        "completed": completed,
        "monthly_spend": round(float(monthly_spend), 2),
    }


def get_marketplace_admin_summary(db: Session):
    _seed_marketplace_if_empty(db)
    total_plugins = db.query(func.count(MarketplacePlugin.id)).scalar() or 0
    active_plugins = (
        db.query(func.count(MarketplacePlugin.id))
        .filter(MarketplacePlugin.is_active == True)
        .scalar()
        or 0
    )
    featured_plugins = (
        db.query(func.count(MarketplacePlugin.id))
        .filter(MarketplacePlugin.is_featured == True)
        .scalar()
        or 0
    )
    total_purchases = db.query(func.count(PluginPurchase.id)).scalar() or 0
    active_installs = (
        db.query(func.count(PluginInstall.id))
        .filter(PluginInstall.status == InstallStatus.installed, PluginInstall.is_enabled == True)
        .scalar()
        or 0
    )
    unique_workspaces = db.query(func.count(func.distinct(PluginPurchase.workspace_id))).scalar() or 0
    monthly_revenue = (
        db.query(func.sum(PluginPurchase.amount))
        .filter(
            PluginPurchase.status == PurchaseStatus.active,
            PluginPurchase.billing_cycle == BillingCycle.monthly,
        )
        .scalar()
        or 0
    )
    return {
        "total_plugins": total_plugins,
        "active_plugins": active_plugins,
        "featured_plugins": featured_plugins,
        "total_purchases": total_purchases,
        "active_installs": active_installs,
        "unique_workspaces": unique_workspaces,
        "monthly_revenue": round(float(monthly_revenue), 2),
    }


def get_marketplace_plugins(
    db: Session,
    category: PluginCategory | None = None,
    q: str | None = None,
):
    _seed_marketplace_if_empty(db)
    query = db.query(MarketplacePlugin).filter(MarketplacePlugin.is_active == True)
    if category:
        query = query.filter(MarketplacePlugin.category == category)
    if q:
        needle = f"%{q.strip()}%"
        query = query.filter(
            or_(
                MarketplacePlugin.name.ilike(needle),
                MarketplacePlugin.description.ilike(needle),
                MarketplacePlugin.tags.ilike(needle),
            )
        )
    return (
        query.order_by(
            MarketplacePlugin.is_featured.desc(),
            MarketplacePlugin.created_at.desc(),
        ).all()
    )


def get_marketplace_plugins_admin(db: Session, q: str | None = None):
    _seed_marketplace_if_empty(db)
    query = db.query(MarketplacePlugin)
    if q:
        needle = f"%{q.strip()}%"
        query = query.filter(
            or_(
                MarketplacePlugin.name.ilike(needle),
                MarketplacePlugin.description.ilike(needle),
                MarketplacePlugin.tags.ilike(needle),
                MarketplacePlugin.slug.ilike(needle),
            )
        )
    return query.order_by(MarketplacePlugin.created_at.desc()).all()


def create_marketplace_plugin(db: Session, data: schemas.MarketplacePluginCreate):
    plugin = MarketplacePlugin(**data.model_dump())
    db.add(plugin)
    db.commit()
    db.refresh(plugin)
    return plugin


def update_marketplace_plugin(db: Session, plugin_id: int, data: schemas.MarketplacePluginUpdate):
    plugin = db.query(MarketplacePlugin).filter(MarketplacePlugin.id == plugin_id).first()
    if not plugin:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(plugin, key, value)
    db.commit()
    db.refresh(plugin)
    return plugin


def get_marketplace_plugin(db: Session, plugin_id: int):
    return db.query(MarketplacePlugin).filter(MarketplacePlugin.id == plugin_id).first()


def get_workspace_purchases(db: Session, workspace_id: str):
    return (
        db.query(PluginPurchase)
        .filter(PluginPurchase.workspace_id == workspace_id)
        .order_by(PluginPurchase.created_at.desc())
        .all()
    )


def get_marketplace_purchases_admin(db: Session, workspace_id: str | None = None):
    query = db.query(PluginPurchase)
    if workspace_id:
        query = query.filter(PluginPurchase.workspace_id == workspace_id)
    return query.order_by(PluginPurchase.created_at.desc()).all()


def get_workspace_installs(db: Session, workspace_id: str):
    return (
        db.query(PluginInstall)
        .filter(PluginInstall.workspace_id == workspace_id)
        .order_by(PluginInstall.updated_at.desc())
        .all()
    )


def get_marketplace_installs_admin(db: Session, workspace_id: str | None = None):
    query = db.query(PluginInstall)
    if workspace_id:
        query = query.filter(PluginInstall.workspace_id == workspace_id)
    return query.order_by(PluginInstall.updated_at.desc()).all()


def purchase_plugin(db: Session, data: schemas.PluginPurchaseCreate):
    plugin = get_marketplace_plugin(db, data.plugin_id)
    if not plugin or not plugin.is_active:
        return None

    existing = (
        db.query(PluginPurchase)
        .filter(
            PluginPurchase.workspace_id == data.workspace_id,
            PluginPurchase.plugin_id == data.plugin_id,
            PluginPurchase.status == PurchaseStatus.active,
        )
        .first()
    )
    if existing:
        return existing

    amount = plugin.price_yearly if data.billing_cycle == BillingCycle.yearly else plugin.price_monthly
    if amount is None:
        amount = plugin.price_monthly

    purchase = PluginPurchase(
        workspace_id=data.workspace_id,
        plugin_id=data.plugin_id,
        billing_cycle=data.billing_cycle,
        amount=amount,
        currency=data.currency,
        status=PurchaseStatus.active,
        started_at=func.now(),
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)

    install = (
        db.query(PluginInstall)
        .filter(
            PluginInstall.workspace_id == data.workspace_id,
            PluginInstall.plugin_id == data.plugin_id,
        )
        .first()
    )
    if install:
        install.purchase_id = purchase.id
        install.status = InstallStatus.installed
        install.is_enabled = True
        install.installed_at = func.now()
    else:
        install = PluginInstall(
            workspace_id=data.workspace_id,
            plugin_id=data.plugin_id,
            purchase_id=purchase.id,
            status=InstallStatus.installed,
            is_enabled=True,
            installed_at=func.now(),
        )
        db.add(install)
    db.commit()
    return purchase


def set_plugin_enabled(
    db: Session,
    workspace_id: str,
    plugin_id: int,
    is_enabled: bool,
):
    install = (
        db.query(PluginInstall)
        .filter(
            PluginInstall.workspace_id == workspace_id,
            PluginInstall.plugin_id == plugin_id,
        )
        .first()
    )
    if not install:
        return None
    install.is_enabled = is_enabled
    install.status = InstallStatus.installed if is_enabled else InstallStatus.uninstalled
    db.commit()
    db.refresh(install)
    return install


# ── Chat ──────────────────────────────────────────────
def get_chat_messages(db: Session, session_id: str, limit: int = 50):
    """Get last N messages for a session, ordered oldest first."""
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .options(selectinload(ChatMessage.attachments))
        .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(rows))


def save_chat_message(
    db: Session,
    session_id: str,
    section: str,
    role: str,
    content: str,
    attachments: list[schemas.ChatAttachmentCreate] | None = None,
):
    """Save a single message."""
    msg = ChatMessage(
        session_id=session_id,
        section=section,
        role=role,
        content=content,
    )
    db.add(msg)
    db.flush()

    for attachment in attachments or []:
        excerpt = (attachment.content_excerpt or "").strip()
        db.add(
            ChatAttachment(
                message_id=msg.id,
                file_name=attachment.file_name.strip(),
                mime_type=attachment.mime_type.strip() if attachment.mime_type else None,
                size_bytes=max(0, int(attachment.size_bytes or 0)),
                content_excerpt=excerpt[:4000] if excerpt else None,
            )
        )

    db.commit()
    db.refresh(msg)
    return msg


def save_chat_exchange(
    db: Session,
    session_id: str,
    section: str,
    user_msg: str,
    assistant_msg: str,
):
    """Save both user and assistant messages in one call."""
    save_chat_message(db, session_id, section, "user", user_msg)
    save_chat_message(db, session_id, section, "assistant", assistant_msg)


def clear_chat_history(db: Session, session_id: str):
    """Delete all messages for a session."""
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.commit()


def get_all_sections_summary(db: Session, session_id: str):
    """Return message count per section for this session."""
    results = (
        db.query(ChatMessage.section, func.count(ChatMessage.id).label("count"))
        .filter(ChatMessage.session_id == session_id)
        .group_by(ChatMessage.section)
        .all()
    )
    return {row.section: row.count for row in results}
