from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from core.auth import get_request_user
from database.connection import get_db
from database import crud
from database.models import ClientWorkspaceAccount


router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _assert_workspace_access(request: Request, db: Session, workspace_id: str) -> ClientWorkspaceAccount:
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


@router.get("/overview")
def dashboard_overview(
    request: Request,
    workspace_id: str = Query(default="default-workspace"),
    db: Session = Depends(get_db),
):
    _assert_workspace_access(request, db, workspace_id)
    return crud.get_dashboard_overview(db, workspace_id=workspace_id)


@router.get("/command-center")
def dashboard_command_center(
    request: Request,
    workspace_id: str = Query(default="default-workspace"),
    db: Session = Depends(get_db),
):
    _assert_workspace_access(request, db, workspace_id)
    return crud.get_dashboard_command_center(db, workspace_id=workspace_id)
