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


def get_marketing_context() -> str:
    """Fetch live marketing operations data."""
    db = SessionLocal()
    try:
        summary = crud.get_marketing_summary(db)
        funnel = crud.get_marketing_funnel(db)
        campaigns = crud.get_marketing_campaigns(db, limit=20)
        content = crud.get_marketing_content(db, limit=20)
        channels = crud.get_marketing_channel_metrics(db, limit=20)

        campaign_lines = []
        for campaign in campaigns[:12]:
            roas = (float(campaign.revenue) / float(campaign.spent)) if campaign.spent else 0
            campaign_lines.append(
                f"  - {campaign.name} | {campaign.channel} | {campaign.status} | "
                f"Spend: {_fmt_money(campaign.spent)} | Revenue: {_fmt_money(campaign.revenue)} | ROAS: {roas:.2f}"
            )

        content_lines = []
        for item in content[:12]:
            content_lines.append(
                f"  - {item.title} | {item.content_type} | {item.channel} | {item.status} | "
                f"Publish: {_fmt_date(item.publish_date)}"
            )

        channel_lines = []
        for row in channels[:10]:
            ctr = (float(row.clicks) / float(row.impressions) * 100) if row.impressions else 0
            cvr = (float(row.conversions) / float(row.clicks) * 100) if row.clicks else 0
            roas = (float(row.revenue) / float(row.spend)) if row.spend else 0
            channel_lines.append(
                f"  - {row.channel} ({row.period_label}) | Spend: {_fmt_money(row.spend)} | "
                f"Revenue: {_fmt_money(row.revenue)} | ROAS: {roas:.2f} | CTR: {ctr:.2f}% | CVR: {cvr:.2f}%"
            )

        return f"""
REAL MARKETING DATA (live from database):

Performance Summary:
  Campaigns Total:     {summary.get('total_campaigns', 0)}
  Active Campaigns:    {summary.get('active_campaigns', 0)}
  Leads Total:         {summary.get('total_leads', 0)}
  MQL Pipeline:        {summary.get('mql_count', 0)}
  Customers:           {summary.get('customers', 0)}
  Spend:               {_fmt_money(summary.get('spend', 0))}
  Revenue:             {_fmt_money(summary.get('revenue', 0))}
  ROAS:                {summary.get('roas', 0):.2f}
  CTR:                 {summary.get('ctr', 0):.2f}%
  CVR:                 {summary.get('cvr', 0):.2f}%
  CAC:                 {_fmt_money(summary.get('cac', 0))}
  Benchmark ROAS:      {summary.get('benchmark_roas', 0):.2f}
  Benchmark CTR:       {summary.get('benchmark_ctr', 0):.2f}%
  Benchmark CVR:       {summary.get('benchmark_cvr', 0):.2f}%

Funnel:
  New:          {funnel.get('new', 0)}
  MQL:          {funnel.get('mql', 0)}
  SQL:          {funnel.get('sql', 0)}
  Opportunity:  {funnel.get('opportunity', 0)}
  Customer:     {funnel.get('customer', 0)}
  Disqualified: {funnel.get('disqualified', 0)}

Campaigns:
{chr(10).join(campaign_lines) if campaign_lines else "  No campaigns found."}

Content Calendar:
{chr(10).join(content_lines) if content_lines else "  No content items found."}

Channel Metrics:
{chr(10).join(channel_lines) if channel_lines else "  No channel metric rows found."}
""".strip()
    finally:
        db.close()


def get_legal_context() -> str:
    """Fetch live legal operations and compliance data."""
    db = SessionLocal()
    try:
        summary = crud.get_legal_summary(db)
        documents = crud.get_legal_documents(db, limit=20)
        contracts = crud.get_legal_contracts(db, limit=20)
        tasks = crud.get_legal_compliance_tasks(db, limit=20)

        doc_lines = []
        for item in documents[:12]:
            source = item.source.value if hasattr(item.source, "value") else str(item.source)
            status = item.status.value if hasattr(item.status, "value") else str(item.status)
            doc_lines.append(
                f"  - {item.title} | #{item.document_number or 'N/A'} | {item.category} | "
                f"{item.jurisdiction} | {source} | {status}"
            )

        contract_lines = []
        for item in contracts[:12]:
            status = item.status.value if hasattr(item.status, "value") else str(item.status)
            risk_level = item.risk_level.value if hasattr(item.risk_level, "value") else str(item.risk_level)
            contract_lines.append(
                f"  - {item.title} | {item.counterparty} | {status} | Risk: {risk_level} | "
                f"End: {_fmt_date(item.end_date)} | Value: {_fmt_money(item.value_amount)} {item.currency}"
            )

        task_lines = []
        for item in tasks[:12]:
            status = item.status.value if hasattr(item.status, "value") else str(item.status)
            risk_level = item.risk_level.value if hasattr(item.risk_level, "value") else str(item.risk_level)
            task_lines.append(
                f"  - {item.title} | {status} | Risk: {risk_level} | "
                f"Owner: {item.owner or 'Unassigned'} | Due: {_fmt_date(item.due_date)}"
            )

        return f"""
REAL LEGAL DATA (live from database):

Summary:
  Documents Total:              {summary.get('documents_total', 0)}
  Active Documents:             {summary.get('active_documents', 0)}
  Lex.uz Source Documents:      {summary.get('lex_documents', 0)}
  Review Due Documents:         {summary.get('review_due_documents', 0)}
  Contracts Total:              {summary.get('contracts_total', 0)}
  Active Contracts:             {summary.get('active_contracts', 0)}
  Expiring Contracts (30d):     {summary.get('expiring_contracts_30d', 0)}
  High-Risk Contracts:          {summary.get('high_risk_contracts', 0)}
  Compliance Tasks Open:        {summary.get('open_tasks', 0)}
  Compliance Tasks Overdue:     {summary.get('overdue_tasks', 0)}
  High-Risk Compliance Tasks:   {summary.get('high_risk_tasks', 0)}
  Overdue Ratio:                {summary.get('overdue_ratio_percent', 0)}%

Document Library:
{chr(10).join(doc_lines) if doc_lines else "  No legal documents found."}

Contract Registry:
{chr(10).join(contract_lines) if contract_lines else "  No contracts found."}

Compliance Tasks:
{chr(10).join(task_lines) if task_lines else "  No compliance tasks found."}
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
        "marketing": get_marketing_context,
        "legal": get_legal_context,
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
