from database.connection import SessionLocal
from database import crud


def _fmt_money(value) -> str:
    if value is None:
        return "N/A"
    return f"${float(value):,.2f}"


def _fmt_amount_range(min_value, max_value) -> str:
    if min_value is None and max_value is None:
        return "N/A"
    if min_value is None:
        return f"Up to ${float(max_value):,.0f}"
    if max_value is None:
        return f"From ${float(min_value):,.0f}"
    return f"${float(min_value):,.0f}-${float(max_value):,.0f}"


def _fmt_date(value) -> str:
    if value is None:
        return "N/A"
    try:
        return value.strftime("%Y-%m-%d")
    except Exception:
        return str(value)


def get_finance_context() -> str:
    """Fetch real finance data and format as text context for Claude."""
    db = SessionLocal()
    try:
        summary = crud.get_finance_summary(db)
        transactions = crud.get_transactions(db)
        invoices = crud.get_invoices(db)

        tx_lines = []
        for tx in transactions[:20]:
            tx_lines.append(
                f"  - {_fmt_date(tx.date)}: {tx.description} | {str(tx.type).upper()} | "
                f"{_fmt_money(tx.amount)} | {tx.category} | {tx.status}"
            )

        inv_lines = []
        for inv in invoices[:10]:
            inv_lines.append(
                f"  - {inv.invoice_number}: {inv.client_name} | "
                f"{_fmt_money(inv.amount)} | Due: {_fmt_date(inv.due_date)} | {inv.status}"
            )

        return f"""
REAL FINANCE DATA (live from database):

Summary:
  Total Income:       {_fmt_money(summary.get('total_income', 0))}
  Total Expenses:     {_fmt_money(summary.get('total_expenses', 0))}
  Net Profit:         {_fmt_money(summary.get('net_profit', 0))}
  Pending Invoices:   {summary.get('pending_invoices', 0)}

Recent Transactions (last 20):
{chr(10).join(tx_lines) if tx_lines else "  No transactions found."}

Recent Invoices (last 10):
{chr(10).join(inv_lines) if inv_lines else "  No invoices found."}
""".strip()
    finally:
        db.close()


def get_hr_context() -> str:
    """Fetch real HR data and format as text context for Claude."""
    db = SessionLocal()
    try:
        summary = crud.get_hr_summary(db)
        employees = crud.get_employees(db)
        positions = crud.get_positions(db)

        emp_lines = []
        for emp in employees[:20]:
            salary_str = f"${float(emp.salary):,.0f}/yr" if emp.salary is not None else "N/A"
            emp_lines.append(
                f"  - {emp.full_name} | {emp.role} | {emp.department} | "
                f"{salary_str} | {emp.status}"
            )

        pos_lines = []
        for pos in positions[:10]:
            pos_lines.append(
                f"  - {pos.title} | {pos.department} | "
                f"{_fmt_amount_range(pos.salary_min, pos.salary_max)} | {pos.status}"
            )

        return f"""
REAL HR DATA (live from database):

Summary:
  Total Employees:  {summary.get('total_employees', 0)}
  Active:           {summary.get('active', 0)}
  On Leave:         {summary.get('on_leave', 0)}
  Open Positions:   {summary.get('open_positions', 0)}

Employees:
{chr(10).join(emp_lines) if emp_lines else "  No employees found."}

Open Positions:
{chr(10).join(pos_lines) if pos_lines else "  No open positions."}
""".strip()
    finally:
        db.close()


def get_projects_context() -> str:
    """Fetch real projects/kanban data."""
    db = SessionLocal()
    try:
        from database.models import Project, KanbanTask, KanbanColumn

        projects = db.query(Project).all()
        tasks = db.query(KanbanTask).all()
        columns = db.query(KanbanColumn).all()

        col_map = {col.id: col.name for col in columns}

        proj_lines = []
        for project in projects:
            task_count = len([task for task in tasks if task.project_id == project.id])
            proj_lines.append(
                f"  - {project.name} | {project.status} | "
                f"Owner: {project.owner or 'Unassigned'} | Tasks: {task_count}"
            )

        task_lines = []
        for task in tasks[:30]:
            col_name = col_map.get(task.column_id, "Unknown")
            task_lines.append(
                f"  - [{col_name}] {task.title} | {task.priority} priority | "
                f"Assignee: {task.assignee or 'Unassigned'}"
            )

        return f"""
REAL PROJECTS DATA (live from database):

Projects ({len(projects)} total):
{chr(10).join(proj_lines) if proj_lines else "  No projects found."}

Tasks ({len(tasks)} total):
{chr(10).join(task_lines) if task_lines else "  No tasks found."}
""".strip()
    finally:
        db.close()


def get_admin_context() -> str:
    """Fetch platform-wide admin data."""
    db = SessionLocal()
    try:
        from database.admin_crud import get_platform_summary, get_clients_with_subscriptions

        summary = get_platform_summary(db)
        clients = get_clients_with_subscriptions(db)

        client_lines = []
        for item in clients[:15]:
            client = item["client"]
            sub = item["subscription"]
            plan = sub.plan_tier if sub else "no plan"
            mrr = sub.price_monthly if sub else 0
            client_lines.append(
                f"  - {client.name} | {plan} | ${float(mrr):,.0f}/mo | "
                f"{'Suspended' if client.is_suspended else 'Active'}"
            )

        return f"""
REAL PLATFORM DATA (live from database):

Summary:
  Total Clients:  {summary.get('total_clients', 0)}
  Active:         {summary.get('active_clients', 0)}
  Suspended:      {summary.get('suspended', 0)}
  MRR:            {_fmt_money(summary.get('monthly_recurring_revenue', 0))}
  Trials Active:  {summary.get('trials_active', 0)}
  Paid This Month: {_fmt_money(summary.get('paid_this_month', 0))}

Plan Breakdown:
  Trial:      {summary.get('plan_breakdown', {}).get('trial', 0)}
  Starter:    {summary.get('plan_breakdown', {}).get('starter', 0)}
  Pro:        {summary.get('plan_breakdown', {}).get('pro', 0)}
  Enterprise: {summary.get('plan_breakdown', {}).get('enterprise', 0)}

Clients:
{chr(10).join(client_lines) if client_lines else "  No clients found."}
""".strip()
    finally:
        db.close()


def get_dashboard_context() -> str:
    """Combine finance + HR + projects for a full dashboard overview."""
    finance = get_finance_context()
    hr = get_hr_context()
    projects = get_projects_context()
    return f"{finance}\n\n{hr}\n\n{projects}"


def get_context_for_section(section: str) -> str:
    """Main entry point - returns the right context for any section."""
    fetchers = {
        "dashboard": get_dashboard_context,
        "finance": get_finance_context,
        "hr": get_hr_context,
        "projects": get_projects_context,
        "admin": get_admin_context,
    }

    fetcher = fetchers.get(section)
    if fetcher:
        try:
            return fetcher()
        except Exception as exc:
            return f"Note: Could not fetch live data ({str(exc)}). Answering based on general knowledge."

    return (
        f"Note: Live data integration for {section} is not yet configured. "
        f"Answer based on best practices for enterprise {section} management."
    )
