from datetime import datetime, timedelta
import re

from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_
from database.models import (
    Transaction,
    Invoice,
    Employee,
    Position,
    Department,
    TransactionType,
    EmployeeStatus,
    PositionStatus,
    MarketingCampaign,
    MarketingContentItem,
    MarketingLead,
    MarketingChannelMetric,
    MarketingCampaignStatus,
    MarketingContentStatus,
    MarketingLeadStatus,
    LegalDocument,
    LegalContract,
    LegalComplianceTask,
    LegalSearchLog,
    LegalDocumentSource,
    LegalDocumentStatus,
    LegalContractStatus,
    LegalRiskLevel,
    LegalTaskStatus,
    Project,
    ProjectStatus,
    KanbanColumn,
    KanbanTask,
    TaskPriority,
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


def _status_from_score(score: int):
    if score >= 80:
        return "Healthy"
    if score >= 55:
        return "Warning"
    return "Critical"


def _month_window(start: datetime):
    if start.month == 12:
        return start, datetime(start.year + 1, 1, 1)
    return start, datetime(start.year, start.month + 1, 1)


def _max_dt(*values: datetime | None):
    filtered = [v for v in values if v is not None]
    if not filtered:
        return None
    return max(filtered)


def _safe_div(numerator: float, denominator: float):
    if denominator == 0:
        return 0.0
    return float(numerator) / float(denominator)


def _tokenize_query(value: str) -> list[str]:
    return [token for token in re.split(r"\W+", (value or "").lower()) if len(token) > 1]


def _pick_excerpt(text: str | None, query: str, tokens: list[str], max_len: int = 260) -> str:
    body = (text or "").strip()
    if not body:
        return ""

    normalized = re.sub(r"\s+", " ", body)
    search_space = normalized.lower()

    anchors = [query.lower(), *tokens]
    index = -1
    for anchor in anchors:
        if not anchor:
            continue
        index = search_space.find(anchor.lower())
        if index >= 0:
            break

    if index < 0:
        snippet = normalized[:max_len]
        return snippet + ("..." if len(normalized) > max_len else "")

    start = max(0, index - max_len // 3)
    end = min(len(normalized), start + max_len)
    snippet = normalized[start:end]
    if start > 0:
        snippet = "..." + snippet
    if end < len(normalized):
        snippet = snippet + "..."
    return snippet


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

    legal_tasks_today = (
        (db.query(func.count(LegalComplianceTask.id)).filter(LegalComplianceTask.created_at >= today_start).scalar() or 0)
        + (db.query(func.count(LegalDocument.id)).filter(LegalDocument.created_at >= today_start).scalar() or 0)
    )
    legal_alerts = (
        (db.query(func.count(LegalComplianceTask.id))
         .filter(
            LegalComplianceTask.due_date.isnot(None),
            LegalComplianceTask.due_date < now,
            LegalComplianceTask.status != LegalTaskStatus.completed,
         )
         .scalar()
         or 0)
        + (db.query(func.count(LegalContract.id))
           .filter(
               LegalContract.end_date.isnot(None),
               LegalContract.end_date <= now + timedelta(days=30),
               LegalContract.status.in_(
                   [LegalContractStatus.active, LegalContractStatus.in_review, LegalContractStatus.expiring]
               ),
           )
           .scalar()
           or 0)
    )
    legal_last = _max_dt(
        db.query(func.max(LegalComplianceTask.updated_at)).scalar(),
        db.query(func.max(LegalContract.updated_at)).scalar(),
        db.query(func.max(LegalDocument.updated_at)).scalar(),
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
                "module": "⚖️ Legal",
                "status": _status_from_alerts(legal_alerts),
                "tasks_today": str(legal_tasks_today),
                "alerts": str(legal_alerts),
                "last_activity": _time_ago(legal_last),
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


def get_dashboard_command_center(db: Session, workspace_id: str = "default-workspace"):
    overview = get_dashboard_overview(db, workspace_id=workspace_id)

    now = datetime.utcnow()
    month_start, next_month_start, _, _ = _month_bounds(now)
    last_30_days = now - timedelta(days=30)
    next_7_days = now + timedelta(days=7)
    next_30_days = now + timedelta(days=30)

    revenue_total = (
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
    revenue_month = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.type == TransactionType.income,
            Transaction.date >= month_start,
            Transaction.date < next_month_start,
        )
        .scalar()
        or 0
    )
    expense_month = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.type == TransactionType.expense,
            Transaction.date >= month_start,
            Transaction.date < next_month_start,
        )
        .scalar()
        or 0
    )
    pending_receivables = (
        db.query(func.sum(Invoice.amount))
        .filter(Invoice.status.in_(["pending", "overdue"]))
        .scalar()
        or 0
    )
    income_mix_rows = (
        db.query(Transaction.category, func.sum(Transaction.amount))
        .filter(Transaction.type == TransactionType.income)
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc(), Transaction.category.asc())
        .limit(8)
        .all()
    )
    expense_mix_rows = (
        db.query(Transaction.category, func.sum(Transaction.amount))
        .filter(Transaction.type == TransactionType.expense)
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc(), Transaction.category.asc())
        .limit(8)
        .all()
    )
    overdue_invoice_count = (
        db.query(func.count(Invoice.id))
        .filter(
            Invoice.due_date.isnot(None),
            Invoice.due_date < now,
            Invoice.status.in_(["pending", "overdue"]),
        )
        .scalar()
        or 0
    )
    overdue_invoice_amount = (
        db.query(func.sum(Invoice.amount))
        .filter(
            Invoice.due_date.isnot(None),
            Invoice.due_date < now,
            Invoice.status.in_(["pending", "overdue"]),
        )
        .scalar()
        or 0
    )

    active_employees = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == EmployeeStatus.active)
        .scalar()
        or 0
    )
    on_leave_employees = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == EmployeeStatus.on_leave)
        .scalar()
        or 0
    )
    terminated_employees = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == EmployeeStatus.terminated)
        .scalar()
        or 0
    )
    hires_last_30_days = (
        db.query(func.count(Employee.id))
        .filter(Employee.created_at >= last_30_days)
        .scalar()
        or 0
    )
    average_salary = db.query(func.avg(Employee.salary)).filter(Employee.salary.isnot(None)).scalar() or 0
    open_positions = (
        db.query(func.count(Position.id))
        .filter(Position.status == PositionStatus.open)
        .scalar()
        or 0
    )
    department_rows = (
        db.query(
            Employee.department,
            func.count(Employee.id),
            func.coalesce(func.sum(Employee.salary), 0),
        )
        .group_by(Employee.department)
        .order_by(func.count(Employee.id).desc(), Employee.department.asc())
        .limit(10)
        .all()
    )
    department_breakdown = [
        {
            "department": (row[0] or "Unassigned"),
            "headcount": int(row[1] or 0),
            "payroll": round(float(row[2] or 0), 2),
        }
        for row in department_rows
    ]

    total_projects = db.query(func.count(Project.id)).scalar() or 0
    active_projects = (
        db.query(func.count(Project.id))
        .filter(Project.status == ProjectStatus.active)
        .scalar()
        or 0
    )
    on_hold_projects = (
        db.query(func.count(Project.id))
        .filter(Project.status == ProjectStatus.on_hold)
        .scalar()
        or 0
    )
    completed_projects = (
        db.query(func.count(Project.id))
        .filter(Project.status == ProjectStatus.completed)
        .scalar()
        or 0
    )
    overdue_projects = (
        db.query(func.count(Project.id))
        .filter(
            Project.due_date.isnot(None),
            Project.due_date < now,
            Project.status.in_([ProjectStatus.active, ProjectStatus.on_hold]),
        )
        .scalar()
        or 0
    )
    kanban_total = db.query(func.count(KanbanTask.id)).scalar() or 0
    kanban_due_week = (
        db.query(func.count(KanbanTask.id))
        .filter(KanbanTask.due_date.isnot(None), KanbanTask.due_date >= now, KanbanTask.due_date <= next_7_days)
        .scalar()
        or 0
    )
    kanban_overdue = (
        db.query(func.count(KanbanTask.id))
        .filter(KanbanTask.due_date.isnot(None), KanbanTask.due_date < now)
        .scalar()
        or 0
    )
    kanban_critical = (
        db.query(func.count(KanbanTask.id))
        .filter(KanbanTask.priority == TaskPriority.critical)
        .scalar()
        or 0
    )

    marketing_active = (
        db.query(func.count(MarketingCampaign.id))
        .filter(MarketingCampaign.status == MarketingCampaignStatus.active)
        .scalar()
        or 0
    )
    marketing_pipeline = (
        db.query(func.count(MarketingLead.id))
        .filter(MarketingLead.status.in_([MarketingLeadStatus.new, MarketingLeadStatus.mql, MarketingLeadStatus.sql]))
        .scalar()
        or 0
    )
    marketing_opportunities = (
        db.query(func.count(MarketingLead.id))
        .filter(MarketingLead.status == MarketingLeadStatus.opportunity)
        .scalar()
        or 0
    )
    marketing_customers = (
        db.query(func.count(MarketingLead.id))
        .filter(MarketingLead.status == MarketingLeadStatus.customer)
        .scalar()
        or 0
    )
    marketing_spend = db.query(func.sum(MarketingCampaign.spent)).scalar() or 0
    marketing_revenue = db.query(func.sum(MarketingCampaign.revenue)).scalar() or 0
    marketing_leads_total = db.query(func.sum(MarketingChannelMetric.leads)).scalar() or 0

    legal_high_risk_contracts = (
        db.query(func.count(LegalContract.id))
        .filter(LegalContract.risk_level.in_([LegalRiskLevel.high, LegalRiskLevel.critical]))
        .scalar()
        or 0
    )
    legal_expiring_30d = (
        db.query(func.count(LegalContract.id))
        .filter(
            LegalContract.end_date.isnot(None),
            LegalContract.end_date <= next_30_days,
            LegalContract.end_date >= now - timedelta(days=1),
            LegalContract.status.in_([LegalContractStatus.active, LegalContractStatus.in_review, LegalContractStatus.expiring]),
        )
        .scalar()
        or 0
    )
    legal_overdue_tasks = (
        db.query(func.count(LegalComplianceTask.id))
        .filter(
            LegalComplianceTask.due_date.isnot(None),
            LegalComplianceTask.due_date < now,
            LegalComplianceTask.status != LegalTaskStatus.completed,
        )
        .scalar()
        or 0
    )
    legal_open_tasks = (
        db.query(func.count(LegalComplianceTask.id))
        .filter(LegalComplianceTask.status.in_([LegalTaskStatus.open, LegalTaskStatus.in_progress, LegalTaskStatus.blocked]))
        .scalar()
        or 0
    )
    legal_review_due_docs = (
        db.query(func.count(LegalDocument.id))
        .filter(
            LegalDocument.last_reviewed_at.isnot(None),
            LegalDocument.last_reviewed_at < now - timedelta(days=365),
            LegalDocument.status == LegalDocumentStatus.active,
        )
        .scalar()
        or 0
    )

    net_total = float(revenue_total) - float(expense_total)
    net_month = float(revenue_month) - float(expense_month)
    gross_margin = _safe_div(net_total, float(revenue_total)) * 100
    roi_marketing = _safe_div(float(marketing_revenue), float(marketing_spend)) if marketing_spend else 0.0
    cost_per_lead = _safe_div(float(marketing_spend), float(marketing_leads_total)) if marketing_leads_total else 0.0
    project_completion_rate = _safe_div(float(completed_projects), float(total_projects)) * 100 if total_projects else 0.0
    invoice_collection_risk = _safe_div(float(overdue_invoice_amount), float(pending_receivables)) * 100 if pending_receivables else 0.0
    income_mix_total = sum(float(row[1] or 0) for row in income_mix_rows)
    expense_mix_total = sum(float(row[1] or 0) for row in expense_mix_rows)
    income_mix = [
        {
            "category": (row[0] or "Uncategorized"),
            "amount": round(float(row[1] or 0), 2),
            "share_percent": round(_safe_div(float(row[1] or 0), income_mix_total) * 100, 1),
        }
        for row in income_mix_rows
    ]
    expense_mix = [
        {
            "category": (row[0] or "Uncategorized"),
            "amount": round(float(row[1] or 0), 2),
            "share_percent": round(_safe_div(float(row[1] or 0), expense_mix_total) * 100, 1),
        }
        for row in expense_mix_rows
    ]

    finance_alerts = overdue_invoice_count + (1 if net_month < 0 else 0)
    people_alerts = on_leave_employees + terminated_employees
    operations_alerts = overdue_projects + kanban_overdue + on_hold_projects
    marketing_alerts = (1 if marketing_active == 0 else 0) + (1 if roi_marketing < 1.2 and marketing_spend > 0 else 0)
    legal_alerts = legal_high_risk_contracts + legal_overdue_tasks + legal_expiring_30d

    finance_score = max(0, 100 - finance_alerts * 12 - (12 if net_month < 0 else 0))
    people_score = max(0, 100 - people_alerts * 8 + (4 if hires_last_30_days > 0 else 0))
    operations_score = max(0, 100 - operations_alerts * 8)
    marketing_score = max(0, 100 - marketing_alerts * 18 + (6 if marketing_customers > 0 else 0))
    legal_score = max(0, 100 - legal_alerts * 9)

    module_scores = [
        {
            "module": "Finance",
            "score": int(finance_score),
            "status": _status_from_score(int(finance_score)),
            "summary": f"{overdue_invoice_count} overdue invoices, month net ${net_month:,.0f}",
        },
        {
            "module": "People",
            "score": int(people_score),
            "status": _status_from_score(int(people_score)),
            "summary": f"{active_employees} active, {open_positions} open positions",
        },
        {
            "module": "Operations",
            "score": int(operations_score),
            "status": _status_from_score(int(operations_score)),
            "summary": f"{kanban_overdue} overdue tasks, {on_hold_projects} on hold projects",
        },
        {
            "module": "Marketing",
            "score": int(marketing_score),
            "status": _status_from_score(int(marketing_score)),
            "summary": f"ROAS {roi_marketing:.2f}x, {marketing_pipeline} pipeline leads",
        },
        {
            "module": "Legal",
            "score": int(legal_score),
            "status": _status_from_score(int(legal_score)),
            "summary": f"{legal_high_risk_contracts} high-risk contracts, {legal_overdue_tasks} overdue tasks",
        },
    ]

    priorities: list[dict] = []
    if overdue_invoice_count > 0:
        priorities.append(
            {
                "title": "Collect overdue invoices",
                "owner": "Finance Lead",
                "severity": "high" if overdue_invoice_count >= 3 else "medium",
                "detail": f"{overdue_invoice_count} invoices overdue, ${float(overdue_invoice_amount):,.0f} at risk.",
            }
        )
    if kanban_overdue > 0 or overdue_projects > 0:
        priorities.append(
            {
                "title": "Recover delayed delivery",
                "owner": "Operations Manager",
                "severity": "high" if kanban_overdue >= 8 else "medium",
                "detail": f"{kanban_overdue} overdue tasks across {overdue_projects} overdue projects.",
            }
        )
    if legal_high_risk_contracts > 0 or legal_overdue_tasks > 0:
        priorities.append(
            {
                "title": "Mitigate legal exposure",
                "owner": "Legal Counsel",
                "severity": "high" if legal_high_risk_contracts > 0 else "medium",
                "detail": f"{legal_high_risk_contracts} high-risk contracts and {legal_overdue_tasks} overdue compliance tasks.",
            }
        )
    if marketing_active == 0:
        priorities.append(
            {
                "title": "Reactivate growth engine",
                "owner": "Marketing Lead",
                "severity": "medium",
                "detail": "No active campaigns currently running.",
            }
        )
    if not priorities:
        priorities.append(
            {
                "title": "Maintain execution rhythm",
                "owner": "Executive Team",
                "severity": "low",
                "detail": "No critical blockers detected. Focus on optimization and growth experiments.",
            }
        )

    insights: list[str] = []
    if net_total < 0:
        insights.append("Company is operating at a cumulative net loss. Review burn drivers and pricing discipline.")
    if invoice_collection_risk >= 35:
        insights.append("Receivables concentration risk is elevated. Prioritize collection workflows this week.")
    if project_completion_rate < 35 and total_projects > 0:
        insights.append("Project completion ratio is low. Rebalance staffing and reduce WIP to improve throughput.")
    if roi_marketing > 3 and marketing_spend > 0:
        insights.append("Marketing efficiency is strong. Consider controlled budget expansion on winning channels.")
    if legal_high_risk_contracts > 0:
        insights.append("High-risk contracts detected. Fast-track redline and renegotiation cycle.")
    if not insights:
        insights.append("Performance is stable. Move from monitoring to strategic optimization across modules.")

    recent_activity: list[dict] = []

    latest_transactions = (
        db.query(Transaction)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(4)
        .all()
    )
    for row in latest_transactions:
        ts = row.date or row.created_at
        amount_sign = "+" if row.type == TransactionType.income else "-"
        recent_activity.append(
            {
                "module": "Finance",
                "title": f"{amount_sign}${float(row.amount):,.0f} {row.category}",
                "detail": row.description,
                "at": ts.isoformat() + "Z" if ts else None,
                "ago": _time_ago(ts),
            }
        )

    latest_projects = db.query(Project).order_by(Project.updated_at.desc(), Project.id.desc()).limit(4).all()
    for row in latest_projects:
        ts = row.updated_at or row.created_at
        recent_activity.append(
            {
                "module": "Projects",
                "title": f"{row.name} · {row.status.value if hasattr(row.status, 'value') else row.status}",
                "detail": row.owner or "Owner not assigned",
                "at": ts.isoformat() + "Z" if ts else None,
                "ago": _time_ago(ts),
            }
        )

    latest_employees = db.query(Employee).order_by(Employee.created_at.desc(), Employee.id.desc()).limit(3).all()
    for row in latest_employees:
        ts = row.created_at
        recent_activity.append(
            {
                "module": "People",
                "title": f"{row.full_name} joined {row.department}",
                "detail": row.role,
                "at": ts.isoformat() + "Z" if ts else None,
                "ago": _time_ago(ts),
            }
        )

    latest_legal_tasks = (
        db.query(LegalComplianceTask)
        .order_by(LegalComplianceTask.updated_at.desc(), LegalComplianceTask.id.desc())
        .limit(3)
        .all()
    )
    for row in latest_legal_tasks:
        ts = row.updated_at or row.created_at
        recent_activity.append(
            {
                "module": "Legal",
                "title": row.title,
                "detail": f"{row.status.value if hasattr(row.status, 'value') else row.status} · {row.risk_level.value if hasattr(row.risk_level, 'value') else row.risk_level}",
                "at": ts.isoformat() + "Z" if ts else None,
                "ago": _time_ago(ts),
            }
        )

    latest_marketing = (
        db.query(MarketingCampaign)
        .order_by(MarketingCampaign.updated_at.desc(), MarketingCampaign.id.desc())
        .limit(3)
        .all()
    )
    for row in latest_marketing:
        ts = row.updated_at or row.created_at
        recent_activity.append(
            {
                "module": "Marketing",
                "title": row.name,
                "detail": f"{row.channel} · {row.status.value if hasattr(row.status, 'value') else row.status}",
                "at": ts.isoformat() + "Z" if ts else None,
                "ago": _time_ago(ts),
            }
        )

    recent_activity.sort(key=lambda item: item.get("at") or "", reverse=True)
    recent_activity = recent_activity[:14]

    cashflow_trend: list[dict] = []
    for offset in range(5, -1, -1):
        month_anchor = datetime(now.year, now.month, 1)
        month = month_anchor.month - offset
        year = month_anchor.year
        while month <= 0:
            month += 12
            year -= 1
        start = datetime(year, month, 1)
        start_window, end_window = _month_window(start)
        month_income = (
            db.query(func.sum(Transaction.amount))
            .filter(
                Transaction.type == TransactionType.income,
                Transaction.date >= start_window,
                Transaction.date < end_window,
            )
            .scalar()
            or 0
        )
        month_expense = (
            db.query(func.sum(Transaction.amount))
            .filter(
                Transaction.type == TransactionType.expense,
                Transaction.date >= start_window,
                Transaction.date < end_window,
            )
            .scalar()
            or 0
        )
        cashflow_trend.append(
            {
                "month": start_window.strftime("%b %Y"),
                "income": round(float(month_income), 2),
                "expense": round(float(month_expense), 2),
                "net": round(float(month_income) - float(month_expense), 2),
            }
        )

    return {
        "overview": overview,
        "headline": [
            {"label": "Revenue", "value": f"${float(revenue_total):,.0f}", "tone": "success"},
            {"label": "Net Profit", "value": f"${net_total:,.0f}", "tone": "success" if net_total >= 0 else "danger"},
            {"label": "Pending Receivables", "value": f"${float(pending_receivables):,.0f}", "tone": "warning"},
            {"label": "Active Employees", "value": str(active_employees), "tone": "info"},
            {"label": "Projects In Flight", "value": str(active_projects), "tone": "info"},
            {"label": "Compliance Risk Items", "value": str(legal_high_risk_contracts + legal_overdue_tasks), "tone": "danger" if (legal_high_risk_contracts + legal_overdue_tasks) > 0 else "success"},
        ],
        "finance": {
            "revenue_total": round(float(revenue_total), 2),
            "expense_total": round(float(expense_total), 2),
            "net_total": round(net_total, 2),
            "revenue_month": round(float(revenue_month), 2),
            "expense_month": round(float(expense_month), 2),
            "net_month": round(net_month, 2),
            "gross_margin_percent": round(gross_margin, 1),
            "pending_receivables": round(float(pending_receivables), 2),
            "overdue_invoice_count": int(overdue_invoice_count),
            "overdue_invoice_amount": round(float(overdue_invoice_amount), 2),
        },
        "workforce": {
            "active": int(active_employees),
            "on_leave": int(on_leave_employees),
            "terminated": int(terminated_employees),
            "hires_last_30_days": int(hires_last_30_days),
            "average_salary": round(float(average_salary), 2),
            "open_positions": int(open_positions),
        },
        "department_breakdown": department_breakdown,
        "operations": {
            "projects_total": int(total_projects),
            "projects_active": int(active_projects),
            "projects_on_hold": int(on_hold_projects),
            "projects_completed": int(completed_projects),
            "projects_overdue": int(overdue_projects),
            "tasks_total": int(kanban_total),
            "tasks_due_7_days": int(kanban_due_week),
            "tasks_overdue": int(kanban_overdue),
            "tasks_critical_priority": int(kanban_critical),
            "project_completion_percent": round(project_completion_rate, 1),
        },
        "marketing": {
            "campaigns_active": int(marketing_active),
            "pipeline_leads": int(marketing_pipeline),
            "opportunities": int(marketing_opportunities),
            "customers": int(marketing_customers),
            "spend": round(float(marketing_spend), 2),
            "revenue": round(float(marketing_revenue), 2),
            "roas": round(float(roi_marketing), 2),
            "cost_per_lead": round(float(cost_per_lead), 2),
        },
        "finance_mix": {"income": income_mix, "expenses": expense_mix},
        "legal": {
            "high_risk_contracts": int(legal_high_risk_contracts),
            "expiring_contracts_30_days": int(legal_expiring_30d),
            "open_compliance_tasks": int(legal_open_tasks),
            "overdue_compliance_tasks": int(legal_overdue_tasks),
            "review_due_documents": int(legal_review_due_docs),
        },
        "module_scores": module_scores,
        "priority_actions": priorities[:6],
        "insights": insights[:6],
        "cashflow_trend": cashflow_trend,
        "recent_activity": recent_activity,
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


# ── Legal ──────────────────────────────────────────────
DEFAULT_LEGAL_BENCHMARKS = {
    "contract_review_sla_days": 5,
    "compliance_task_closure_days": 14,
    "overdue_task_threshold_percent": 5,
    "policy_review_cycle_days": 180,
}


def get_legal_documents(
    db: Session,
    skip: int = 0,
    limit: int = 200,
    jurisdiction: str | None = None,
    category: str | None = None,
    source: str | None = None,
):
    query = db.query(LegalDocument)
    if jurisdiction:
        query = query.filter(LegalDocument.jurisdiction.ilike(f"%{jurisdiction.strip()}%"))
    if category:
        query = query.filter(LegalDocument.category.ilike(f"%{category.strip()}%"))
    if source:
        try:
            query = query.filter(LegalDocument.source == LegalDocumentSource(source.strip().lower()))
        except ValueError:
            pass
    return (
        query.order_by(LegalDocument.updated_at.desc(), LegalDocument.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_legal_document(db: Session, data: schemas.LegalDocumentCreate):
    row = LegalDocument(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_legal_document(db: Session, id: int, data: schemas.LegalDocumentUpdate):
    row = db.query(LegalDocument).filter(LegalDocument.id == id).first()
    if not row:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_legal_document(db: Session, id: int):
    row = db.query(LegalDocument).filter(LegalDocument.id == id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def get_legal_contracts(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(LegalContract)
        .order_by(LegalContract.updated_at.desc(), LegalContract.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_legal_contract(db: Session, data: schemas.LegalContractCreate):
    row = LegalContract(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_legal_contract(db: Session, id: int, data: schemas.LegalContractUpdate):
    row = db.query(LegalContract).filter(LegalContract.id == id).first()
    if not row:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_legal_contract(db: Session, id: int):
    row = db.query(LegalContract).filter(LegalContract.id == id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def get_legal_compliance_tasks(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(LegalComplianceTask)
        .order_by(LegalComplianceTask.updated_at.desc(), LegalComplianceTask.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_legal_compliance_task(db: Session, data: schemas.LegalComplianceTaskCreate):
    row = LegalComplianceTask(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_legal_compliance_task(db: Session, id: int, data: schemas.LegalComplianceTaskUpdate):
    row = db.query(LegalComplianceTask).filter(LegalComplianceTask.id == id).first()
    if not row:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_legal_compliance_task(db: Session, id: int):
    row = db.query(LegalComplianceTask).filter(LegalComplianceTask.id == id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def get_legal_benchmarks():
    return {
        "source": "International legal operations benchmark profile (SaaS and enterprise legal teams)",
        "contract_review_sla_days": DEFAULT_LEGAL_BENCHMARKS["contract_review_sla_days"],
        "compliance_task_closure_days": DEFAULT_LEGAL_BENCHMARKS["compliance_task_closure_days"],
        "overdue_task_threshold_percent": DEFAULT_LEGAL_BENCHMARKS["overdue_task_threshold_percent"],
        "policy_review_cycle_days": DEFAULT_LEGAL_BENCHMARKS["policy_review_cycle_days"],
    }


def get_legal_summary(db: Session):
    now = datetime.utcnow()
    in_30_days = now + timedelta(days=30)
    review_cutoff = now - timedelta(days=DEFAULT_LEGAL_BENCHMARKS["policy_review_cycle_days"])

    documents_total = db.query(func.count(LegalDocument.id)).scalar() or 0
    active_documents = (
        db.query(func.count(LegalDocument.id))
        .filter(LegalDocument.status == LegalDocumentStatus.active)
        .scalar()
        or 0
    )
    lex_documents = (
        db.query(func.count(LegalDocument.id))
        .filter(LegalDocument.source == LegalDocumentSource.lex_uz)
        .scalar()
        or 0
    )
    review_due_documents = (
        db.query(func.count(LegalDocument.id))
        .filter(
            or_(
                LegalDocument.last_reviewed_at.is_(None),
                LegalDocument.last_reviewed_at < review_cutoff,
            )
        )
        .scalar()
        or 0
    )

    contracts_total = db.query(func.count(LegalContract.id)).scalar() or 0
    active_contracts = (
        db.query(func.count(LegalContract.id))
        .filter(
            LegalContract.status.in_(
                [LegalContractStatus.active, LegalContractStatus.in_review, LegalContractStatus.expiring]
            )
        )
        .scalar()
        or 0
    )
    expiring_contracts = (
        db.query(func.count(LegalContract.id))
        .filter(
            LegalContract.end_date.isnot(None),
            LegalContract.end_date >= now,
            LegalContract.end_date <= in_30_days,
            LegalContract.status.in_(
                [LegalContractStatus.active, LegalContractStatus.in_review, LegalContractStatus.expiring]
            ),
        )
        .scalar()
        or 0
    )
    high_risk_contracts = (
        db.query(func.count(LegalContract.id))
        .filter(
            LegalContract.risk_level.in_([LegalRiskLevel.high, LegalRiskLevel.critical]),
            LegalContract.status.in_(
                [LegalContractStatus.active, LegalContractStatus.in_review, LegalContractStatus.expiring]
            ),
        )
        .scalar()
        or 0
    )

    tasks_total = db.query(func.count(LegalComplianceTask.id)).scalar() or 0
    open_tasks = (
        db.query(func.count(LegalComplianceTask.id))
        .filter(LegalComplianceTask.status.in_([LegalTaskStatus.open, LegalTaskStatus.in_progress, LegalTaskStatus.blocked]))
        .scalar()
        or 0
    )
    overdue_tasks = (
        db.query(func.count(LegalComplianceTask.id))
        .filter(
            LegalComplianceTask.due_date.isnot(None),
            LegalComplianceTask.due_date < now,
            LegalComplianceTask.status != LegalTaskStatus.completed,
        )
        .scalar()
        or 0
    )
    high_risk_tasks = (
        db.query(func.count(LegalComplianceTask.id))
        .filter(
            LegalComplianceTask.risk_level.in_([LegalRiskLevel.high, LegalRiskLevel.critical]),
            LegalComplianceTask.status != LegalTaskStatus.completed,
        )
        .scalar()
        or 0
    )

    overdue_ratio = (float(overdue_tasks) / float(open_tasks) * 100) if open_tasks else 0.0

    return {
        "documents_total": documents_total,
        "active_documents": active_documents,
        "lex_documents": lex_documents,
        "review_due_documents": review_due_documents,
        "contracts_total": contracts_total,
        "active_contracts": active_contracts,
        "expiring_contracts_30d": expiring_contracts,
        "high_risk_contracts": high_risk_contracts,
        "tasks_total": tasks_total,
        "open_tasks": open_tasks,
        "overdue_tasks": overdue_tasks,
        "high_risk_tasks": high_risk_tasks,
        "overdue_ratio_percent": round(overdue_ratio, 2),
    }


def search_legal_documents(
    db: Session,
    query: str,
    jurisdiction: str | None = None,
    category: str | None = None,
    source: str | None = None,
    limit: int = 20,
):
    cleaned = (query or "").strip()
    if not cleaned:
        return []

    limit = max(1, min(limit, 100))
    tokens = _tokenize_query(cleaned)[:12]
    phrase = cleaned.lower()
    like = f"%{cleaned}%"

    db_query = db.query(LegalDocument).filter(
        or_(
            LegalDocument.title.ilike(like),
            LegalDocument.document_number.ilike(like),
            LegalDocument.summary.ilike(like),
            LegalDocument.full_text.ilike(like),
            LegalDocument.tags.ilike(like),
        )
    )
    if jurisdiction:
        db_query = db_query.filter(LegalDocument.jurisdiction.ilike(f"%{jurisdiction.strip()}%"))
    if category:
        db_query = db_query.filter(LegalDocument.category.ilike(f"%{category.strip()}%"))
    if source:
        try:
            db_query = db_query.filter(LegalDocument.source == LegalDocumentSource(source.strip().lower()))
        except ValueError:
            pass

    candidates = (
        db_query.order_by(LegalDocument.updated_at.desc(), LegalDocument.id.desc())
        .limit(max(limit * 4, 40))
        .all()
    )

    ranked: list[dict] = []
    for row in candidates:
        title = (row.title or "").lower()
        doc_no = (row.document_number or "").lower()
        summary = (row.summary or "").lower()
        full_text = (row.full_text or "").lower()
        tags = (row.tags or "").lower()
        source_value = row.source.value if isinstance(row.source, LegalDocumentSource) else str(row.source or "internal")
        status_value = row.status.value if isinstance(row.status, LegalDocumentStatus) else str(row.status or "active")

        score = 0.0
        if phrase and phrase in title:
            score += 4.0
        if phrase and phrase in doc_no:
            score += 2.0
        for token in tokens:
            if token in title:
                score += 2.0
            if token in doc_no:
                score += 1.4
            if token in summary:
                score += 1.1
            if token in tags:
                score += 0.8
            if token in full_text:
                score += 0.35

        if status_value == LegalDocumentStatus.active.value:
            score += 0.3
        if source_value == LegalDocumentSource.lex_uz.value:
            score += 0.2
        if score <= 0:
            score = 0.1

        excerpt_source = row.summary or row.full_text or ""
        excerpt = _pick_excerpt(excerpt_source, cleaned, tokens)

        ranked.append(
            {
                "id": row.id,
                "title": row.title,
                "document_number": row.document_number,
                "jurisdiction": row.jurisdiction,
                "category": row.category,
                "source": source_value,
                "source_url": row.source_url,
                "published_at": row.published_at,
                "excerpt": excerpt,
                "relevance_score": round(score, 3),
            }
        )

    ranked.sort(
        key=lambda item: (
            item["relevance_score"],
            item["published_at"] or datetime.min,
        ),
        reverse=True,
    )
    return ranked[:limit]


def create_legal_search_log(
    db: Session,
    query_text: str,
    jurisdiction: str | None = None,
    category: str | None = None,
    source: str | None = None,
    provider: str | None = None,
    results_count: int = 0,
):
    row = LegalSearchLog(
        query_text=(query_text or "").strip(),
        jurisdiction=jurisdiction.strip() if jurisdiction else None,
        category=category.strip() if category else None,
        source=source.strip() if source else None,
        provider=provider.strip() if provider else None,
        results_count=max(0, int(results_count)),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_legal_search_logs(db: Session, limit: int = 20):
    return (
        db.query(LegalSearchLog)
        .order_by(LegalSearchLog.created_at.desc(), LegalSearchLog.id.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )


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
