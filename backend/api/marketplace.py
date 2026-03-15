from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from core.auth import get_request_user, require_admin_user, require_client_user
from database.connection import get_db
from database import crud, schemas
from database.models import ClientWorkspaceAccount
from database.models import PluginCategory


router = APIRouter(prefix="/marketplace", tags=["Marketplace"])


def _assert_client_workspace_access(request: Request, db: Session, workspace_id: str) -> ClientWorkspaceAccount:
    user = get_request_user(request)
    account = (
        db.query(ClientWorkspaceAccount)
        .filter(ClientWorkspaceAccount.user_id == user.user_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Client workspace account not found.")
    if account.workspace_id != (workspace_id or "").strip():
        raise HTTPException(status_code=403, detail="Workspace access denied.")
    return account


@router.get("/summary")
def marketplace_summary(
    request: Request,
    workspace_id: str = Query(default="default-workspace"),
    db: Session = Depends(get_db),
):
    require_client_user(request)
    _assert_client_workspace_access(request, db, workspace_id)
    return crud.get_marketplace_summary(db, workspace_id)


@router.get("/admin/summary")
def marketplace_admin_summary(request: Request, db: Session = Depends(get_db)):
    require_admin_user(request)
    return crud.get_marketplace_admin_summary(db)


@router.get("/plugins", response_model=List[schemas.MarketplacePluginOut])
def list_plugins(
    request: Request,
    category: Optional[PluginCategory] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    require_client_user(request)
    return crud.get_marketplace_plugins(db, category=category, q=q)


@router.get("/admin/plugins", response_model=List[schemas.MarketplacePluginOut])
def list_plugins_admin(
    request: Request,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    require_admin_user(request)
    return crud.get_marketplace_plugins_admin(db, q=q)


@router.post("/plugins", response_model=schemas.MarketplacePluginOut)
def create_plugin(request: Request, data: schemas.MarketplacePluginCreate, db: Session = Depends(get_db)):
    require_admin_user(request)
    return crud.create_marketplace_plugin(db, data)


@router.put("/plugins/{plugin_id}", response_model=schemas.MarketplacePluginOut)
def update_plugin(
    plugin_id: int,
    request: Request,
    data: schemas.MarketplacePluginUpdate,
    db: Session = Depends(get_db),
):
    require_admin_user(request)
    plugin = crud.update_marketplace_plugin(db, plugin_id, data)
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")
    return plugin


@router.get("/purchases", response_model=List[schemas.PluginPurchaseOut])
def list_purchases(
    request: Request,
    workspace_id: str = Query(default="default-workspace"),
    db: Session = Depends(get_db),
):
    require_client_user(request)
    _assert_client_workspace_access(request, db, workspace_id)
    return crud.get_workspace_purchases(db, workspace_id)


@router.get("/admin/purchases", response_model=List[schemas.PluginPurchaseOut])
def list_purchases_admin(
    request: Request,
    workspace_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    require_admin_user(request)
    return crud.get_marketplace_purchases_admin(db, workspace_id=workspace_id)


@router.post("/purchase", response_model=schemas.PluginPurchaseOut)
def purchase_plugin(request: Request, data: schemas.PluginPurchaseCreate, db: Session = Depends(get_db)):
    require_client_user(request)
    _assert_client_workspace_access(request, db, data.workspace_id)
    purchase = crud.purchase_plugin(db, data)
    if not purchase:
        raise HTTPException(status_code=404, detail="Plugin not found")
    return purchase


@router.get("/installs", response_model=List[schemas.PluginInstallOut])
def list_installs(
    request: Request,
    workspace_id: str = Query(default="default-workspace"),
    db: Session = Depends(get_db),
):
    require_client_user(request)
    _assert_client_workspace_access(request, db, workspace_id)
    return crud.get_workspace_installs(db, workspace_id)


@router.get("/admin/installs", response_model=List[schemas.PluginInstallOut])
def list_installs_admin(
    request: Request,
    workspace_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    require_admin_user(request)
    return crud.get_marketplace_installs_admin(db, workspace_id=workspace_id)


@router.patch("/plugins/{plugin_id}/enable", response_model=schemas.PluginInstallOut)
def toggle_plugin(
    plugin_id: int,
    request: Request,
    data: schemas.PluginInstallToggle,
    db: Session = Depends(get_db),
):
    require_client_user(request)
    _assert_client_workspace_access(request, db, data.workspace_id)
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
