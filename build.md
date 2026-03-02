# TASK: Inject Real Database Data into AI Agent Prompts

## Read First
Read `PROJECT_STATUS.md` and `CURSOR_CONTEXT.md` for full project context.

## Problem
The AI assistant currently responds generically because it has no access to the
actual data in the Benela database. Every agent must fetch real data from the
database BEFORE calling Claude, then inject that data directly into the prompt.
Claude should never say "I don't have access to real-time data" again.

---

## Core Principle

Every agent follows this pattern:
1. Receive user message
2. Fetch relevant real data from the database
3. Build a prompt that includes that real data as context
4. Send to Claude
5. Return Claude's answer

---

## STEP 1 — Create a Data Context Fetcher

Create `backend/agents/data_fetcher.py`:

```python
from database.connection import SessionLocal
from database import crud


def get_finance_context() -> str:
    """Fetch real finance data and format as text context for Claude."""
    db = SessionLocal()
    try:
        summary     = crud.get_finance_summary(db)
        transactions = crud.get_transactions(db)
        invoices    = crud.get_invoices(db)

        # Format transactions
        tx_lines = []
        for t in transactions[:20]:  # last 20
            tx_lines.append(
                f"  - {t.date}: {t.description} | {t.type.upper()} | "
                f"${t.amount:,.2f} | {t.category} | {t.status}"
            )

        # Format invoices
        inv_lines = []
        for i in invoices[:10]:  # last 10
            inv_lines.append(
                f"  - {i.invoice_number}: {i.client_name} | "
                f"${i.amount:,.2f} | Due: {i.due_date} | {i.status}"
            )

        return f"""
REAL FINANCE DATA (live from database):

Summary:
  Total Income:       ${summary.get('total_income', 0):,.2f}
  Total Expenses:     ${summary.get('total_expenses', 0):,.2f}
  Net Profit:         ${summary.get('net_profit', 0):,.2f}
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
        summary   = crud.get_hr_summary(db)
        employees = crud.get_employees(db)
        positions = crud.get_positions(db)

        emp_lines = []
        for e in employees[:20]:
            emp_lines.append(
                f"  - {e.full_name} | {e.role} | {e.department} | "
                f"${e.salary:,.0f}/yr | {e.status}"
            )

        pos_lines = []
        for p in positions[:10]:
            pos_lines.append(
                f"  - {p.title} | {p.department} | "
                f"${p.salary_min:,.0f}-${p.salary_max:,.0f} | {p.status}"
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
        tasks    = db.query(KanbanTask).all()
        columns  = db.query(KanbanColumn).all()

        col_map = {c.id: c.name for c in columns}

        proj_lines = []
        for p in projects:
            task_count = len([t for t in tasks if t.project_id == p.id])
            proj_lines.append(
                f"  - {p.name} | {p.status} | Owner: {p.owner or 'Unassigned'} | Tasks: {task_count}"
            )

        task_lines = []
        for t in tasks[:30]:
            col_name = col_map.get(t.column_id, "Unknown")
            task_lines.append(
                f"  - [{col_name}] {t.title} | {t.priority} priority | "
                f"Assignee: {t.assignee or 'Unassigned'}"
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
            c   = item["client"]
            sub = item["subscription"]
            plan = sub.plan_tier if sub else "no plan"
            mrr  = sub.price_monthly if sub else 0
            client_lines.append(
                f"  - {c.name} | {plan} | ${mrr}/mo | "
                f"{'Suspended' if c.is_suspended else 'Active'}"
            )

        return f"""
REAL PLATFORM DATA (live from database):

Summary:
  Total Clients:  {summary.get('total_clients', 0)}
  Active:         {summary.get('active_clients', 0)}
  Suspended:      {summary.get('suspended', 0)}
  MRR:            ${summary.get('monthly_recurring_revenue', 0):,.2f}
  Trials Active:  {summary.get('trials_active', 0)}
  Paid This Month: ${summary.get('paid_this_month', 0):,.2f}

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
    """Combine finance + hr + projects for a full dashboard overview."""
    finance  = get_finance_context()
    hr       = get_hr_context()
    projects = get_projects_context()
    return f"{finance}\n\n{hr}\n\n{projects}"


def get_context_for_section(section: str) -> str:
    """Main entry point — returns the right context for any section."""
    fetchers = {
        "dashboard":    get_dashboard_context,
        "finance":      get_finance_context,
        "hr":           get_hr_context,
        "projects":     get_projects_context,
        "admin":        get_admin_context,
    }

    fetcher = fetchers.get(section)
    if fetcher:
        try:
            return fetcher()
        except Exception as e:
            return f"Note: Could not fetch live data ({str(e)}). Answering based on general knowledge."

    # For sections without dedicated fetchers (sales, support, etc.)
    return (
        f"Note: Live data integration for {section} is not yet configured. "
        f"Answer based on best practices for enterprise {section} management."
    )
```

---

## STEP 2 — Update BaseAgent to Accept and Use Context

Replace `backend/agents/base_agent.py` completely:

```python
import ssl
import certifi
import urllib.request
import urllib.error
import json
from core.config import settings


class BaseAgent:
    """
    Every Benela AI agent inherits from this.
    Calls Anthropic Claude API with real database context injected.
    """

    def __init__(self, name: str, system_prompt: str):
        self.name          = name
        self.system_prompt = system_prompt
        self.api_key       = settings.ANTHROPIC_API_KEY
        self.api_url       = "https://api.anthropic.com/v1/messages"

    def run(self, user_message: str, context: str = "") -> str:
        """Send a message to Claude with optional real data context."""

        # Build full system prompt with injected data
        if context:
            full_system = (
                f"{self.system_prompt}\n\n"
                f"You have access to the following REAL, LIVE data from the "
                f"Benela AI database. Use this data to answer the user's question "
                f"accurately and specifically. Never say you lack real-time access.\n\n"
                f"{context}"
            )
        else:
            full_system = self.system_prompt

        payload = {
            "model":      "claude-haiku-4-5-20251001",
            "max_tokens": 1024,
            "system":     full_system,
            "messages": [
                {"role": "user", "content": user_message}
            ]
        }

        data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(
            self.api_url,
            data=data,
            headers={
                "Content-Type":      "application/json",
                "x-api-key":         self.api_key,
                "anthropic-version": "2023-06-01"
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(
                req,
                context=ssl.create_default_context(cafile=certifi.where())
            ) as response:
                result = json.loads(response.read().decode("utf-8"))
                return result["content"][0]["text"]

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            raise Exception(f"Claude API error {e.code}: {error_body}")
```

---

## STEP 3 — Update FinanceAgent

Replace `backend/agents/finance_agent.py`:

```python
from agents.base_agent import BaseAgent


class FinanceAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="Finance Agent",
            system_prompt=(
                "You are an expert CFO-level AI assistant for the Finance module "
                "of Benela AI. You analyze real financial data and give sharp, "
                "actionable insights. "
                "RULES: "
                "1. Use the real data provided — reference actual numbers, names, dates. "
                "2. Never use markdown — no #, **, -, bullets. Plain text only. "
                "3. Never say you lack real-time access. You have live data. "
                "4. Be concise — 3-5 sentences max unless asked for detail. "
                "5. If something looks risky or unusual, flag it directly."
            )
        )
```

---

## STEP 4 — Update agents.py Router to Inject Context

Replace `backend/api/agents.py` completely:

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from agents.finance_agent import FinanceAgent
from agents.base_agent import BaseAgent
from agents.data_fetcher import get_context_for_section

router = APIRouter()


class TaskRequest(BaseModel):
    message: str


class TaskResponse(BaseModel):
    agent:    str
    message:  str
    response: str


def get_agent(section: str) -> BaseAgent:
    if section == "finance":
        return FinanceAgent()

    section_label = section.replace("_", " ").title()
    return BaseAgent(
        name=f"{section_label} Agent",
        system_prompt=(
            f"You are an expert AI assistant for the {section_label} module "
            f"of Benela AI, an enterprise ERP platform. "
            f"RULES: "
            f"1. Use the real data provided — reference actual numbers and names. "
            f"2. Never use markdown — no #, **, -, or bullet symbols. Plain text only. "
            f"3. Never say you lack real-time access. You have live data. "
            f"4. Be concise — 3-5 sentences max unless asked for detail. "
            f"5. Give direct answers, never ask clarifying questions first."
        )
    )


@router.post("/{section}", response_model=TaskResponse)
def run_agent(section: str, request: TaskRequest):
    """Send a message to the AI agent with real data context."""

    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        # 1. Get the right agent
        agent = get_agent(section)

        # 2. Fetch real data for this section
        context = get_context_for_section(section)

        # 3. Run agent with real data injected
        response = agent.run(request.message, context=context)

        return TaskResponse(
            agent=agent.name,
            message=request.message,
            response=response
        )

    except Exception as e:
        error_msg = str(e)

        if "529" in error_msg or "overloaded" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="AI is temporarily busy. Please try again in a moment."
            )
        if "401" in error_msg or "authentication" in error_msg.lower():
            raise HTTPException(
                status_code=401,
                detail="AI authentication failed. Check your API key."
            )
        if "429" in error_msg or "rate limit" in error_msg.lower():
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment."
            )

        raise HTTPException(
            status_code=500,
            detail="Something went wrong. Please try again."
        )
```

---

## File Checklist

- [ ] `backend/agents/data_fetcher.py` — new file (fetches real data per section)
- [ ] `backend/agents/base_agent.py` — updated (accepts context param)
- [ ] `backend/agents/finance_agent.py` — updated (cleaner system prompt)
- [ ] `backend/api/agents.py` — updated (injects context before calling Claude)

---

## Expected Final Behavior

User asks: "Summarize all information from dashboard"
Claude now responds with:
"Your business currently has $48,200 in total income and $31,400 in expenses,
giving a net profit of $16,800. You have 3 overdue invoices totalling $4,200
from Acme Corp, TechStart, and GlobalCo. HR shows 24 active employees with
2 open positions in Engineering. The Website Redesign project has 7 tasks —
3 in progress, 2 in review."

Instead of:
"I don't have access to real-time data about your Benela AI system."