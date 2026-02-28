from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.connection import get_db
from database import crud, schemas
from typing import List

router = APIRouter(prefix="/finance", tags=["finance"])

@router.get("/transactions", response_model=List[schemas.TransactionOut])
def list_transactions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_transactions(db, skip=skip, limit=limit)

@router.post("/transactions", response_model=schemas.TransactionOut)
def add_transaction(data: schemas.TransactionCreate, db: Session = Depends(get_db)):
    return crud.create_transaction(db, data)

@router.get("/summary")
def finance_summary(db: Session = Depends(get_db)):
    return crud.get_finance_summary(db)

@router.get("/invoices", response_model=List[schemas.InvoiceOut])
def list_invoices(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_invoices(db, skip=skip, limit=limit)

@router.post("/invoices", response_model=schemas.InvoiceOut)
def add_invoice(data: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    return crud.create_invoice(db, data)