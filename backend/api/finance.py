from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.connection import get_db
from database import crud, schemas
from typing import List

router = APIRouter(prefix="/finance", tags=["Finance"])

# ── Summary ───────────────────────────────────────────
@router.get("/summary")
def finance_summary(db: Session = Depends(get_db)):
    return crud.get_finance_summary(db)

# ── Transactions ──────────────────────────────────────
@router.get("/transactions", response_model=List[schemas.TransactionOut])
def list_transactions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_transactions(db, skip, limit)

@router.post("/transactions", response_model=schemas.TransactionOut)
def add_transaction(data: schemas.TransactionCreate, db: Session = Depends(get_db)):
    return crud.create_transaction(db, data)

@router.put("/transactions/{id}", response_model=schemas.TransactionOut)
def edit_transaction(id: int, data: schemas.TransactionUpdate, db: Session = Depends(get_db)):
    tx = crud.update_transaction(db, id, data)
    if not tx: raise HTTPException(status_code=404, detail="Transaction not found")
    return tx

@router.delete("/transactions/{id}")
def remove_transaction(id: int, db: Session = Depends(get_db)):
    if not crud.delete_transaction(db, id):
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"ok": True}

# ── Invoices ──────────────────────────────────────────
@router.get("/invoices", response_model=List[schemas.InvoiceOut])
def list_invoices(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_invoices(db, skip, limit)

@router.post("/invoices", response_model=schemas.InvoiceOut)
def add_invoice(data: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    return crud.create_invoice(db, data)

@router.put("/invoices/{id}", response_model=schemas.InvoiceOut)
def edit_invoice(id: int, data: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    inv = crud.update_invoice(db, id, data)
    if not inv: raise HTTPException(status_code=404, detail="Invoice not found")
    return inv

@router.delete("/invoices/{id}")
def remove_invoice(id: int, db: Session = Depends(get_db)):
    if not crud.delete_invoice(db, id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"ok": True}