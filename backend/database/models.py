from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum, Boolean, ForeignKey
from sqlalchemy.sql import func
from database.connection import Base
import enum

# ── Enums ─────────────────────────────────────────────
class TransactionType(str, enum.Enum):
    income = "income"
    expense = "expense"

class TransactionStatus(str, enum.Enum):
    paid = "paid"
    pending = "pending"
    received = "received"
    overdue = "overdue"

class EmployeeStatus(str, enum.Enum):
    active = "active"
    on_leave = "on_leave"
    terminated = "terminated"

class PositionStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    on_hold = "on_hold"

# ── Finance Models ────────────────────────────────────
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
    id             = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(50), unique=True, nullable=False)
    client_name    = Column(String(255), nullable=False)
    client_email   = Column(String(255), nullable=True)
    amount         = Column(Float, nullable=False)
    tax            = Column(Float, default=0)
    status         = Column(String(50), default="draft")
    issue_date     = Column(DateTime, default=func.now())
    due_date       = Column(DateTime, nullable=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=func.now())

# ── HR Models ─────────────────────────────────────────
class Department(Base):
    __tablename__ = "departments"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False, unique=True)
    head       = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=func.now())

class Employee(Base):
    __tablename__ = "employees"
    id           = Column(Integer, primary_key=True, index=True)
    full_name    = Column(String(255), nullable=False)
    email        = Column(String(255), unique=True, nullable=False)
    phone        = Column(String(50), nullable=True)
    department   = Column(String(100), nullable=False)
    role         = Column(String(100), nullable=False)
    salary       = Column(Float, nullable=True)
    status       = Column(Enum(EmployeeStatus), default=EmployeeStatus.active)
    start_date   = Column(DateTime, default=func.now())
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=func.now())
    updated_at   = Column(DateTime, default=func.now(), onupdate=func.now())

class Position(Base):
    __tablename__ = "positions"
    id           = Column(Integer, primary_key=True, index=True)
    title        = Column(String(100), nullable=False)
    department   = Column(String(100), nullable=False)
    description  = Column(Text, nullable=True)
    salary_min   = Column(Float, nullable=True)
    salary_max   = Column(Float, nullable=True)
    status       = Column(Enum(PositionStatus), default=PositionStatus.open)
    opened_date  = Column(DateTime, default=func.now())
    created_at   = Column(DateTime, default=func.now())