from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas


router = APIRouter(prefix="/procurement", tags=["Procurement"])


@router.get("/summary")
def procurement_summary(db: Session = Depends(get_db)):
    return crud.get_procurement_summary(db)


@router.get("/requests", response_model=List[schemas.ProcurementRequestOut])
def list_requests(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_procurement_requests(db, skip=skip, limit=limit)


@router.post("/requests", response_model=schemas.ProcurementRequestOut)
def add_request(data: schemas.ProcurementRequestCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_procurement_request(db, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/requests/{id}", response_model=schemas.ProcurementRequestOut)
def edit_request(id: int, data: schemas.ProcurementRequestUpdate, db: Session = Depends(get_db)):
    try:
        row = crud.update_procurement_request(db, id, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    if not row:
        raise HTTPException(status_code=404, detail="Procurement request not found")
    return row


@router.delete("/requests/{id}")
def remove_request(id: int, db: Session = Depends(get_db)):
    if not crud.delete_procurement_request(db, id):
        raise HTTPException(status_code=404, detail="Procurement request not found")
    return {"ok": True}
