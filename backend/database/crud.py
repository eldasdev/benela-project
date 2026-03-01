from sqlalchemy.orm import Session
from sqlalchemy import func
from database.models import (
    Transaction,
    Invoice,
    Employee,
    Position,
    Department,
    TransactionType,
    Project,
    KanbanColumn,
    KanbanTask,
)
from database import schemas


# ── Finance ───────────────────────────────────────────
def get_transactions(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(Transaction)
        .order_by(Transaction.date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

def get_transaction(db: Session, id: int):
    return db.query(Transaction).filter(Transaction.id == id).first()

def create_transaction(db: Session, data: schemas.TransactionCreate):
    tx = Transaction(**data.model_dump())
    db.add(tx); db.commit(); db.refresh(tx)
    return tx

def update_transaction(db: Session, id: int, data: schemas.TransactionUpdate):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(tx, k, v)
    db.commit(); db.refresh(tx)
    return tx

def delete_transaction(db: Session, id: int):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx: return False
    db.delete(tx); db.commit()
    return True

def get_finance_summary(db: Session):
    income = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.type == TransactionType.income)
        .scalar()
        or 0
    )
    expenses = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.type == TransactionType.expense)
        .scalar()
        or 0
    )
    pending = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.status == "pending")
        .scalar()
        or 0
    )
    return {
        "total_income": round(income, 2),
        "total_expenses": round(expenses, 2),
        "net_profit": round(income - expenses, 2),
        "pending_invoices": pending,
    }

def get_invoices(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Invoice).order_by(Invoice.issue_date.desc()).offset(skip).limit(limit).all()

def get_invoice(db: Session, id: int):
    return db.query(Invoice).filter(Invoice.id == id).first()

def create_invoice(db: Session, data: schemas.InvoiceCreate):
    inv = Invoice(**data.model_dump())
    db.add(inv); db.commit(); db.refresh(inv)
    return inv

def update_invoice(db: Session, id: int, data: schemas.InvoiceUpdate):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(inv, k, v)
    db.commit(); db.refresh(inv)
    return inv

def delete_invoice(db: Session, id: int):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv: return False
    db.delete(inv); db.commit()
    return True

# ── HR ────────────────────────────────────────────────
def get_employees(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(Employee)
        .order_by(Employee.full_name)
        .offset(skip)
        .limit(limit)
        .all()
    )

def get_employee(db: Session, id: int):
    return db.query(Employee).filter(Employee.id == id).first()

def create_employee(db: Session, data: schemas.EmployeeCreate):
    emp = Employee(**data.model_dump())
    db.add(emp); db.commit(); db.refresh(emp)
    return emp

def update_employee(db: Session, id: int, data: schemas.EmployeeUpdate):
    emp = db.query(Employee).filter(Employee.id == id).first()
    if not emp: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(emp, k, v)
    db.commit(); db.refresh(emp)
    return emp

def delete_employee(db: Session, id: int):
    emp = db.query(Employee).filter(Employee.id == id).first()
    if not emp: return False
    db.delete(emp); db.commit()
    return True

def get_hr_summary(db: Session):
    total = db.query(func.count(Employee.id)).scalar() or 0
    active = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "active")
        .scalar()
        or 0
    )
    on_leave = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "on_leave")
        .scalar()
        or 0
    )
    open_roles = (
        db.query(func.count(Position.id))
        .filter(Position.status == "open")
        .scalar()
        or 0
    )
    return {
        "total_employees": total,
        "active": active,
        "on_leave": on_leave,
        "open_positions": open_roles,
    }


def get_positions(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(Position)
        .order_by(Position.opened_date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

def get_position(db: Session, id: int):
    return db.query(Position).filter(Position.id == id).first()

def create_position(db: Session, data: schemas.PositionCreate):
    pos = Position(**data.model_dump())
    db.add(pos); db.commit(); db.refresh(pos)
    return pos

def update_position(db: Session, id: int, data: schemas.PositionUpdate):
    pos = db.query(Position).filter(Position.id == id).first()
    if not pos: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(pos, k, v)
    db.commit(); db.refresh(pos)
    return pos

def delete_position(db: Session, id: int):
    pos = db.query(Position).filter(Position.id == id).first()
    if not pos: return False
    db.delete(pos); db.commit()
    return True

def get_departments(db: Session):
    return db.query(Department).order_by(Department.name).all()


def create_department(db: Session, data: schemas.DepartmentCreate):
    dept = Department(**data.model_dump())
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


# ── Projects & Kanban ─────────────────────────────────
def get_projects(db: Session):
    return db.query(Project).order_by(Project.created_at.desc()).all()


def get_project(db: Session, id: int):
    return db.query(Project).filter(Project.id == id).first()


def create_project(db: Session, data: schemas.ProjectCreate):
    project = Project(**data.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, id: int, data: schemas.ProjectUpdate):
    project = db.query(Project).filter(Project.id == id).first()
    if not project:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(project, k, v)
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, id: int):
    project = db.query(Project).filter(Project.id == id).first()
    if not project:
        return False
    db.delete(project)
    db.commit()
    return True


def get_project_summary(db: Session):
    total = db.query(func.count(Project.id)).scalar() or 0
    active = (
        db.query(func.count(Project.id))
        .filter(Project.status == "active")
        .scalar()
        or 0
    )
    completed = (
        db.query(func.count(Project.id))
        .filter(Project.status == "completed")
        .scalar()
        or 0
    )
    tasks_open = db.query(func.count(KanbanTask.id)).scalar() or 0
    return {
        "total_projects": total,
        "active": active,
        "completed": completed,
        "total_tasks": tasks_open,
    }


def get_columns(db: Session, project_id: int):
    return (
        db.query(KanbanColumn)
        .filter(KanbanColumn.project_id == project_id)
        .order_by(KanbanColumn.position)
        .all()
    )


def create_column(db: Session, data: schemas.ColumnCreate):
    column = KanbanColumn(**data.model_dump())
    db.add(column)
    db.commit()
    db.refresh(column)
    return column


def update_column(db: Session, id: int, data: schemas.ColumnUpdate):
    column = db.query(KanbanColumn).filter(KanbanColumn.id == id).first()
    if not column:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(column, k, v)
    db.commit()
    db.refresh(column)
    return column


def delete_column(db: Session, id: int):
    column = db.query(KanbanColumn).filter(KanbanColumn.id == id).first()
    if not column:
        return False
    db.delete(column)
    db.commit()
    return True


def get_tasks(db: Session, project_id: int):
    return (
        db.query(KanbanTask)
        .filter(KanbanTask.project_id == project_id)
        .order_by(KanbanTask.position)
        .all()
    )


def get_tasks_by_column(db: Session, column_id: int):
    return (
        db.query(KanbanTask)
        .filter(KanbanTask.column_id == column_id)
        .order_by(KanbanTask.position)
        .all()
    )


def create_task(db: Session, data: schemas.TaskCreate):
    task = KanbanTask(**data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, id: int, data: schemas.TaskUpdate):
    task = db.query(KanbanTask).filter(KanbanTask.id == id).first()
    if not task:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(task, k, v)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, id: int):
    task = db.query(KanbanTask).filter(KanbanTask.id == id).first()
    if not task:
        return False
    db.delete(task)
    db.commit()
    return True


def move_task(db: Session, task_id: int, new_column_id: int, new_position: int):
    task = db.query(KanbanTask).filter(KanbanTask.id == task_id).first()
    if not task:
        return None
    task.column_id = new_column_id
    task.position = new_position
    db.commit()
    db.refresh(task)
    return task