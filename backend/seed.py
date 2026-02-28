from database.connection import SessionLocal, engine, Base
from database.models import Transaction, Invoice, TransactionType, TransactionStatus
from datetime import datetime, timedelta

Base.metadata.create_all(bind=engine)

db = SessionLocal()

transactions = [
    Transaction(description="Client Payment — Acme Corp",  category="Revenue",    amount=18500, type=TransactionType.income,  status=TransactionStatus.received, date=datetime.now() - timedelta(days=1)),
    Transaction(description="AWS Infrastructure",          category="Operations", amount=4200,  type=TransactionType.expense, status=TransactionStatus.paid,     date=datetime.now() - timedelta(days=1)),
    Transaction(description="Payroll — February",          category="HR",         amount=42000, type=TransactionType.expense, status=TransactionStatus.paid,     date=datetime.now() - timedelta(days=2)),
    Transaction(description="Client Payment — XYZ Ltd",   category="Revenue",    amount=9800,  type=TransactionType.income,  status=TransactionStatus.received, date=datetime.now() - timedelta(days=3)),
    Transaction(description="Office Supplies",             category="Admin",      amount=380,   type=TransactionType.expense, status=TransactionStatus.paid,     date=datetime.now() - timedelta(days=3)),
    Transaction(description="Software Licenses",           category="Tech",       amount=1200,  type=TransactionType.expense, status=TransactionStatus.pending,  date=datetime.now() - timedelta(days=4)),
    Transaction(description="Marketing Campaign — Feb",    category="Marketing",  amount=5500,  type=TransactionType.expense, status=TransactionStatus.paid,     date=datetime.now() - timedelta(days=5)),
    Transaction(description="Client Payment — StartupCo", category="Revenue",    amount=14200, type=TransactionType.income,  status=TransactionStatus.received, date=datetime.now() - timedelta(days=6)),
]

invoices = [
    Invoice(invoice_number="INV-001", client_name="Acme Corp",    amount=18500, status="paid",    client_email="billing@acme.com"),
    Invoice(invoice_number="INV-002", client_name="XYZ Ltd",      amount=9800,  status="paid",    client_email="finance@xyz.com"),
    Invoice(invoice_number="INV-003", client_name="StartupCo",    amount=14200, status="pending", client_email="cfo@startupco.com"),
    Invoice(invoice_number="INV-004", client_name="GlobalTech",   amount=32000, status="overdue", client_email="ap@globaltech.com"),
    Invoice(invoice_number="INV-005", client_name="NovaCorp",     amount=8500,  status="draft",   client_email="billing@novacorp.com"),
]

db.add_all(transactions)
db.add_all(invoices)
db.commit()
db.close()

print("✅ Seed data added successfully!")
