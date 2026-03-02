from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas
from database.models import PluginCategory


router = APIRouter(prefix="/marketplace", tags=["Marketplace"])


@router.get("/summary")
def marketplace_summary(
    workspace_id: str = Query(default="default-workspace"),
    db: Session = Depends(get_db),
):
    return crud.get_marketplace_summary(db, workspace_id)


@router.get("/admin/summary")
def marketplace_admin_summary(db: Session = Depends(get_db)):
    return crud.get_marketplace_admin_summary(db)


@router.get("/plugins", response_model=List[schemas.MarketplacePluginOut])
def list_plugins(
    category: Optional[PluginCategory] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return crud.get_marketplace_plugins(db, category=category, q=q)


@router.get("/admin/plugins", response_model=List[schemas.MarketplacePluginOut])
def list_plugins_admin(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return crud.get_marketplace_plugins_admin(db, q=q)


@router.post("/plugins", response_model=schemas.MarketplacePluginOut)
def create_plugin(data: schemas.MarketplacePluginCreate, db: Session = Depends(get_db)):
    return crud.create_marketplace_plugin(db, data)


@router.put("/plugins/{plugin_id}", response_model=schemas.MarketplacePluginOut)
def update_plugin(plugin_id: int, data: schemas.MarketplacePluginUpdate, db: Session = Depends(get_db)):
    plugin = crud.update_marketplace_plugin(db, plugin_id, data)
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")
    return plugin


@router.get("/purchases", response_model=List[schemas.PluginPurchaseOut])
def list_purchases(
    workspace_id: str = Query(default="default-workspace"),
    db: Session = Depends(get_db),
):
    return crud.get_workspace_purchases(db, workspace_id)


@router.get("/admin/purchases", response_model=List[schemas.PluginPurchaseOut])
def list_purchases_admin(
    workspace_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return crud.get_marketplace_purchases_admin(db, workspace_id=workspace_id)


@router.post("/purchase", response_model=schemas.PluginPurchaseOut)
def purchase_plugin(data: schemas.PluginPurchaseCreate, db: Session = Depends(get_db)):
    purchase = crud.purchase_plugin(db, data)
    if not purchase:
        raise HTTPException(status_code=404, detail="Plugin not found")
    return purchase


@router.get("/installs", response_model=List[schemas.PluginInstallOut])
def list_installs(
    workspace_id: str = Query(default="default-workspace"),
    db: Session = Depends(get_db),
):
    return crud.get_workspace_installs(db, workspace_id)


@router.get("/admin/installs", response_model=List[schemas.PluginInstallOut])
def list_installs_admin(
    workspace_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return crud.get_marketplace_installs_admin(db, workspace_id=workspace_id)


@router.patch("/plugins/{plugin_id}/enable", response_model=schemas.PluginInstallOut)
def toggle_plugin(
    plugin_id: int,
    data: schemas.PluginInstallToggle,
    db: Session = Depends(get_db),
):
    install = crud.set_plugin_enabled(
        db=db,
        workspace_id=data.workspace_id,
        plugin_id=plugin_id,
        is_enabled=data.is_enabled,
    )
    if not install:
        raise HTTPException(
            status_code=404,
            detail="Plugin is not installed for this workspace",
        )
    return install
