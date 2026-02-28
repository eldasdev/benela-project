from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.connection import get_db
from database import crud, schemas
from typing import List

router = APIRouter(prefix="/hr", tags=["HR"])

@router.get("/summary")
def hr_summary(db: Session = Depends(get_db)):
    return crud.get_hr_summary(db)

# ── Employees ─────────────────────────────────────────
@router.get("/employees", response_model=List[schemas.EmployeeOut])
def list_employees(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_employees(db, skip, limit)

@router.post("/employees", response_model=schemas.EmployeeOut)
def add_employee(data: schemas.EmployeeCreate, db: Session = Depends(get_db)):
    return crud.create_employee(db, data)

@router.put("/employees/{id}", response_model=schemas.EmployeeOut)
def edit_employee(id: int, data: schemas.EmployeeUpdate, db: Session = Depends(get_db)):
    emp = crud.update_employee(db, id, data)
    if not emp: raise HTTPException(status_code=404, detail="Employee not found")
    return emp

@router.delete("/employees/{id}")
def remove_employee(id: int, db: Session = Depends(get_db)):
    if not crud.delete_employee(db, id):
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"ok": True}

# ── Positions ─────────────────────────────────────────
@router.get("/positions", response_model=List[schemas.PositionOut])
def list_positions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_positions(db, skip, limit)

@router.post("/positions", response_model=schemas.PositionOut)
def add_position(data: schemas.PositionCreate, db: Session = Depends(get_db)):
    return crud.create_position(db, data)

@router.put("/positions/{id}", response_model=schemas.PositionOut)
def edit_position(id: int, data: schemas.PositionUpdate, db: Session = Depends(get_db)):
    pos = crud.update_position(db, id, data)
    if not pos: raise HTTPException(status_code=404, detail="Position not found")
    return pos

@router.delete("/positions/{id}")
def remove_position(id: int, db: Session = Depends(get_db)):
    if not crud.delete_position(db, id):
        raise HTTPException(status_code=404, detail="Position not found")
    return {"ok": True}

# ── Departments ───────────────────────────────────────
@router.get("/departments", response_model=List[schemas.DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    return crud.get_departments(db)

@router.post("/departments", response_model=schemas.DepartmentOut)
def add_department(data: schemas.DepartmentCreate, db: Session = Depends(get_db)):
    return crud.create_department(db, data)