from datetime import datetime, timedelta

from database.connection import SessionLocal, engine, Base
from database.models import (
    Transaction,
    Invoice,
    Employee,
    Position,
    Department,
    TransactionType,
    TransactionStatus,
    EmployeeStatus,
    PositionStatus,
    Project,
    ProjectStatus,
    KanbanColumn,
    KanbanTask,
    TaskPriority,
    ClientOrg,
    Subscription,
    Payment,
    PlanTier,
    PlanStatus,
    PaymentStatus,
)

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# ── Departments ───────────────────────────────────────
departments = [
    Department(name="Engineering", head="David Kim"),
    Department(name="Finance", head="Priya Sharma"),
    Department(name="HR", head="Tom Williams"),
    Department(name="Sales", head="Marcus Johnson"),
    Department(name="Marketing", head="Lisa Park"),
    Department(name="Legal", head="Anna Müller"),
]

# ── Employees ─────────────────────────────────────────
employees = [
    Employee(
        full_name="Sarah Chen",
        email="sarah@benela.dev",
        department="Engineering",
        role="Sr. Engineer",
        salary=95000,
        status=EmployeeStatus.active,
        start_date=datetime(2022, 1, 15),
    ),
    Employee(
        full_name="Marcus Johnson",
        email="marcus@benela.dev",
        department="Sales",
        role="Account Exec",
        salary=72000,
        status=EmployeeStatus.active,
        start_date=datetime(2023, 3, 1),
    ),
    Employee(
        full_name="Priya Sharma",
        email="priya@benela.dev",
        department="Finance",
        role="Analyst",
        salary=68000,
        status=EmployeeStatus.on_leave,
        start_date=datetime(2021, 6, 1),
    ),
    Employee(
        full_name="Tom Williams",
        email="tom@benela.dev",
        department="HR",
        role="HR Manager",
        salary=75000,
        status=EmployeeStatus.active,
        start_date=datetime(2020, 11, 1),
    ),
    Employee(
        full_name="Lisa Park",
        email="lisa@benela.dev",
        department="Marketing",
        role="CMO",
        salary=110000,
        status=EmployeeStatus.active,
        start_date=datetime(2019, 8, 1),
    ),
    Employee(
        full_name="David Kim",
        email="david@benela.dev",
        department="Engineering",
        role="Lead Developer",
        salary=105000,
        status=EmployeeStatus.active,
        start_date=datetime(2022, 2, 14),
    ),
    Employee(
        full_name="Anna Müller",
        email="anna@benela.dev",
        department="Legal",
        role="Legal Counsel",
        salary=98000,
        status=EmployeeStatus.active,
        start_date=datetime(2023, 4, 3),
    ),
    Employee(
        full_name="James Carter",
        email="james@benela.dev",
        department="Engineering",
        role="Junior Dev",
        salary=58000,
        status=EmployeeStatus.active,
        start_date=datetime(2024, 1, 8),
    ),
]

# ── Open Positions ────────────────────────────────────
positions = [
    Position(
        title="Senior Backend Engineer",
        department="Engineering",
        salary_min=90000,
        salary_max=120000,
        status=PositionStatus.open,
        description="FastAPI, Python, PostgreSQL experience required",
    ),
    Position(
        title="Product Designer",
        department="Marketing",
        salary_min=70000,
        salary_max=90000,
        status=PositionStatus.open,
        description="Figma, design systems, B2B SaaS experience",
    ),
    Position(
        title="Sales Development Rep",
        department="Sales",
        salary_min=50000,
        salary_max=65000,
        status=PositionStatus.open,
        description="Outbound sales, CRM tools, strong communication",
    ),
    Position(
        title="DevOps Engineer",
        department="Engineering",
        salary_min=85000,
        salary_max=115000,
        status=PositionStatus.on_hold,
        description="AWS, Kubernetes, CI/CD pipelines",
    ),
    Position(
        title="Financial Analyst",
        department="Finance",
        salary_min=60000,
        salary_max=80000,
        status=PositionStatus.open,
        description="FP&A experience, Excel/SQL proficiency",
    ),
]

# ── Finance data ──────────────────────────────────────
transactions = [
    Transaction(
        description="Client Payment — Acme Corp",
        category="Revenue",
        amount=18500,
        type=TransactionType.income,
        status=TransactionStatus.received,
        date=datetime.now() - timedelta(days=1),
    ),
    Transaction(
        description="AWS Infrastructure",
        category="Operations",
        amount=4200,
        type=TransactionType.expense,
        status=TransactionStatus.paid,
        date=datetime.now() - timedelta(days=1),
    ),
    Transaction(
        description="Payroll — February",
        category="HR",
        amount=42000,
        type=TransactionType.expense,
        status=TransactionStatus.paid,
        date=datetime.now() - timedelta(days=2),
    ),
    Transaction(
        description="Client Payment — XYZ Ltd",
        category="Revenue",
        amount=9800,
        type=TransactionType.income,
        status=TransactionStatus.received,
        date=datetime.now() - timedelta(days=3),
    ),
    Transaction(
        description="Office Supplies",
        category="Admin",
        amount=380,
        type=TransactionType.expense,
        status=TransactionStatus.paid,
        date=datetime.now() - timedelta(days=3),
    ),
    Transaction(
        description="Software Licenses",
        category="Tech",
        amount=1200,
        type=TransactionType.expense,
        status=TransactionStatus.pending,
        date=datetime.now() - timedelta(days=4),
    ),
    Transaction(
        description="Marketing Campaign — Feb",
        category="Marketing",
        amount=5500,
        type=TransactionType.expense,
        status=TransactionStatus.paid,
        date=datetime.now() - timedelta(days=5),
    ),
    Transaction(
        description="Client Payment — StartupCo",
        category="Revenue",
        amount=14200,
        type=TransactionType.income,
        status=TransactionStatus.received,
        date=datetime.now() - timedelta(days=6),
    ),
]

invoices = [
    Invoice(
        invoice_number="INV-001",
        client_name="Acme Corp",
        amount=18500,
        status="paid",
        client_email="billing@acme.com",
    ),
    Invoice(
        invoice_number="INV-002",
        client_name="XYZ Ltd",
        amount=9800,
        status="paid",
        client_email="finance@xyz.com",
    ),
    Invoice(
        invoice_number="INV-003",
        client_name="StartupCo",
        amount=14200,
        status="pending",
        client_email="cfo@startupco.com",
    ),
    Invoice(
        invoice_number="INV-004",
        client_name="GlobalTech",
        amount=32000,
        status="overdue",
        client_email="ap@globaltech.com",
    ),
    Invoice(
        invoice_number="INV-005",
        client_name="NovaCorp",
        amount=8500,
        status="draft",
        client_email="billing@novacorp.com",
    ),
]

# ── Projects & Kanban seed ────────────────────────────
projects = [
    Project(
        name="Website Redesign",
        description="Redesign benela.dev marketing site",
        status=ProjectStatus.active,
        color="#7c6aff",
        owner="Lisa Park",
    ),
    Project(
        name="Mobile App MVP",
        description="iOS and Android app for Benela",
        status=ProjectStatus.active,
        color="#60a5fa",
        owner="David Kim",
    ),
    Project(
        name="API v2 Migration",
        description="Migrate all endpoints to new schema",
        status=ProjectStatus.on_hold,
        color="#f59e0b",
        owner="Sarah Chen",
    ),
    Project(
        name="Q1 Marketing Campaign",
        description="Multi-channel Q1 push",
        status=ProjectStatus.completed,
        color="#34d399",
        owner="Marcus Johnson",
    ),
]
db.add_all(projects)
db.flush()

cols = [
    KanbanColumn(
        project_id=projects[0].id,
        name="Backlog",
        color="#555",
        position=0,
    ),
    KanbanColumn(
        project_id=projects[0].id,
        name="In Progress",
        color="#7c6aff",
        position=1,
    ),
    KanbanColumn(
        project_id=projects[0].id,
        name="In Review",
        color="#fbbf24",
        position=2,
    ),
    KanbanColumn(
        project_id=projects[0].id,
        name="Done",
        color="#34d399",
        position=3,
    ),
]
db.add_all(cols)
db.flush()

tasks = [
    KanbanTask(
        column_id=cols[0].id,
        project_id=projects[0].id,
        title="Audit current site",
        priority=TaskPriority.high,
        assignee="Lisa Park",
        position=0,
    ),
    KanbanTask(
        column_id=cols[0].id,
        project_id=projects[0].id,
        title="Define new sitemap",
        priority=TaskPriority.medium,
        assignee="Tom Williams",
        position=1,
    ),
    KanbanTask(
        column_id=cols[1].id,
        project_id=projects[0].id,
        title="Design hero section",
        priority=TaskPriority.critical,
        assignee="Lisa Park",
        position=0,
        tags="design,frontend",
    ),
    KanbanTask(
        column_id=cols[1].id,
        project_id=projects[0].id,
        title="Write copy for features",
        priority=TaskPriority.medium,
        assignee="Marcus Johnson",
        position=1,
    ),
    KanbanTask(
        column_id=cols[2].id,
        project_id=projects[0].id,
        title="Pricing page layout",
        priority=TaskPriority.high,
        assignee="David Kim",
        position=0,
        tags="design",
    ),
    KanbanTask(
        column_id=cols[3].id,
        project_id=projects[0].id,
        title="Setup domain SSL",
        priority=TaskPriority.low,
        assignee="David Kim",
        position=0,
        tags="devops",
    ),
    KanbanTask(
        column_id=cols[3].id,
        project_id=projects[0].id,
        title="Analytics tracking",
        priority=TaskPriority.low,
        assignee="Lisa Park",
        position=1,
    ),
]

# ── Admin: Client orgs, subscriptions, payments ───────
client_orgs = [
    ClientOrg(name="Acme Corp", slug="acme-corp", owner_name="John Doe", owner_email="john@acme.com", industry="SaaS", company_size="50-200", country="US"),
    ClientOrg(name="TechStart Ltd", slug="techstart", owner_name="Jane Smith", owner_email="jane@techstart.com", industry="Tech", company_size="10-50", country="UK"),
    ClientOrg(name="GlobalCo", slug="globalco", owner_name="Mike Brown", owner_email="mike@globalco.com", industry="Finance", company_size="200+", country="DE"),
    ClientOrg(name="FastGrow Inc", slug="fastgrow", owner_name="Amy Lee", owner_email="amy@fastgrow.com", industry="E-comm", company_size="1-10", country="US"),
    ClientOrg(name="NovaCorp", slug="novacorp", owner_name="Bob Wilson", owner_email="bob@novacorp.com", industry="Health", company_size="10-50", country="CA"),
    ClientOrg(name="Innovate Ltd", slug="innovate", owner_name="Sara Jones", owner_email="sara@innovate.com", industry="Legal", company_size="1-10", country="AU"),
]
db.add_all(client_orgs)
db.flush()

subscriptions = [
    Subscription(client_id=client_orgs[0].id, plan_tier=PlanTier.pro, status=PlanStatus.active, price_monthly=149, seats=50, modules="finance,hr,sales,support"),
    Subscription(client_id=client_orgs[1].id, plan_tier=PlanTier.starter, status=PlanStatus.active, price_monthly=49, seats=10, modules="finance,hr"),
    Subscription(client_id=client_orgs[2].id, plan_tier=PlanTier.enterprise, status=PlanStatus.active, price_monthly=499, seats=200, modules="finance,hr,sales,support,legal,marketing,supply_chain,procurement,insights"),
    Subscription(client_id=client_orgs[3].id, plan_tier=PlanTier.trial, status=PlanStatus.trial, price_monthly=0, seats=5, modules="finance,hr"),
    Subscription(client_id=client_orgs[4].id, plan_tier=PlanTier.starter, status=PlanStatus.active, price_monthly=49, seats=10, modules="finance,hr"),
    Subscription(client_id=client_orgs[5].id, plan_tier=PlanTier.trial, status=PlanStatus.trial, price_monthly=0, seats=5, modules="finance"),
]
db.add_all(subscriptions)
db.flush()

payments = [
    Payment(client_id=client_orgs[0].id, subscription_id=subscriptions[0].id, amount=149, status=PaymentStatus.paid, description="Pro Plan - February 2025", invoice_number="ADM-001", paid_at=datetime.now()),
    Payment(client_id=client_orgs[0].id, subscription_id=subscriptions[0].id, amount=149, status=PaymentStatus.paid, description="Pro Plan - January 2025", invoice_number="ADM-002", paid_at=datetime.now() - timedelta(days=30)),
    Payment(client_id=client_orgs[2].id, subscription_id=subscriptions[2].id, amount=499, status=PaymentStatus.paid, description="Enterprise - February", invoice_number="ADM-003", paid_at=datetime.now()),
    Payment(client_id=client_orgs[1].id, subscription_id=subscriptions[1].id, amount=49, status=PaymentStatus.pending, description="Starter Plan - March", invoice_number="ADM-004"),
    Payment(client_id=client_orgs[4].id, subscription_id=subscriptions[4].id, amount=49, status=PaymentStatus.failed, description="Starter Plan - February", invoice_number="ADM-005"),
]
db.add_all(payments)

db.add_all(departments)
db.add_all(employees)
db.add_all(positions)
db.add_all(transactions)
db.add_all(invoices)
db.add_all(tasks)
db.commit()
db.close()
print("✅ Finance + HR + Projects + Admin seed data added!")