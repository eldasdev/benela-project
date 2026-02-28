from sqlalchemy.orm import Session
from sqlalchemy import func
from database.models import Transaction, Invoice, Budget, TransactionType
from database.schemas import TransactionCreate, InvoiceCreate

# ── Transactions ──────────────────────────────────────
def get_transactions(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Transaction).order_by(Transaction.date.desc()).offset(skip).limit(limit).all()

def create_transaction(db: Session, data: TransactionCreate):
    tx = Transaction(**data.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx

def get_finance_summary(db: Session):
    total_income = db.query(func.sum(Transaction.amount)).filter(
        Transaction.type == TransactionType.income
    ).scalar() or 0

    total_expenses = db.query(func.sum(Transaction.amount)).filter(
        Transaction.type == TransactionType.expense
    ).scalar() or 0

    return {
        "total_income":   round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "net_profit":     round(total_income - total_expenses, 2),
    }

# ── Invoices ──────────────────────────────────────────
def get_invoices(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Invoice).order_by(Invoice.issue_date.desc()).offset(skip).limit(limit).all()

def create_invoice(db: Session, data: InvoiceCreate):
    inv = Invoice(**data.model_dump())
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv