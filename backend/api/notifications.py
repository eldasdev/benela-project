from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from database import admin_crud, schemas

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=List[schemas.ClientNotificationOut])
def list_client_notifications(
    workspace_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return admin_crud.get_client_notifications(db, workspace_id=workspace_id, limit=limit)
