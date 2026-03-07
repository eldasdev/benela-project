from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas


router = APIRouter(prefix="/sales", tags=["Sales"])


@router.get("/summary")
def sales_summary(db: Session = Depends(get_db)):
    return crud.get_sales_summary(db)


@router.get("/reports")
def sales_reports(db: Session = Depends(get_db)):
    return crud.get_sales_reports(db)


@router.get("/products", response_model=List[schemas.SalesProductOut])
def list_products(
    skip: int = 0,
    limit: int = 200,
    include_archived: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    return crud.get_sales_products(db, skip=skip, limit=limit, include_archived=include_archived)


@router.post("/products", response_model=schemas.SalesProductOut)
def add_product(data: schemas.SalesProductCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_sales_product(db, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/products/{id}", response_model=schemas.SalesProductOut)
def edit_product(id: int, data: schemas.SalesProductUpdate, db: Session = Depends(get_db)):
    try:
        row = crud.update_sales_product(db, id, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    return row


@router.delete("/products/{id}")
def remove_product(id: int, db: Session = Depends(get_db)):
    if not crud.delete_sales_product(db, id):
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True}


@router.get("/orders", response_model=List[schemas.SalesOrderOut])
def list_orders(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_sales_orders(db, skip=skip, limit=limit)


@router.post("/orders", response_model=schemas.SalesOrderOut)
def add_order(data: schemas.SalesOrderCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_sales_order(db, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/orders/{id}", response_model=schemas.SalesOrderOut)
def edit_order(id: int, data: schemas.SalesOrderUpdate, db: Session = Depends(get_db)):
    try:
        row = crud.update_sales_order(db, id, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    return row


@router.delete("/orders/{id}")
def remove_order(id: int, db: Session = Depends(get_db)):
    if not crud.delete_sales_order(db, id):
        raise HTTPException(status_code=404, detail="Order not found")
    return {"ok": True}


@router.get("/inventory/adjustments", response_model=List[schemas.SalesInventoryAdjustmentOut])
def list_inventory_adjustments(skip: int = 0, limit: int = 300, db: Session = Depends(get_db)):
    return crud.get_sales_inventory_adjustments(db, skip=skip, limit=limit)


@router.post("/inventory/adjustments", response_model=schemas.SalesInventoryAdjustmentOut)
def add_inventory_adjustment(data: schemas.SalesInventoryAdjustmentCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_sales_inventory_adjustment(db, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
