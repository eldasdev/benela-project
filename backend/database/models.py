from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum
from sqlalchemy.sql import func
from database.connection import Base
import enum

class TransactionType(str, enum.Enum):
    income = "income"
    expense = "expense"

class TransactionStatus(str, enum.Enum):
    paid = "paid"
    pending = "pending"
    received = "received"
    overdue = "overdue"

class Transaction(Base):
    __tablename__ = "transactions"

    id          = Column(Integer, primary_key=True, index=True)
    date        = Column(DateTime, default=func.now())
    description = Column(String(255), nullable=False)
    category    = Column(String(100), nullable=False)
    amount      = Column(Float, nullable=False)
    type        = Column(Enum(TransactionType), nullable=False)
    status      = Column(Enum(TransactionStatus), default=TransactionStatus.pending)
    notes       = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=func.now())
    updated_at  = Column(DateTime, default=func.now(), onupdate=func.now())

class Invoice(Base):
    __tablename__ = "invoices"

    id            = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(50), unique=True, nullable=False)
    client_name   = Column(String(255), nullable=False)
    client_email  = Column(String(255), nullable=True)
    amount        = Column(Float, nullable=False)
    tax           = Column(Float, default=0)
    status        = Column(String(50), default="draft")
    issue_date    = Column(DateTime, default=func.now())
    due_date      = Column(DateTime, nullable=True)
    notes         = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=func.now())

class Budget(Base):
    __tablename__ = "budgets"

    id         = Column(Integer, primary_key=True, index=True)
    category   = Column(String(100), nullable=False)
    allocated  = Column(Float, nullable=False)
    spent      = Column(Float, default=0)
    period     = Column(String(20), nullable=False)  # e.g. "2025-Q1"
    created_at = Column(DateTime, default=func.now())