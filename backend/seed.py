from database.connection import SessionLocal, engine, Base
from database.models import Transaction, Invoice, Employee, Position, Department, TransactionType, TransactionStatus, EmployeeStatus, PositionStatus
from datetime import datetime, timedelta

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# ── Departments ───────────────────────────────────────
departments = [
    Department(name="Engineering",  head="David Kim"),
    Department(name="Finance",      head="Priya Sharma"),
    Department(name="HR",           head="Tom Williams"),
    Department(name="Sales",        head="Marcus Johnson"),
    Department(name="Marketing",    head="Lisa Park"),
    Department(name="Legal",        head="Anna Müller"),
]

# ── Employees ─────────────────────────────────────────
employees = [
    Employee(full_name="Sarah Chen",     email="sarah@benela.dev",   department="Engineering", role="Sr. Engineer",   salary=95000, status=EmployeeStatus.active,    start_date=datetime(2022, 1, 15)),
    Employee(full_name="Marcus Johnson", email="marcus@benela.dev",  department="Sales",       role="Account Exec",   salary=72000, status=EmployeeStatus.active,    start_date=datetime(2023, 3, 1)),
    Employee(full_name="Priya Sharma",   email="priya@benela.dev",   department="Finance",     role="Analyst",        salary=68000, status=EmployeeStatus.on_leave,  start_date=datetime(2021, 6, 1)),
    Employee(full_name="Tom Williams",   email="tom@benela.dev",     department="HR",          role="HR Manager",     salary=75000, status=EmployeeStatus.active,    start_date=datetime(2020, 11, 1)),
    Employee(full_name="Lisa Park",      email="lisa@benela.dev",    department="Marketing",   role="CMO",            salary=110000,status=EmployeeStatus.active,    start_date=datetime(2019, 8, 1)),
    Employee(full_name="David Kim",      email="david@benela.dev",   department="Engineering", role="Lead Developer", salary=105000,status=EmployeeStatus.active,    start_date=datetime(2022, 2, 14)),
    Employee(full_name="Anna Müller",    email="anna@benela.dev",    department="Legal",       role="Legal Counsel",  salary=98000, status=EmployeeStatus.active,    start_date=datetime(2023, 4, 3)),
    Employee(full_name="James Carter",   email="james@benela.dev",   department="Engineering", role="Junior Dev",     salary=58000, status=EmployeeStatus.active,    start_date=datetime(2024, 1, 8)),
]

# ── Open Positions ────────────────────────────────────
positions = [
    Position(title="Senior Backend Engineer", department="Engineering", salary_min=90000, salary_max=120000, status=PositionStatus.open,    description="FastAPI, Python, PostgreSQL experience required"),
    Position(title="Product Designer",        department="Marketing",   salary_min=70000, salary_max=90000,  status=PositionStatus.open,    description="Figma, design systems, B2B SaaS experience"),
    Position(title="Sales Development Rep",   department="Sales",       salary_min=50000, salary_max=65000,  status=PositionStatus.open,    description="Outbound sales, CRM tools, strong communication"),
    Position(title="DevOps Engineer",         department="Engineering", salary_min=85000, salary_max=115000, status=PositionStatus.on_hold, description="AWS, Kubernetes, CI/CD pipelines"),
    Position(title="Financial Analyst",       department="Finance",     salary_min=60000, salary_max=80000,  status=PositionStatus.open,    description="FP&A experience, Excel/SQL proficiency"),
]

# ── Finance data ──────────────────────────────────────
transactions = [
    Transaction(description="Client Payment — Acme Corp",   category="Revenue",    amount=18500, type=TransactionType.income,  status=TransactionStatus.received, date=datetime.now() - timedelta(days=1)),
    Transaction(description="AWS Infrastructure",           category="Operations", amount=4200,  type=TransactionType.expense, status=TransactionStatus.paid,     date=datetime.now() - timedelta(days=1)),
    Transaction(description="Payroll — February",           category="HR",         amount=42000, type=TransactionType.expense, status=TransactionStatus.paid,     date=datetime.now() - timedelta(days=2)),
    Transaction(description="Client Payment — XYZ Ltd",    category="Revenue",    amount=9800,  type=TransactionType.income,  status=TransactionStatus.received, date=datetime.now() - timedelta(days=3)),
    Transaction(description="Office Supplies",              category="Admin",      amount=380,   type=TransactionType.expense, status=TransactionStatus.paid,     date=datetime.now() - timedelta(days=3)),
    Transaction(description="Software Licenses",            category="Tech",       amount=1200,  type=TransactionType.expense, status=TransactionStatus.pending,  date=datetime.now() - timedelta(days=4)),
    Transaction(description="Marketing Campaign — Feb",     category="Marketing",  amount=5500,  type=TransactionType.expense, status=TransactionStatus.paid,     date=datetime.now() - timedelta(days=5)),
    Transaction(description="Client Payment — StartupCo",  category="Revenue",    amount=14200, type=TransactionType.income,  status=TransactionStatus.received, date=datetime.now() - timedelta(days=6)),
]

invoices = [
    Invoice(invoice_number="INV-001", client_name="Acme Corp",  amount=18500, status="paid",    client_email="billing@acme.com"),
    Invoice(invoice_number="INV-002", client_name="XYZ Ltd",    amount=9800,  status="paid",    client_email="finance@xyz.com"),
    Invoice(invoice_number="INV-003", client_name="StartupCo",  amount=14200, status="pending", client_email="cfo@startupco.com"),
    Invoice(invoice_number="INV-004", client_name="GlobalTech", amount=32000, status="overdue", client_email="ap@globaltech.com"),
    Invoice(invoice_number="INV-005", client_name="NovaCorp",   amount=8500,  status="draft",   client_email="billing@novacorp.com"),
]

db.add_all(departments)
db.add_all(employees)
db.add_all(positions)
db.add_all(transactions)
db.add_all(invoices)
db.commit()
db.close()
print("✅ Finance + HR seed data added!")