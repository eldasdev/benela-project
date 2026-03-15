from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from core.auth import get_request_user
from database.connection import get_db
from database import admin_crud, schemas
from database.models import ClientWorkspaceAccount

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _assert_workspace_access(request: Request, db: Session, workspace_id: str | None) -> ClientWorkspaceAccount:
    user = get_request_user(request)
    account = (
        db.query(ClientWorkspaceAccount)
        .filter(ClientWorkspaceAccount.user_id == user.user_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Client workspace account not found.")
    if workspace_id and account.workspace_id != workspace_id.strip():
        raise HTTPException(status_code=403, detail="Workspace access denied.")
    return account


@router.get("", response_model=List[schemas.ClientNotificationOut])
def list_client_notifications(
    request: Request,
    workspace_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    account = _assert_workspace_access(request, db, workspace_id)
    return admin_crud.get_client_notifications(db, workspace_id=account.workspace_id, limit=limit)
