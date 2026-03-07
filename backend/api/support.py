from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas


router = APIRouter(prefix="/support", tags=["Support"])


@router.get("/summary")
def support_summary(db: Session = Depends(get_db)):
    return crud.get_support_summary(db)


@router.get("/tickets", response_model=List[schemas.SupportTicketOut])
def list_tickets(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_support_tickets(db, skip=skip, limit=limit)


@router.post("/tickets", response_model=schemas.SupportTicketOut)
def add_ticket(data: schemas.SupportTicketCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_support_ticket(db, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/tickets/{id}", response_model=schemas.SupportTicketOut)
def edit_ticket(id: int, data: schemas.SupportTicketUpdate, db: Session = Depends(get_db)):
    try:
        row = crud.update_support_ticket(db, id, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    if not row:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return row


@router.delete("/tickets/{id}")
def remove_ticket(id: int, db: Session = Depends(get_db)):
    if not crud.delete_support_ticket(db, id):
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"ok": True}
