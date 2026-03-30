from datetime import date

from database.connection import SessionLocal
from database import crud
from database.onec_models import OneCImportJob, OneCRecord
from integrations.attendance.attendance_service import attendance_service


def _fmt_money(value) -> str:
    if value is None:
        return "N/A"
    return f"${float(value):,.2f}"


def _fmt_uzs(value) -> str:
    if value is None:
        return "N/A"
    return f"{float(value):,.0f} UZS"


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


def get_finance_context(company_id: int | None = None) -> str:
    """Fetch real finance data and format as text context for Claude."""
    db = SessionLocal()
    try:
        summary = crud.get_finance_summary(db, company_id=company_id)
        transactions = crud.get_transactions(db, company_id=company_id)
        invoices = crud.get_invoices(db, company_id=company_id)

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


def get_onec_context(company_id: int) -> str:
    db = SessionLocal()
    try:
        latest_job = (
            db.query(OneCImportJob)
            .filter(
                OneCImportJob.company_id == company_id,
                OneCImportJob.status == "completed",
                OneCImportJob.source_hint != "ai_query",
            )
            .order_by(OneCImportJob.completed_at.desc().nullslast(), OneCImportJob.id.desc())
            .first()
        )
        if not latest_job:
            return ""

        records = (
            db.query(OneCRecord)
            .filter(OneCRecord.company_id == company_id, OneCRecord.row_status.in_(["ready", "imported"]))
            .order_by(OneCRecord.created_at.desc())
            .limit(500)
            .all()
        )
        if not records:
            return ""

        trial_balance = [record.normalized_data for record in records if record.record_type == "trial_balance"]
        transactions = [record.normalized_data for record in records if record.record_type == "transaction"]
        invoices = [record.normalized_data for record in records if record.record_type == "invoice"]
        inventory = [record.normalized_data for record in records if record.record_type == "inventory_item"]
        payroll = [record.normalized_data for record in records if record.record_type == "employee"]

        cash_total = sum(float(item.get("closing_balance") or 0) for item in trial_balance if str(item.get("account") or "").startswith(("50", "51")))
        receivables_total = sum(float(item.get("closing_balance") or 0) for item in trial_balance if str(item.get("account") or "").startswith("40"))
        payables_total = sum(float(item.get("closing_balance") or 0) for item in trial_balance if str(item.get("account") or "").startswith("60"))
        revenue_total = sum(float(item.get("amount") or 0) for item in invoices)
        payroll_total = sum(float(item.get("net_pay") or item.get("salary") or 0) for item in payroll)
        low_stock = sum(1 for item in inventory if float(item.get("closing_stock") or 0) <= 0)
        counterparties = {}
        for item in invoices:
            name = item.get("client_name") or "Unknown"
            counterparties[name] = counterparties.get(name, 0.0) + float(item.get("amount") or 0)
        top_customer = max(counterparties.items(), key=lambda value: value[1]) if counterparties else None
        top_customer_line = (
            f"- Top customer: {top_customer[0]} — {_fmt_uzs(top_customer[1])}"
            if top_customer
            else "- Top customer: N/A"
        )

        return f"""
1C INTEGRATION DATA (last synced: {_fmt_date(latest_job.completed_at)}):

ACCOUNT BALANCES:
- Cash and bank accounts: {_fmt_uzs(cash_total)}
- Accounts receivable: {_fmt_uzs(receivables_total)}
- Accounts payable: {_fmt_uzs(payables_total)}

RECENT ACTIVITY:
- Revenue from imported sales docs: {_fmt_uzs(revenue_total)} ({len(invoices)} invoices)
{top_customer_line}
- Imported transaction rows: {len(transactions)}

INVENTORY:
- Imported inventory rows: {len(inventory)}
- Low stock alerts: {low_stock}

PAYROLL:
- Imported payroll rows: {len(payroll)}
- Payroll disbursed: {_fmt_uzs(payroll_total)}
""".strip()
    finally:
        db.close()


def get_onec_anomalies(company_id: int) -> str:
    db = SessionLocal()
    try:
        records = (
            db.query(OneCRecord)
            .filter(OneCRecord.company_id == company_id, OneCRecord.row_status.in_(["ready", "imported"]))
            .order_by(OneCRecord.created_at.desc())
            .limit(500)
            .all()
        )
        findings: list[str] = []
        for record in records:
            data = record.normalized_data or {}
            if record.record_type == "transaction":
                amount = float(data.get("amount") or 0)
                if amount and abs(amount) % 1000 == 0:
                    findings.append("Round-number transactions were found in imported 1C movements.")
                if not data.get("source_counterparty") and not data.get("counterparty"):
                    findings.append("Some imported 1C transactions do not include counterparties.")
            if record.record_type == "inventory_item" and float(data.get("closing_stock") or 0) < 0:
                findings.append("Negative inventory balances exist in imported 1C stock snapshots.")
        return "\n".join(dict.fromkeys(findings))
    finally:
        db.close()


def get_onec_cashflow_forecast(company_id: int) -> str:
    db = SessionLocal()
    try:
        records = (
            db.query(OneCRecord)
            .filter(OneCRecord.company_id == company_id, OneCRecord.record_type == "transaction", OneCRecord.row_status.in_(["ready", "imported"]))
            .order_by(OneCRecord.created_at.desc())
            .limit(180)
            .all()
        )
        if not records:
            return ""
        inflow = [float(item.normalized_data.get("amount") or 0) for item in records if item.normalized_data.get("type") == "income"]
        outflow = [float(item.normalized_data.get("amount") or 0) for item in records if item.normalized_data.get("type") == "expense"]
        avg_inflow = sum(inflow) / max(len(inflow), 1)
        avg_outflow = sum(outflow) / max(len(outflow), 1)
        net = avg_inflow - avg_outflow
        return (
            f"1C CASH FLOW FORECAST:\n"
            f"- Average inflow from imported 1C transactions: {_fmt_uzs(avg_inflow)}\n"
            f"- Average outflow from imported 1C transactions: {_fmt_uzs(avg_outflow)}\n"
            f"- Projected 30-day cash position change: {_fmt_uzs(net)}"
        )
    finally:
        db.close()


def get_hr_context(company_id: int | None = None) -> str:
    """Fetch real HR data and format as text context for Claude."""
    db = SessionLocal()
    try:
        summary = crud.get_hr_summary(db, company_id=company_id)
        employees = crud.get_employees(db, company_id=company_id)
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


def get_attendance_context(company_id: int | None = None) -> str:
    if company_id is None:
        return ""

    db = SessionLocal()
    try:
        today = date.today()
        today_stats = attendance_service.get_todays_presence(db, company_id)
        monthly_stats = attendance_service.get_monthly_stats(db, company_id, today.month, today.year)

        late_lines = [
            f"  • {item.name}: +{item.late_minutes} min"
            for item in today_stats.late_arrivals[:5]
        ]
        absent_count = len(today_stats.not_arrived)
        leave_count = len(today_stats.on_leave)
        return f"""
ATTENDANCE DATA (as of {today.strftime('%d.%m.%Y')}):

TODAY:
- Employees in office: {today_stats.present_count}/{today_stats.expected_total}
- Late arrivals: {len(today_stats.late_arrivals)} employees
{chr(10).join(late_lines) if late_lines else "  • No late arrivals recorded"}
- Absent (unexcused): {absent_count}
- On approved leave: {leave_count}

THIS MONTH:
- Average attendance rate: {monthly_stats.avg_rate:.1f}%
- Total overtime hours logged: {monthly_stats.total_overtime:.1f}h
- Most late employee: {monthly_stats.most_late_employee} ({monthly_stats.most_late_count} times)
- Perfect attendance so far: {monthly_stats.perfect_attendance_count} employees

PAYROLL STATUS:
- Working days this month: {monthly_stats.working_days_total}
- Days remaining: {monthly_stats.working_days_remaining}
- Estimated total payroll: {_fmt_uzs(monthly_stats.estimated_payroll_uzs)}
- Last approved payroll: {monthly_stats.last_approved_month}
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


def get_dashboard_context(company_id: int | None = None, include_onec: bool = True) -> str:
    """Combine finance + HR + projects for a full dashboard overview."""
    finance = get_finance_context(company_id=company_id)
    if include_onec and company_id is not None:
        extras = "\n\n".join(
            part
            for part in [
                get_onec_context(company_id),
                get_onec_anomalies(company_id),
                get_onec_cashflow_forecast(company_id),
            ]
            if part
        )
        if extras:
            finance = f"{finance}\n\n{extras}".strip()
    hr = get_hr_context(company_id=company_id)
    attendance = get_attendance_context(company_id=company_id)
    projects = get_projects_context()
    return "\n\n".join(part for part in [finance, hr, attendance, projects] if part).strip()


def get_context_for_section(section: str, company_id: int | None = None, include_onec: bool = True) -> str:
    """Main entry point - returns the right context for any section."""
    if section == "dashboard":
        try:
            return get_dashboard_context(company_id=company_id, include_onec=include_onec)
        except Exception as exc:
            return f"Note: Could not fetch live data ({str(exc)}). Answering based on general knowledge."

    if section == "finance":
        try:
            context = get_finance_context(company_id=company_id)
            if include_onec and company_id is not None:
                extras = "\n\n".join(
                    part
                    for part in [
                        get_onec_context(company_id),
                        get_onec_anomalies(company_id),
                        get_onec_cashflow_forecast(company_id),
                    ]
                    if part
                )
                if extras:
                    context = f"{context}\n\n{extras}".strip()
            return context
        except Exception as exc:
            return f"Note: Could not fetch live data ({str(exc)}). Answering based on general knowledge."

    fetchers = {
        "hr": lambda: "\n\n".join(
            part for part in [get_hr_context(company_id=company_id), get_attendance_context(company_id=company_id)] if part
        ).strip(),
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
