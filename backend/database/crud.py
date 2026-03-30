from datetime import datetime, timedelta
import re
from datetime import time as time_value

import bcrypt
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
    SalesProduct,
    SalesOrder,
    SalesOrderItem,
    SalesInventoryAdjustment,
    SalesProductStatus,
    SalesOrderStatus,
    SupportTicket,
    SupportTicketStatus,
    SupportTicketPriority,
    SupplyChainItem,
    SupplyChainShipment,
    SupplyChainItemStatus,
    SupplyChainShipmentStatus,
    SupplyChainShipmentDirection,
    ProcurementRequest,
    ProcurementRequestStatus,
    ProcurementRequestPriority,
    InsightReport,
    InsightReportStatus,
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


SALES_INVENTORY_IMPACT_STATUSES = {
    SalesOrderStatus.pending,
    SalesOrderStatus.paid,
    SalesOrderStatus.fulfilled,
}
SALES_CLOSED_STATUSES = {SalesOrderStatus.paid, SalesOrderStatus.fulfilled}
SALES_NON_CURRENT_STATUSES = {SalesProductStatus.discontinued, SalesProductStatus.archived}


def _sales_order_impacts_inventory(status: SalesOrderStatus | str | None) -> bool:
    if status is None:
        return False
    if isinstance(status, SalesOrderStatus):
        return status in SALES_INVENTORY_IMPACT_STATUSES
    try:
        return SalesOrderStatus(status) in SALES_INVENTORY_IMPACT_STATUSES
    except ValueError:
        return False


def _derive_sales_product_status(
    stock_qty: int,
    reorder_level: int,
    is_current: bool,
    current_status: SalesProductStatus,
) -> SalesProductStatus:
    if current_status in SALES_NON_CURRENT_STATUSES:
        return current_status
    if not is_current:
        return SalesProductStatus.discontinued
    if stock_qty <= 0:
        return SalesProductStatus.out_of_stock
    threshold = max(reorder_level, 0)
    if stock_qty <= threshold:
        return SalesProductStatus.low_stock
    return SalesProductStatus.active


def _update_product_operational_status(product: SalesProduct):
    if product.status in SALES_NON_CURRENT_STATUSES:
        product.is_current = False
        return
    product.status = _derive_sales_product_status(
        stock_qty=int(product.stock_qty or 0),
        reorder_level=int(product.reorder_level or 0),
        is_current=bool(product.is_current),
        current_status=product.status,
    )


def _derive_supply_chain_item_status(
    on_hand_qty: int,
    reorder_point: int,
    current_status: SupplyChainItemStatus,
) -> SupplyChainItemStatus:
    if current_status == SupplyChainItemStatus.discontinued:
        return current_status
    if on_hand_qty <= 0:
        return SupplyChainItemStatus.out_of_stock
    threshold = max(reorder_point, 0)
    if on_hand_qty <= threshold:
        return SupplyChainItemStatus.low_stock
    return SupplyChainItemStatus.healthy


def _refresh_supply_chain_item_status(item: SupplyChainItem):
    item.status = _derive_supply_chain_item_status(
        on_hand_qty=int(item.on_hand_qty or 0),
        reorder_point=int(item.reorder_point or 0),
        current_status=item.status,
    )


def _prepare_sales_order_items(db: Session, items: list[schemas.SalesOrderItemIn]):
    prepared: list[dict] = []
    for idx, item in enumerate(items):
        product: SalesProduct | None = None
        if item.product_id is not None:
            product = db.query(SalesProduct).filter(SalesProduct.id == item.product_id).first()
            if not product:
                raise ValueError(f"Product {item.product_id} was not found.")

        sku = item.sku or (product.sku if product else None)
        product_name = item.product_name or (product.name if product else None)
        if not sku:
            raise ValueError(f"Order item #{idx + 1} is missing SKU.")
        if not product_name:
            raise ValueError(f"Order item #{idx + 1} is missing product name.")

        quantity = int(item.quantity)
        if quantity <= 0:
            raise ValueError(f"Order item '{product_name}' must have quantity above zero.")

        unit_price = float(item.unit_price if item.unit_price is not None else (product.unit_price if product else 0))
        unit_cost = float(item.unit_cost if item.unit_cost is not None else (product.unit_cost if product else 0))
        line_discount = max(float(item.line_discount or 0), 0.0)
        line_base = max(quantity * unit_price, 0.0)
        line_total = max(line_base - line_discount, 0.0)

        prepared.append(
            {
                "product": product,
                "product_id": product.id if product else None,
                "sku": sku,
                "product_name": product_name,
                "quantity": quantity,
                "unit_price": unit_price,
                "unit_cost": unit_cost,
                "line_discount": line_discount,
                "line_total": line_total,
            }
        )
    return prepared


def _compute_sales_order_totals(
    prepared_items: list[dict],
    discount_total: float,
    tax_total: float,
    shipping_total: float,
):
    subtotal = sum(float(item["line_total"]) for item in prepared_items)
    total = max(subtotal - max(discount_total, 0.0) + max(tax_total, 0.0) + max(shipping_total, 0.0), 0.0)
    return round(subtotal, 2), round(total, 2)


def _apply_sales_order_inventory_effect(
    db: Session,
    order: SalesOrder,
    items: list[SalesOrderItem],
    consume: bool,
):
    movement_reason = "order_sale" if consume else "order_reversal"
    movement_sign = -1 if consume else 1
    now = datetime.utcnow()

    for item in items:
        if item.product_id is None:
            continue

        product = db.query(SalesProduct).filter(SalesProduct.id == item.product_id).first()
        if not product:
            continue

        quantity = int(item.quantity or 0)
        if quantity <= 0:
            continue

        if consume and product.stock_qty < quantity:
            raise ValueError(
                f"Insufficient stock for {product.name} ({product.sku}). Available {product.stock_qty}, requested {quantity}."
            )

        product.stock_qty = int(product.stock_qty or 0) + (movement_sign * quantity)
        if consume:
            product.total_sold_units = int(product.total_sold_units or 0) + quantity
            product.total_revenue = round(float(product.total_revenue or 0) + float(item.line_total or 0), 2)
            product.last_sold_at = now
        else:
            product.total_sold_units = max(int(product.total_sold_units or 0) - quantity, 0)
            product.total_revenue = max(round(float(product.total_revenue or 0) - float(item.line_total or 0), 2), 0.0)

        _update_product_operational_status(product)
        db.add(
            SalesInventoryAdjustment(
                product_id=product.id,
                order_id=order.id,
                change_qty=movement_sign * quantity,
                reason=movement_reason,
                reference=order.order_number,
                notes=f"Inventory movement for order {order.order_number}",
                actor="system",
            )
        )


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
def get_transactions(db: Session, skip: int = 0, limit: int = 100, company_id: int | None = None):
    query = db.query(Transaction)
    if company_id is not None:
        query = query.filter(Transaction.company_id == company_id)
    return query.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()

def get_transaction(db: Session, id: int, company_id: int | None = None):
    query = db.query(Transaction).filter(Transaction.id == id)
    if company_id is not None:
        query = query.filter(Transaction.company_id == company_id)
    return query.first()

def create_transaction(db: Session, data: schemas.TransactionCreate, company_id: int | None = None):
    tx = Transaction(**data.model_dump(), company_id=company_id)
    db.add(tx); db.commit(); db.refresh(tx)
    return tx

def update_transaction(db: Session, id: int, data: schemas.TransactionUpdate, company_id: int | None = None):
    query = db.query(Transaction).filter(Transaction.id == id)
    if company_id is not None:
        query = query.filter(Transaction.company_id == company_id)
    tx = query.first()
    if not tx: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(tx, k, v)
    db.commit(); db.refresh(tx)
    return tx

def delete_transaction(db: Session, id: int, company_id: int | None = None):
    query = db.query(Transaction).filter(Transaction.id == id)
    if company_id is not None:
        query = query.filter(Transaction.company_id == company_id)
    tx = query.first()
    if not tx: return False
    db.delete(tx); db.commit()
    return True

def get_finance_summary(db: Session, company_id: int | None = None):
    income_query = db.query(func.sum(Transaction.amount)).filter(Transaction.type == TransactionType.income)
    expense_query = db.query(func.sum(Transaction.amount)).filter(Transaction.type == TransactionType.expense)
    pending_query = db.query(func.count(Invoice.id)).filter(Invoice.status == "pending")
    if company_id is not None:
        income_query = income_query.filter(Transaction.company_id == company_id)
        expense_query = expense_query.filter(Transaction.company_id == company_id)
        pending_query = pending_query.filter(Invoice.company_id == company_id)
    income = (
        income_query.scalar()
        or 0
    )
    expenses = (
        expense_query.scalar()
        or 0
    )
    pending = (
        pending_query.scalar()
        or 0
    )
    return {
        "total_income": round(income, 2),
        "total_expenses": round(expenses, 2),
        "net_profit": round(income - expenses, 2),
        "pending_invoices": pending,
    }

def get_invoices(db: Session, skip: int = 0, limit: int = 100, company_id: int | None = None):
    query = db.query(Invoice)
    if company_id is not None:
        query = query.filter(Invoice.company_id == company_id)
    return query.order_by(Invoice.issue_date.desc()).offset(skip).limit(limit).all()

def get_invoice(db: Session, id: int, company_id: int | None = None):
    query = db.query(Invoice).filter(Invoice.id == id)
    if company_id is not None:
        query = query.filter(Invoice.company_id == company_id)
    return query.first()

def create_invoice(db: Session, data: schemas.InvoiceCreate, company_id: int | None = None):
    inv = Invoice(**data.model_dump(), company_id=company_id)
    db.add(inv); db.commit(); db.refresh(inv)
    return inv

def update_invoice(db: Session, id: int, data: schemas.InvoiceUpdate, company_id: int | None = None):
    query = db.query(Invoice).filter(Invoice.id == id)
    if company_id is not None:
        query = query.filter(Invoice.company_id == company_id)
    inv = query.first()
    if not inv: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(inv, k, v)
    db.commit(); db.refresh(inv)
    return inv

def delete_invoice(db: Session, id: int, company_id: int | None = None):
    query = db.query(Invoice).filter(Invoice.id == id)
    if company_id is not None:
        query = query.filter(Invoice.company_id == company_id)
    inv = query.first()
    if not inv: return False
    db.delete(inv); db.commit()
    return True

# ── HR ────────────────────────────────────────────────
def _hash_employee_pin(pin: str | None) -> str | None:
    normalized = (pin or "").strip()
    if not normalized:
        return None
    if normalized.startswith("$2"):
        return normalized
    return bcrypt.hashpw(normalized.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _normalize_work_days(days: list[int] | None) -> list[int]:
    values = sorted({int(item) for item in (days or [1, 2, 3, 4, 5]) if 1 <= int(item) <= 7})
    return values or [1, 2, 3, 4, 5]


def get_employees(db: Session, skip: int = 0, limit: int = 100, company_id: int | None = None):
    query = db.query(Employee)
    if company_id is not None:
        query = query.filter(Employee.company_id == company_id)
    return query.order_by(Employee.full_name).offset(skip).limit(limit).all()


def get_employee(db: Session, id: int, company_id: int | None = None):
    query = db.query(Employee).filter(Employee.id == id)
    if company_id is not None:
        query = query.filter(Employee.company_id == company_id)
    return query.first()

def create_employee(db: Session, data: schemas.EmployeeCreate, company_id: int | None = None):
    payload = data.model_dump()
    payload["company_id"] = company_id
    payload["employee_pin"] = _hash_employee_pin(payload.get("employee_pin"))
    payload["work_days"] = _normalize_work_days(payload.get("work_days"))
    payload["shift_start"] = payload.get("shift_start") or time_value(9, 0)
    payload["shift_end"] = payload.get("shift_end") or time_value(18, 0)
    emp = Employee(**payload)
    db.add(emp); db.commit(); db.refresh(emp)
    return emp

def update_employee(db: Session, id: int, data: schemas.EmployeeUpdate, company_id: int | None = None):
    query = db.query(Employee).filter(Employee.id == id)
    if company_id is not None:
        query = query.filter(Employee.company_id == company_id)
    emp = query.first()
    if not emp: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "employee_pin":
            setattr(emp, k, _hash_employee_pin(v))
            continue
        if k == "work_days" and v is not None:
            setattr(emp, k, _normalize_work_days(v))
            continue
        setattr(emp, k, v)
    if not emp.shift_start:
        emp.shift_start = time_value(9, 0)
    if not emp.shift_end:
        emp.shift_end = time_value(18, 0)
    if not emp.work_days:
        emp.work_days = [1, 2, 3, 4, 5]
    db.commit(); db.refresh(emp)
    return emp

def delete_employee(db: Session, id: int, company_id: int | None = None):
    query = db.query(Employee).filter(Employee.id == id)
    if company_id is not None:
        query = query.filter(Employee.company_id == company_id)
    emp = query.first()
    if not emp: return False
    db.delete(emp); db.commit()
    return True

def get_hr_summary(db: Session, company_id: int | None = None):
    employee_query = db.query(Employee)
    if company_id is not None:
        employee_query = employee_query.filter(Employee.company_id == company_id)
    total = employee_query.with_entities(func.count(Employee.id)).scalar() or 0
    active = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "active")
        .filter(Employee.company_id == company_id if company_id is not None else True)
        .scalar()
        or 0
    )
    on_leave = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "on_leave")
        .filter(Employee.company_id == company_id if company_id is not None else True)
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


# ── Sales ─────────────────────────────────────────────
def get_sales_products(
    db: Session,
    skip: int = 0,
    limit: int = 200,
    include_archived: bool = False,
):
    query = db.query(SalesProduct)
    if not include_archived:
        query = query.filter(SalesProduct.status != SalesProductStatus.archived)
    return (
        query.order_by(SalesProduct.updated_at.desc(), SalesProduct.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_sales_product(db: Session, data: schemas.SalesProductCreate):
    duplicate = db.query(SalesProduct).filter(func.lower(SalesProduct.sku) == data.sku.strip().lower()).first()
    if duplicate:
        raise ValueError(f"SKU '{data.sku}' already exists.")

    payload = data.model_dump()
    payload["sku"] = payload["sku"].strip().upper()
    product = SalesProduct(**payload)
    _update_product_operational_status(product)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def update_sales_product(db: Session, id: int, data: schemas.SalesProductUpdate):
    product = db.query(SalesProduct).filter(SalesProduct.id == id).first()
    if not product:
        return None

    updates = data.model_dump(exclude_unset=True)
    if "sku" in updates and updates["sku"]:
        normalized_sku = updates["sku"].strip().upper()
        duplicate = (
            db.query(SalesProduct)
            .filter(func.lower(SalesProduct.sku) == normalized_sku.lower(), SalesProduct.id != id)
            .first()
        )
        if duplicate:
            raise ValueError(f"SKU '{normalized_sku}' already exists.")
        updates["sku"] = normalized_sku

    for key, value in updates.items():
        setattr(product, key, value)

    if product.status in SALES_NON_CURRENT_STATUSES:
        product.is_current = False

    _update_product_operational_status(product)
    db.commit()
    db.refresh(product)
    return product


def delete_sales_product(db: Session, id: int):
    product = db.query(SalesProduct).filter(SalesProduct.id == id).first()
    if not product:
        return False
    db.delete(product)
    db.commit()
    return True


def get_sales_orders(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(SalesOrder)
        .options(selectinload(SalesOrder.items))
        .order_by(SalesOrder.order_date.desc(), SalesOrder.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_sales_order(db: Session, data: schemas.SalesOrderCreate):
    duplicate = (
        db.query(SalesOrder)
        .filter(func.lower(SalesOrder.order_number) == data.order_number.strip().lower())
        .first()
    )
    if duplicate:
        raise ValueError(f"Order number '{data.order_number}' already exists.")

    prepared_items = _prepare_sales_order_items(db, data.items)
    payload = data.model_dump(exclude={"items"})
    payload["order_number"] = payload["order_number"].strip().upper()
    if payload.get("order_date") is None:
        payload["order_date"] = datetime.utcnow()

    discount_total = float(payload.get("discount_total") or 0)
    tax_total = float(payload.get("tax_total") or 0)
    shipping_total = float(payload.get("shipping_total") or 0)
    subtotal, total = _compute_sales_order_totals(prepared_items, discount_total, tax_total, shipping_total)
    payload["subtotal"] = subtotal
    payload["total"] = total

    order = SalesOrder(**payload)
    db.add(order)
    db.flush()

    order_items: list[SalesOrderItem] = []
    for item in prepared_items:
        row = SalesOrderItem(order_id=order.id, **{k: item[k] for k in item if k != "product"})
        db.add(row)
        order_items.append(row)
    db.flush()

    if _sales_order_impacts_inventory(order.status):
        _apply_sales_order_inventory_effect(db, order, order_items, consume=True)

    if order.status == SalesOrderStatus.fulfilled and not order.fulfilled_at:
        order.fulfilled_at = datetime.utcnow()

    db.commit()
    db.refresh(order)
    return (
        db.query(SalesOrder)
        .options(selectinload(SalesOrder.items))
        .filter(SalesOrder.id == order.id)
        .first()
    )


def update_sales_order(db: Session, id: int, data: schemas.SalesOrderUpdate):
    order = (
        db.query(SalesOrder)
        .options(selectinload(SalesOrder.items))
        .filter(SalesOrder.id == id)
        .first()
    )
    if not order:
        return None

    updates = data.model_dump(exclude_unset=True, exclude={"items"})
    new_items_payload = data.items if "items" in data.model_fields_set else None

    if "order_number" in updates and updates["order_number"]:
        normalized_order_number = updates["order_number"].strip().upper()
        duplicate = (
            db.query(SalesOrder)
            .filter(func.lower(SalesOrder.order_number) == normalized_order_number.lower(), SalesOrder.id != id)
            .first()
        )
        if duplicate:
            raise ValueError(f"Order number '{normalized_order_number}' already exists.")
        updates["order_number"] = normalized_order_number

    had_inventory_impact = _sales_order_impacts_inventory(order.status)
    old_items = list(order.items)
    if had_inventory_impact:
        _apply_sales_order_inventory_effect(db, order, old_items, consume=False)

    for key, value in updates.items():
        setattr(order, key, value)

    prepared_items: list[dict]
    if new_items_payload is not None:
        prepared_items = _prepare_sales_order_items(db, new_items_payload)
        for item in old_items:
            db.delete(item)
        db.flush()

        current_items: list[SalesOrderItem] = []
        for prepared in prepared_items:
            row = SalesOrderItem(order_id=order.id, **{k: prepared[k] for k in prepared if k != "product"})
            db.add(row)
            current_items.append(row)
        db.flush()
    else:
        prepared_items = [
            {
                "product_id": item.product_id,
                "sku": item.sku,
                "product_name": item.product_name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "unit_cost": item.unit_cost,
                "line_discount": item.line_discount,
                "line_total": item.line_total,
            }
            for item in order.items
        ]

    discount_total = float(order.discount_total or 0)
    tax_total = float(order.tax_total or 0)
    shipping_total = float(order.shipping_total or 0)
    subtotal, total = _compute_sales_order_totals(prepared_items, discount_total, tax_total, shipping_total)
    order.subtotal = subtotal
    order.total = total

    if order.status == SalesOrderStatus.fulfilled and not order.fulfilled_at:
        order.fulfilled_at = datetime.utcnow()
    elif order.status != SalesOrderStatus.fulfilled and "fulfilled_at" not in updates:
        order.fulfilled_at = None

    db.flush()
    current_items = list(order.items)
    if _sales_order_impacts_inventory(order.status):
        _apply_sales_order_inventory_effect(db, order, current_items, consume=True)

    db.commit()
    db.refresh(order)
    return (
        db.query(SalesOrder)
        .options(selectinload(SalesOrder.items))
        .filter(SalesOrder.id == order.id)
        .first()
    )


def delete_sales_order(db: Session, id: int):
    order = (
        db.query(SalesOrder)
        .options(selectinload(SalesOrder.items))
        .filter(SalesOrder.id == id)
        .first()
    )
    if not order:
        return False

    if _sales_order_impacts_inventory(order.status):
        _apply_sales_order_inventory_effect(db, order, list(order.items), consume=False)

    db.delete(order)
    db.commit()
    return True


def get_sales_inventory_adjustments(db: Session, skip: int = 0, limit: int = 300):
    return (
        db.query(SalesInventoryAdjustment)
        .order_by(SalesInventoryAdjustment.created_at.desc(), SalesInventoryAdjustment.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_sales_inventory_adjustment(db: Session, data: schemas.SalesInventoryAdjustmentCreate):
    product = db.query(SalesProduct).filter(SalesProduct.id == data.product_id).first()
    if not product:
        raise ValueError("Product not found.")

    change_qty = int(data.change_qty)
    if change_qty == 0:
        raise ValueError("Inventory adjustment must be non-zero.")

    resulting_stock = int(product.stock_qty or 0) + change_qty
    if resulting_stock < 0:
        raise ValueError(f"Adjustment would make {product.name} stock negative.")

    product.stock_qty = resulting_stock
    _update_product_operational_status(product)

    row = SalesInventoryAdjustment(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_sales_summary(db: Session):
    total_products = db.query(func.count(SalesProduct.id)).scalar() or 0
    current_products = (
        db.query(func.count(SalesProduct.id))
        .filter(SalesProduct.is_current.is_(True), SalesProduct.status != SalesProductStatus.archived)
        .scalar()
        or 0
    )
    non_current_products = (
        db.query(func.count(SalesProduct.id))
        .filter(or_(SalesProduct.is_current.is_(False), SalesProduct.status.in_(list(SALES_NON_CURRENT_STATUSES))))
        .scalar()
        or 0
    )
    low_stock_products = (
        db.query(func.count(SalesProduct.id))
        .filter(
            SalesProduct.is_current.is_(True),
            SalesProduct.status.notin_(list(SALES_NON_CURRENT_STATUSES)),
            SalesProduct.stock_qty > 0,
            SalesProduct.stock_qty <= SalesProduct.reorder_level,
        )
        .scalar()
        or 0
    )
    out_of_stock_products = (
        db.query(func.count(SalesProduct.id))
        .filter(SalesProduct.is_current.is_(True), SalesProduct.stock_qty <= 0)
        .scalar()
        or 0
    )

    inventory_units = db.query(func.sum(SalesProduct.stock_qty)).scalar() or 0
    inventory_cost_value = (
        db.query(func.sum(SalesProduct.stock_qty * SalesProduct.unit_cost))
        .filter(SalesProduct.status != SalesProductStatus.archived)
        .scalar()
        or 0
    )
    inventory_retail_value = (
        db.query(func.sum(SalesProduct.stock_qty * SalesProduct.unit_price))
        .filter(SalesProduct.status != SalesProductStatus.archived)
        .scalar()
        or 0
    )

    total_orders = db.query(func.count(SalesOrder.id)).scalar() or 0
    pending_orders = (
        db.query(func.count(SalesOrder.id))
        .filter(SalesOrder.status.in_([SalesOrderStatus.draft, SalesOrderStatus.pending]))
        .scalar()
        or 0
    )
    closed_orders = (
        db.query(func.count(SalesOrder.id))
        .filter(SalesOrder.status.in_(list(SALES_CLOSED_STATUSES)))
        .scalar()
        or 0
    )
    cancelled_orders = (
        db.query(func.count(SalesOrder.id))
        .filter(SalesOrder.status.in_([SalesOrderStatus.cancelled, SalesOrderStatus.refunded]))
        .scalar()
        or 0
    )
    revenue_total = (
        db.query(func.sum(SalesOrder.total))
        .filter(SalesOrder.status.in_(list(SALES_CLOSED_STATUSES)))
        .scalar()
        or 0
    )
    pending_pipeline_value = (
        db.query(func.sum(SalesOrder.total))
        .filter(SalesOrder.status.in_([SalesOrderStatus.draft, SalesOrderStatus.pending]))
        .scalar()
        or 0
    )

    sold_qty = (
        db.query(func.sum(SalesOrderItem.quantity))
        .join(SalesOrder, SalesOrder.id == SalesOrderItem.order_id)
        .filter(SalesOrder.status.in_(list(SALES_CLOSED_STATUSES)))
        .scalar()
        or 0
    )
    cogs_total = (
        db.query(func.sum(SalesOrderItem.quantity * SalesOrderItem.unit_cost))
        .join(SalesOrder, SalesOrder.id == SalesOrderItem.order_id)
        .filter(SalesOrder.status.in_(list(SALES_CLOSED_STATUSES)))
        .scalar()
        or 0
    )
    gross_profit = float(revenue_total) - float(cogs_total)
    gross_margin = _safe_div(gross_profit, float(revenue_total)) * 100 if revenue_total else 0.0
    avg_order_value = _safe_div(float(revenue_total), float(closed_orders)) if closed_orders else 0.0
    sell_through = _safe_div(float(sold_qty), float(sold_qty + inventory_units)) * 100 if (sold_qty + inventory_units) > 0 else 0.0
    inventory_turnover = _safe_div(float(cogs_total), float(inventory_cost_value)) if inventory_cost_value else 0.0

    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)
    recent_sales = (
        db.query(func.sum(SalesOrder.total))
        .filter(SalesOrder.status.in_(list(SALES_CLOSED_STATUSES)), SalesOrder.order_date >= thirty_days_ago)
        .scalar()
        or 0
    )
    previous_sales = (
        db.query(func.sum(SalesOrder.total))
        .filter(
            SalesOrder.status.in_(list(SALES_CLOSED_STATUSES)),
            SalesOrder.order_date >= (thirty_days_ago - timedelta(days=30)),
            SalesOrder.order_date < thirty_days_ago,
        )
        .scalar()
        or 0
    )
    sales_delta, sales_delta_up = _change_percent(float(recent_sales), float(previous_sales))

    return {
        "total_products": int(total_products),
        "current_products": int(current_products),
        "non_current_products": int(non_current_products),
        "low_stock_products": int(low_stock_products),
        "out_of_stock_products": int(out_of_stock_products),
        "inventory_units": int(inventory_units),
        "inventory_cost_value": round(float(inventory_cost_value), 2),
        "inventory_retail_value": round(float(inventory_retail_value), 2),
        "total_orders": int(total_orders),
        "pending_orders": int(pending_orders),
        "closed_orders": int(closed_orders),
        "cancelled_orders": int(cancelled_orders),
        "revenue_total": round(float(revenue_total), 2),
        "cogs_total": round(float(cogs_total), 2),
        "gross_profit": round(float(gross_profit), 2),
        "gross_margin_percent": round(float(gross_margin), 2),
        "avg_order_value": round(float(avg_order_value), 2),
        "sell_through_percent": round(float(sell_through), 2),
        "inventory_turnover": round(float(inventory_turnover), 2),
        "pending_pipeline_value": round(float(pending_pipeline_value), 2),
        "units_sold": int(sold_qty),
        "recent_30d_revenue": round(float(recent_sales), 2),
        "revenue_change_vs_prev_30d": sales_delta,
        "revenue_change_is_positive": bool(sales_delta_up),
    }


def get_sales_reports(db: Session):
    top_products = (
        db.query(SalesProduct)
        .order_by(SalesProduct.total_revenue.desc(), SalesProduct.total_sold_units.desc(), SalesProduct.id.desc())
        .limit(8)
        .all()
    )

    current_products = (
        db.query(SalesProduct)
        .filter(SalesProduct.is_current.is_(True), SalesProduct.status != SalesProductStatus.archived)
        .order_by(SalesProduct.updated_at.desc(), SalesProduct.id.desc())
        .limit(120)
        .all()
    )
    non_current_products = (
        db.query(SalesProduct)
        .filter(or_(SalesProduct.is_current.is_(False), SalesProduct.status.in_(list(SALES_NON_CURRENT_STATUSES))))
        .order_by(SalesProduct.updated_at.desc(), SalesProduct.id.desc())
        .limit(120)
        .all()
    )
    low_stock_products = (
        db.query(SalesProduct)
        .filter(
            SalesProduct.is_current.is_(True),
            SalesProduct.status.notin_(list(SALES_NON_CURRENT_STATUSES)),
            SalesProduct.stock_qty <= SalesProduct.reorder_level,
        )
        .order_by(SalesProduct.stock_qty.asc(), SalesProduct.updated_at.desc())
        .limit(50)
        .all()
    )

    month_labels: list[str] = []
    month_revenue: list[float] = []
    base = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for offset in range(5, -1, -1):
        month = base.month - offset
        year = base.year
        while month <= 0:
            month += 12
            year -= 1
        start = datetime(year, month, 1)
        end = _month_window(start)[1]
        amount = (
            db.query(func.sum(SalesOrder.total))
            .filter(
                SalesOrder.status.in_(list(SALES_CLOSED_STATUSES)),
                SalesOrder.order_date >= start,
                SalesOrder.order_date < end,
            )
            .scalar()
            or 0
        )
        month_labels.append(start.strftime("%b %Y"))
        month_revenue.append(round(float(amount), 2))

    stale_cutoff = datetime.utcnow() - timedelta(days=90)
    stale_current_products = (
        db.query(SalesProduct)
        .filter(
            SalesProduct.is_current.is_(True),
            or_(SalesProduct.last_sold_at.is_(None), SalesProduct.last_sold_at < stale_cutoff),
            SalesProduct.status.notin_(list(SALES_NON_CURRENT_STATUSES)),
        )
        .order_by(SalesProduct.last_sold_at.asc().nullsfirst(), SalesProduct.updated_at.desc())
        .limit(50)
        .all()
    )

    def _pack_product(row: SalesProduct):
        return {
            "id": row.id,
            "sku": row.sku,
            "name": row.name,
            "category": row.category,
            "status": row.status.value if isinstance(row.status, SalesProductStatus) else str(row.status),
            "is_current": bool(row.is_current),
            "stock_qty": int(row.stock_qty or 0),
            "reorder_level": int(row.reorder_level or 0),
            "unit_price": round(float(row.unit_price or 0), 2),
            "unit_cost": round(float(row.unit_cost or 0), 2),
            "total_sold_units": int(row.total_sold_units or 0),
            "total_revenue": round(float(row.total_revenue or 0), 2),
            "last_sold_at": row.last_sold_at.isoformat() if row.last_sold_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }

    return {
        "top_products": [_pack_product(row) for row in top_products],
        "current_products": [_pack_product(row) for row in current_products],
        "non_current_products": [_pack_product(row) for row in non_current_products],
        "low_stock_products": [_pack_product(row) for row in low_stock_products],
        "stale_current_products": [_pack_product(row) for row in stale_current_products],
        "revenue_trend": {
            "months": month_labels,
            "revenue": month_revenue,
        },
    }


# ── Support ───────────────────────────────────────────
SUPPORT_OPEN_STATUSES = {
    SupportTicketStatus.open,
    SupportTicketStatus.in_progress,
    SupportTicketStatus.waiting_customer,
}
SUPPORT_CLOSED_STATUSES = {SupportTicketStatus.resolved, SupportTicketStatus.closed}


def get_support_tickets(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(SupportTicket)
        .order_by(SupportTicket.updated_at.desc(), SupportTicket.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_support_ticket(db: Session, data: schemas.SupportTicketCreate):
    normalized_number = data.ticket_number.strip().upper()
    duplicate = (
        db.query(SupportTicket)
        .filter(func.lower(SupportTicket.ticket_number) == normalized_number.lower())
        .first()
    )
    if duplicate:
        raise ValueError(f"Ticket number '{normalized_number}' already exists.")

    payload = data.model_dump()
    payload["ticket_number"] = normalized_number
    if payload.get("status") in SUPPORT_CLOSED_STATUSES and not payload.get("resolved_at"):
        payload["resolved_at"] = datetime.utcnow()
    row = SupportTicket(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_support_ticket(db: Session, id: int, data: schemas.SupportTicketUpdate):
    row = db.query(SupportTicket).filter(SupportTicket.id == id).first()
    if not row:
        return None

    updates = data.model_dump(exclude_unset=True)
    if "ticket_number" in updates and updates["ticket_number"]:
        normalized_number = updates["ticket_number"].strip().upper()
        duplicate = (
            db.query(SupportTicket)
            .filter(func.lower(SupportTicket.ticket_number) == normalized_number.lower(), SupportTicket.id != id)
            .first()
        )
        if duplicate:
            raise ValueError(f"Ticket number '{normalized_number}' already exists.")
        updates["ticket_number"] = normalized_number

    for key, value in updates.items():
        setattr(row, key, value)

    if row.status in SUPPORT_CLOSED_STATUSES and not row.resolved_at:
        row.resolved_at = datetime.utcnow()
    if row.status not in SUPPORT_CLOSED_STATUSES and "resolved_at" not in updates:
        row.resolved_at = None

    db.commit()
    db.refresh(row)
    return row


def delete_support_ticket(db: Session, id: int):
    row = db.query(SupportTicket).filter(SupportTicket.id == id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def get_support_summary(db: Session):
    now = datetime.utcnow()
    last_30_days = now - timedelta(days=30)
    last_60_days = now - timedelta(days=60)

    total = db.query(func.count(SupportTicket.id)).scalar() or 0
    open_count = (
        db.query(func.count(SupportTicket.id))
        .filter(SupportTicket.status.in_(list(SUPPORT_OPEN_STATUSES)))
        .scalar()
        or 0
    )
    urgent_count = (
        db.query(func.count(SupportTicket.id))
        .filter(
            SupportTicket.status.in_(list(SUPPORT_OPEN_STATUSES)),
            SupportTicket.priority == SupportTicketPriority.urgent,
        )
        .scalar()
        or 0
    )
    overdue_sla = (
        db.query(func.count(SupportTicket.id))
        .filter(
            SupportTicket.status.in_(list(SUPPORT_OPEN_STATUSES)),
            SupportTicket.sla_due_at.isnot(None),
            SupportTicket.sla_due_at < now,
        )
        .scalar()
        or 0
    )
    created_30d = (
        db.query(func.count(SupportTicket.id))
        .filter(SupportTicket.created_at >= last_30_days)
        .scalar()
        or 0
    )
    resolved_30d = (
        db.query(func.count(SupportTicket.id))
        .filter(
            SupportTicket.status.in_(list(SUPPORT_CLOSED_STATUSES)),
            SupportTicket.resolved_at.isnot(None),
            SupportTicket.resolved_at >= last_30_days,
        )
        .scalar()
        or 0
    )
    avg_csat = db.query(func.avg(SupportTicket.satisfaction_score)).filter(SupportTicket.satisfaction_score.isnot(None)).scalar()

    response_rows = (
        db.query(SupportTicket.created_at, SupportTicket.first_response_at)
        .filter(
            SupportTicket.created_at >= last_60_days,
            SupportTicket.first_response_at.isnot(None),
        )
        .limit(1000)
        .all()
    )
    response_hours = []
    for created_at, first_response_at in response_rows:
        if not created_at or not first_response_at:
            continue
        created_ref = created_at.replace(tzinfo=None) if created_at.tzinfo else created_at
        response_ref = first_response_at.replace(tzinfo=None) if first_response_at.tzinfo else first_response_at
        delta = (response_ref - created_ref).total_seconds() / 3600
        if delta >= 0:
            response_hours.append(delta)
    avg_first_response_hours = sum(response_hours) / len(response_hours) if response_hours else 0.0
    resolution_rate = _safe_div(float(resolved_30d), float(created_30d)) * 100 if created_30d else 0.0

    return {
        "total_tickets": int(total),
        "open_tickets": int(open_count),
        "urgent_open_tickets": int(urgent_count),
        "sla_at_risk": int(overdue_sla),
        "resolved_last_30d": int(resolved_30d),
        "created_last_30d": int(created_30d),
        "resolution_rate_percent": round(float(resolution_rate), 2),
        "avg_first_response_hours": round(float(avg_first_response_hours), 2),
        "avg_csat": round(float(avg_csat or 0), 2),
    }


# ── Supply Chain ──────────────────────────────────────
SUPPLY_CHAIN_ACTIVE_SHIPMENT_STATUSES = {
    SupplyChainShipmentStatus.planned,
    SupplyChainShipmentStatus.in_transit,
    SupplyChainShipmentStatus.delayed,
}


def get_supply_chain_items(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(SupplyChainItem)
        .order_by(SupplyChainItem.updated_at.desc(), SupplyChainItem.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_supply_chain_item(db: Session, data: schemas.SupplyChainItemCreate):
    normalized_sku = data.sku.strip().upper()
    duplicate = (
        db.query(SupplyChainItem)
        .filter(func.lower(SupplyChainItem.sku) == normalized_sku.lower())
        .first()
    )
    if duplicate:
        raise ValueError(f"Item SKU '{normalized_sku}' already exists.")

    payload = data.model_dump()
    payload["sku"] = normalized_sku
    row = SupplyChainItem(**payload)
    _refresh_supply_chain_item_status(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_supply_chain_item(db: Session, id: int, data: schemas.SupplyChainItemUpdate):
    row = db.query(SupplyChainItem).filter(SupplyChainItem.id == id).first()
    if not row:
        return None

    updates = data.model_dump(exclude_unset=True)
    if "sku" in updates and updates["sku"]:
        normalized_sku = updates["sku"].strip().upper()
        duplicate = (
            db.query(SupplyChainItem)
            .filter(func.lower(SupplyChainItem.sku) == normalized_sku.lower(), SupplyChainItem.id != id)
            .first()
        )
        if duplicate:
            raise ValueError(f"Item SKU '{normalized_sku}' already exists.")
        updates["sku"] = normalized_sku

    for key, value in updates.items():
        setattr(row, key, value)

    _refresh_supply_chain_item_status(row)
    db.commit()
    db.refresh(row)
    return row


def delete_supply_chain_item(db: Session, id: int):
    row = db.query(SupplyChainItem).filter(SupplyChainItem.id == id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def get_supply_chain_shipments(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(SupplyChainShipment)
        .order_by(SupplyChainShipment.updated_at.desc(), SupplyChainShipment.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_supply_chain_shipment(db: Session, data: schemas.SupplyChainShipmentCreate):
    normalized_ref = data.shipment_ref.strip().upper()
    duplicate = (
        db.query(SupplyChainShipment)
        .filter(func.lower(SupplyChainShipment.shipment_ref) == normalized_ref.lower())
        .first()
    )
    if duplicate:
        raise ValueError(f"Shipment reference '{normalized_ref}' already exists.")

    payload = data.model_dump()
    payload["shipment_ref"] = normalized_ref
    row = SupplyChainShipment(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_supply_chain_shipment(db: Session, id: int, data: schemas.SupplyChainShipmentUpdate):
    row = db.query(SupplyChainShipment).filter(SupplyChainShipment.id == id).first()
    if not row:
        return None

    updates = data.model_dump(exclude_unset=True)
    if "shipment_ref" in updates and updates["shipment_ref"]:
        normalized_ref = updates["shipment_ref"].strip().upper()
        duplicate = (
            db.query(SupplyChainShipment)
            .filter(func.lower(SupplyChainShipment.shipment_ref) == normalized_ref.lower(), SupplyChainShipment.id != id)
            .first()
        )
        if duplicate:
            raise ValueError(f"Shipment reference '{normalized_ref}' already exists.")
        updates["shipment_ref"] = normalized_ref

    for key, value in updates.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_supply_chain_shipment(db: Session, id: int):
    row = db.query(SupplyChainShipment).filter(SupplyChainShipment.id == id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def get_supply_chain_summary(db: Session):
    now = datetime.utcnow()
    last_30_days = now - timedelta(days=30)
    last_60_days = now - timedelta(days=60)

    total_items = db.query(func.count(SupplyChainItem.id)).scalar() or 0
    healthy_items = (
        db.query(func.count(SupplyChainItem.id))
        .filter(SupplyChainItem.status == SupplyChainItemStatus.healthy)
        .scalar()
        or 0
    )
    low_stock_items = (
        db.query(func.count(SupplyChainItem.id))
        .filter(SupplyChainItem.status == SupplyChainItemStatus.low_stock)
        .scalar()
        or 0
    )
    out_of_stock_items = (
        db.query(func.count(SupplyChainItem.id))
        .filter(SupplyChainItem.status == SupplyChainItemStatus.out_of_stock)
        .scalar()
        or 0
    )
    inventory_units = db.query(func.sum(SupplyChainItem.on_hand_qty)).scalar() or 0
    reserved_units = db.query(func.sum(SupplyChainItem.reserved_qty)).scalar() or 0
    inventory_value = db.query(func.sum(SupplyChainItem.on_hand_qty * SupplyChainItem.unit_cost)).scalar() or 0

    inbound_active = (
        db.query(func.count(SupplyChainShipment.id))
        .filter(
            SupplyChainShipment.direction == SupplyChainShipmentDirection.inbound,
            SupplyChainShipment.status.in_(list(SUPPLY_CHAIN_ACTIVE_SHIPMENT_STATUSES)),
        )
        .scalar()
        or 0
    )
    outbound_active = (
        db.query(func.count(SupplyChainShipment.id))
        .filter(
            SupplyChainShipment.direction == SupplyChainShipmentDirection.outbound,
            SupplyChainShipment.status.in_(list(SUPPLY_CHAIN_ACTIVE_SHIPMENT_STATUSES)),
        )
        .scalar()
        or 0
    )
    delayed_shipments = (
        db.query(func.count(SupplyChainShipment.id))
        .filter(SupplyChainShipment.status == SupplyChainShipmentStatus.delayed)
        .scalar()
        or 0
    )
    delivered_30d = (
        db.query(func.count(SupplyChainShipment.id))
        .filter(
            SupplyChainShipment.status == SupplyChainShipmentStatus.delivered,
            SupplyChainShipment.delivered_at.isnot(None),
            SupplyChainShipment.delivered_at >= last_30_days,
        )
        .scalar()
        or 0
    )

    delivered_rows = (
        db.query(SupplyChainShipment.eta, SupplyChainShipment.delivered_at)
        .filter(
            SupplyChainShipment.status == SupplyChainShipmentStatus.delivered,
            SupplyChainShipment.delivered_at.isnot(None),
            SupplyChainShipment.delivered_at >= last_60_days,
        )
        .limit(1000)
        .all()
    )
    on_time = 0
    total_with_eta = 0
    for eta, delivered_at in delivered_rows:
        if not eta or not delivered_at:
            continue
        total_with_eta += 1
        eta_ref = eta.replace(tzinfo=None) if eta.tzinfo else eta
        delivered_ref = delivered_at.replace(tzinfo=None) if delivered_at.tzinfo else delivered_at
        if delivered_ref <= eta_ref:
            on_time += 1
    on_time_rate = _safe_div(float(on_time), float(total_with_eta)) * 100 if total_with_eta else 0.0

    return {
        "total_items": int(total_items),
        "healthy_items": int(healthy_items),
        "low_stock_items": int(low_stock_items),
        "out_of_stock_items": int(out_of_stock_items),
        "inventory_units": int(inventory_units),
        "reserved_units": int(reserved_units),
        "inventory_value": round(float(inventory_value), 2),
        "inbound_active_shipments": int(inbound_active),
        "outbound_active_shipments": int(outbound_active),
        "delayed_shipments": int(delayed_shipments),
        "delivered_last_30d": int(delivered_30d),
        "on_time_delivery_percent": round(float(on_time_rate), 2),
    }


# ── Procurement ───────────────────────────────────────
PROCUREMENT_OPEN_STATUSES = {
    ProcurementRequestStatus.submitted,
    ProcurementRequestStatus.approved,
    ProcurementRequestStatus.ordered,
    ProcurementRequestStatus.partially_received,
}
PROCUREMENT_SPEND_STATUSES = {
    ProcurementRequestStatus.ordered,
    ProcurementRequestStatus.partially_received,
    ProcurementRequestStatus.received,
}


def get_procurement_requests(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(ProcurementRequest)
        .order_by(ProcurementRequest.updated_at.desc(), ProcurementRequest.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_procurement_request(db: Session, data: schemas.ProcurementRequestCreate):
    normalized_number = data.request_number.strip().upper()
    duplicate = (
        db.query(ProcurementRequest)
        .filter(func.lower(ProcurementRequest.request_number) == normalized_number.lower())
        .first()
    )
    if duplicate:
        raise ValueError(f"Request number '{normalized_number}' already exists.")

    payload = data.model_dump()
    payload["request_number"] = normalized_number
    row = ProcurementRequest(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_procurement_request(db: Session, id: int, data: schemas.ProcurementRequestUpdate):
    row = db.query(ProcurementRequest).filter(ProcurementRequest.id == id).first()
    if not row:
        return None

    updates = data.model_dump(exclude_unset=True)
    if "request_number" in updates and updates["request_number"]:
        normalized_number = updates["request_number"].strip().upper()
        duplicate = (
            db.query(ProcurementRequest)
            .filter(func.lower(ProcurementRequest.request_number) == normalized_number.lower(), ProcurementRequest.id != id)
            .first()
        )
        if duplicate:
            raise ValueError(f"Request number '{normalized_number}' already exists.")
        updates["request_number"] = normalized_number

    for key, value in updates.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_procurement_request(db: Session, id: int):
    row = db.query(ProcurementRequest).filter(ProcurementRequest.id == id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def get_procurement_summary(db: Session):
    now = datetime.utcnow()
    last_30_days = now - timedelta(days=30)

    total = db.query(func.count(ProcurementRequest.id)).scalar() or 0
    open_count = (
        db.query(func.count(ProcurementRequest.id))
        .filter(ProcurementRequest.status.in_(list(PROCUREMENT_OPEN_STATUSES)))
        .scalar()
        or 0
    )
    pending_approval = (
        db.query(func.count(ProcurementRequest.id))
        .filter(ProcurementRequest.status == ProcurementRequestStatus.submitted)
        .scalar()
        or 0
    )
    approved = (
        db.query(func.count(ProcurementRequest.id))
        .filter(ProcurementRequest.status == ProcurementRequestStatus.approved)
        .scalar()
        or 0
    )
    received = (
        db.query(func.count(ProcurementRequest.id))
        .filter(ProcurementRequest.status == ProcurementRequestStatus.received)
        .scalar()
        or 0
    )
    overdue = (
        db.query(func.count(ProcurementRequest.id))
        .filter(
            ProcurementRequest.due_date.isnot(None),
            ProcurementRequest.due_date < now,
            ProcurementRequest.status.notin_(
                [
                    ProcurementRequestStatus.received,
                    ProcurementRequestStatus.cancelled,
                    ProcurementRequestStatus.rejected,
                ]
            ),
        )
        .scalar()
        or 0
    )
    spend_committed = (
        db.query(func.sum(ProcurementRequest.amount))
        .filter(ProcurementRequest.status.in_(list(PROCUREMENT_SPEND_STATUSES)))
        .scalar()
        or 0
    )
    spend_received = (
        db.query(func.sum(ProcurementRequest.amount))
        .filter(ProcurementRequest.status == ProcurementRequestStatus.received)
        .scalar()
        or 0
    )
    created_30d = (
        db.query(func.count(ProcurementRequest.id))
        .filter(ProcurementRequest.created_at >= last_30_days)
        .scalar()
        or 0
    )

    cycle_rows = (
        db.query(ProcurementRequest.created_at, ProcurementRequest.ordered_at)
        .filter(
            ProcurementRequest.ordered_at.isnot(None),
            ProcurementRequest.created_at >= now - timedelta(days=90),
        )
        .limit(1000)
        .all()
    )
    cycle_days = []
    for created_at, ordered_at in cycle_rows:
        if not created_at or not ordered_at:
            continue
        created_ref = created_at.replace(tzinfo=None) if created_at.tzinfo else created_at
        ordered_ref = ordered_at.replace(tzinfo=None) if ordered_at.tzinfo else ordered_at
        diff = (ordered_ref - created_ref).total_seconds() / 86400
        if diff >= 0:
            cycle_days.append(diff)
    avg_cycle_days = sum(cycle_days) / len(cycle_days) if cycle_days else 0.0

    return {
        "total_requests": int(total),
        "open_requests": int(open_count),
        "pending_approval": int(pending_approval),
        "approved_requests": int(approved),
        "received_requests": int(received),
        "overdue_requests": int(overdue),
        "spend_committed": round(float(spend_committed), 2),
        "spend_received": round(float(spend_received), 2),
        "created_last_30d": int(created_30d),
        "avg_procurement_cycle_days": round(float(avg_cycle_days), 2),
    }


# ── Insights ──────────────────────────────────────────
def get_insight_reports(db: Session, skip: int = 0, limit: int = 200):
    return (
        db.query(InsightReport)
        .order_by(InsightReport.updated_at.desc(), InsightReport.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_insight_report(db: Session, data: schemas.InsightReportCreate):
    row = InsightReport(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_insight_report(db: Session, id: int, data: schemas.InsightReportUpdate):
    row = db.query(InsightReport).filter(InsightReport.id == id).first()
    if not row:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_insight_report(db: Session, id: int):
    row = db.query(InsightReport).filter(InsightReport.id == id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def run_insight_report(db: Session, id: int):
    row = db.query(InsightReport).filter(InsightReport.id == id).first()
    if not row:
        return None
    now = datetime.utcnow()
    row.last_run_at = now
    if row.status == InsightReportStatus.draft:
        row.status = InsightReportStatus.active
    if row.schedule == "daily":
        row.next_run_at = now + timedelta(days=1)
    elif row.schedule == "weekly":
        row.next_run_at = now + timedelta(days=7)
    elif row.schedule == "monthly":
        row.next_run_at = now + timedelta(days=30)
    db.commit()
    db.refresh(row)
    return row


def get_insights_summary(db: Session):
    now = datetime.utcnow()
    last_7_days = now - timedelta(days=7)

    total_reports = db.query(func.count(InsightReport.id)).scalar() or 0
    active_reports = (
        db.query(func.count(InsightReport.id))
        .filter(InsightReport.status == InsightReportStatus.active)
        .scalar()
        or 0
    )
    paused_reports = (
        db.query(func.count(InsightReport.id))
        .filter(InsightReport.status == InsightReportStatus.paused)
        .scalar()
        or 0
    )
    error_reports = (
        db.query(func.count(InsightReport.id))
        .filter(InsightReport.status == InsightReportStatus.error)
        .scalar()
        or 0
    )
    scheduled_reports = (
        db.query(func.count(InsightReport.id))
        .filter(InsightReport.schedule.isnot(None))
        .scalar()
        or 0
    )
    recently_refreshed = (
        db.query(func.count(InsightReport.id))
        .filter(InsightReport.last_run_at.isnot(None), InsightReport.last_run_at >= last_7_days)
        .scalar()
        or 0
    )
    freshness_score = _safe_div(float(recently_refreshed), float(total_reports)) * 100 if total_reports else 0.0

    finance_income = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.type == TransactionType.income)
        .scalar()
        or 0
    )
    finance_expense = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.type == TransactionType.expense)
        .scalar()
        or 0
    )
    sales_revenue = (
        db.query(func.sum(SalesOrder.total))
        .filter(SalesOrder.status.in_(list(SALES_CLOSED_STATUSES)))
        .scalar()
        or 0
    )
    support_open = (
        db.query(func.count(SupportTicket.id))
        .filter(SupportTicket.status.in_(list(SUPPORT_OPEN_STATUSES)))
        .scalar()
        or 0
    )
    procurement_open = (
        db.query(func.count(ProcurementRequest.id))
        .filter(ProcurementRequest.status.in_(list(PROCUREMENT_OPEN_STATUSES)))
        .scalar()
        or 0
    )
    supply_chain_risk = (
        db.query(func.count(SupplyChainItem.id))
        .filter(
            SupplyChainItem.status.in_(
                [SupplyChainItemStatus.low_stock, SupplyChainItemStatus.out_of_stock]
            )
        )
        .scalar()
        or 0
    )

    return {
        "total_reports": int(total_reports),
        "active_reports": int(active_reports),
        "paused_reports": int(paused_reports),
        "error_reports": int(error_reports),
        "scheduled_reports": int(scheduled_reports),
        "freshness_score_percent": round(float(freshness_score), 2),
        "cross_module_metrics": {
            "finance_net": round(float(finance_income) - float(finance_expense), 2),
            "sales_revenue": round(float(sales_revenue), 2),
            "open_support_tickets": int(support_open),
            "open_procurement_requests": int(procurement_open),
            "supply_chain_risk_items": int(supply_chain_risk),
        },
    }


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


def list_chat_sessions(
    db: Session,
    section: str,
    session_prefix: str,
    limit: int = 50,
):
    """
    List chat sessions for a section using a deterministic session_id prefix.
    Returns latest activity first.
    """
    if not session_prefix:
        return []

    pattern = f"{session_prefix}%"
    grouped = (
        db.query(
            ChatMessage.session_id.label("session_id"),
            func.max(ChatMessage.id).label("last_id"),
            func.max(ChatMessage.created_at).label("last_message_at"),
            func.count(ChatMessage.id).label("message_count"),
        )
        .filter(
            ChatMessage.section == section,
            ChatMessage.session_id.like(pattern),
        )
        .group_by(ChatMessage.session_id)
        .subquery()
    )

    rows = (
        db.query(
            grouped.c.session_id,
            grouped.c.last_message_at,
            grouped.c.message_count,
            ChatMessage.content.label("last_content"),
        )
        .join(ChatMessage, ChatMessage.id == grouped.c.last_id)
        .order_by(grouped.c.last_message_at.desc(), grouped.c.last_id.desc())
        .limit(limit)
        .all()
    )

    output = []
    for row in rows:
        content = (row.last_content or "").strip()
        preview = content[:120]
        output.append(
            {
                "session_id": row.session_id,
                "section": section,
                "last_message_preview": preview,
                "last_message_at": row.last_message_at,
                "message_count": int(row.message_count or 0),
            }
        )
    return output


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
