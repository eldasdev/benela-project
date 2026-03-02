from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud


router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/overview")
def dashboard_overview(
    workspace_id: str = Query(default="default-workspace"),
    db: Session = Depends(get_db),
):
    return crud.get_dashboard_overview(db, workspace_id=workspace_id)
