from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from database.models import (
    TransactionType,
    TransactionStatus,
    EmployeeStatus,
    PositionStatus,
    ProjectStatus,
    TaskPriority,
)


# ── Finance Schemas ───────────────────────────────────
class TransactionCreate(BaseModel):
    description: str
    category: str
    amount: float
    type: TransactionType
    status: TransactionStatus = TransactionStatus.pending
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[TransactionType] = None
    status: Optional[TransactionStatus] = None
    notes: Optional[str] = None


class TransactionOut(BaseModel):
    id: int
    date: datetime
    description: str
    category: str
    amount: float
    type: TransactionType
    status: TransactionStatus
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class InvoiceCreate(BaseModel):
    invoice_number: str
    client_name: str
    client_email: Optional[str] = None
    amount: float
    tax: float = 0
    status: str = "draft"
    notes: Optional[str] = None


class InvoiceUpdate(BaseModel):
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    amount: Optional[float] = None
    tax: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    client_name: str
    client_email: Optional[str]
    amount: float
    tax: float
    status: str
    issue_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# ── HR Schemas ────────────────────────────────────────
class EmployeeCreate(BaseModel):
    full_name: str
    email: str
    phone: Optional[str] = None
    department: str
    role: str
    salary: Optional[float] = None
    status: EmployeeStatus = EmployeeStatus.active
    notes: Optional[str] = None


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    salary: Optional[float] = None
    status: Optional[EmployeeStatus] = None
    notes: Optional[str] = None


class EmployeeOut(BaseModel):
    id: int
    full_name: str
    email: str
    phone: Optional[str]
    department: str
    role: str
    salary: Optional[float]
    status: EmployeeStatus
    start_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class PositionCreate(BaseModel):
    title: str
    department: str
    description: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    status: PositionStatus = PositionStatus.open


class PositionUpdate(BaseModel):
    title: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    status: Optional[PositionStatus] = None


class PositionOut(BaseModel):
    id: int
    title: str
    department: str
    description: Optional[str]
    salary_min: Optional[float]
    salary_max: Optional[float]
    status: PositionStatus
    opened_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    name: str
    head: Optional[str] = None


class DepartmentOut(BaseModel):
    id: int
    name: str
    head: Optional[str]

    class Config:
        from_attributes = True


# ── Projects & Kanban Schemas ────────────────────────
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.active
    color: str = "#7c6aff"
    owner: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    color: Optional[str] = None
    owner: Optional[str] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: ProjectStatus
    color: str
    owner: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ColumnCreate(BaseModel):
    project_id: int
    name: str
    color: str = "#555"
    position: int = 0


class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None


class ColumnOut(BaseModel):
    id: int
    project_id: int
    name: str
    color: str
    position: int

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    column_id: int
    project_id: int
    title: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.medium
    assignee: Optional[str] = None
    tags: Optional[str] = None
    position: int = 0


class TaskUpdate(BaseModel):
    column_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[TaskPriority] = None
    assignee: Optional[str] = None
    tags: Optional[str] = None
    position: Optional[int] = None


class TaskOut(BaseModel):
    id: int
    column_id: int
    project_id: int
    title: str
    description: Optional[str]
    priority: TaskPriority
    assignee: Optional[str]
    tags: Optional[str]
    position: int
    created_at: datetime

    class Config:
        from_attributes = True