from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database.connection import get_db
from database import crud, schemas
from typing import List
from integrations.onec.service import resolve_company_account

router = APIRouter(prefix="/finance", tags=["Finance"])

# ── Summary ───────────────────────────────────────────
@router.get("/summary")
def finance_summary(request: Request, db: Session = Depends(get_db)):
    account = resolve_company_account(request, db)
    return crud.get_finance_summary(db, company_id=account.client_org_id)

# ── Transactions ──────────────────────────────────────
@router.get("/transactions", response_model=List[schemas.TransactionOut])
def list_transactions(request: Request, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    account = resolve_company_account(request, db)
    return crud.get_transactions(db, skip, limit, company_id=account.client_org_id)

@router.post("/transactions", response_model=schemas.TransactionOut)
def add_transaction(request: Request, data: schemas.TransactionCreate, db: Session = Depends(get_db)):
    account = resolve_company_account(request, db)
    return crud.create_transaction(db, data, company_id=account.client_org_id)

@router.put("/transactions/{id}", response_model=schemas.TransactionOut)
def edit_transaction(id: int, request: Request, data: schemas.TransactionUpdate, db: Session = Depends(get_db)):
    account = resolve_company_account(request, db)
    tx = crud.update_transaction(db, id, data, company_id=account.client_org_id)
    if not tx: raise HTTPException(status_code=404, detail="Transaction not found")
    return tx

@router.delete("/transactions/{id}")
def remove_transaction(id: int, request: Request, db: Session = Depends(get_db)):
    account = resolve_company_account(request, db)
    if not crud.delete_transaction(db, id, company_id=account.client_org_id):
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"ok": True}

# ── Invoices ──────────────────────────────────────────
@router.get("/invoices", response_model=List[schemas.InvoiceOut])
def list_invoices(request: Request, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    account = resolve_company_account(request, db)
    return crud.get_invoices(db, skip, limit, company_id=account.client_org_id)

@router.post("/invoices", response_model=schemas.InvoiceOut)
def add_invoice(request: Request, data: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    account = resolve_company_account(request, db)
    return crud.create_invoice(db, data, company_id=account.client_org_id)

@router.put("/invoices/{id}", response_model=schemas.InvoiceOut)
def edit_invoice(id: int, request: Request, data: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    account = resolve_company_account(request, db)
    inv = crud.update_invoice(db, id, data, company_id=account.client_org_id)
    if not inv: raise HTTPException(status_code=404, detail="Invoice not found")
    return inv

@router.delete("/invoices/{id}")
def remove_invoice(id: int, request: Request, db: Session = Depends(get_db)):
    account = resolve_company_account(request, db)
    if not crud.delete_invoice(db, id, company_id=account.client_org_id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"ok": True}
