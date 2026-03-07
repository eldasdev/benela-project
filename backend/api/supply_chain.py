from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas


router = APIRouter(prefix="/supply-chain", tags=["Supply Chain"])


@router.get("/summary")
def supply_chain_summary(db: Session = Depends(get_db)):
    return crud.get_supply_chain_summary(db)


@router.get("/items", response_model=List[schemas.SupplyChainItemOut])
def list_items(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_supply_chain_items(db, skip=skip, limit=limit)


@router.post("/items", response_model=schemas.SupplyChainItemOut)
def add_item(data: schemas.SupplyChainItemCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_supply_chain_item(db, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/items/{id}", response_model=schemas.SupplyChainItemOut)
def edit_item(id: int, data: schemas.SupplyChainItemUpdate, db: Session = Depends(get_db)):
    try:
        row = crud.update_supply_chain_item(db, id, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return row


@router.delete("/items/{id}")
def remove_item(id: int, db: Session = Depends(get_db)):
    if not crud.delete_supply_chain_item(db, id):
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@router.get("/shipments", response_model=List[schemas.SupplyChainShipmentOut])
def list_shipments(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_supply_chain_shipments(db, skip=skip, limit=limit)


@router.post("/shipments", response_model=schemas.SupplyChainShipmentOut)
def add_shipment(data: schemas.SupplyChainShipmentCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_supply_chain_shipment(db, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/shipments/{id}", response_model=schemas.SupplyChainShipmentOut)
def edit_shipment(id: int, data: schemas.SupplyChainShipmentUpdate, db: Session = Depends(get_db)):
    try:
        row = crud.update_supply_chain_shipment(db, id, data)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    if not row:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return row


@router.delete("/shipments/{id}")
def remove_shipment(id: int, db: Session = Depends(get_db)):
    if not crud.delete_supply_chain_shipment(db, id):
        raise HTTPException(status_code=404, detail="Shipment not found")
    return {"ok": True}
