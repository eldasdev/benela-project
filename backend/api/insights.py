from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas


router = APIRouter(prefix="/insights", tags=["Insights"])


@router.get("/summary")
def insights_summary(db: Session = Depends(get_db)):
    return crud.get_insights_summary(db)


@router.get("/reports", response_model=List[schemas.InsightReportOut])
def list_reports(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_insight_reports(db, skip=skip, limit=limit)


@router.post("/reports", response_model=schemas.InsightReportOut)
def add_report(data: schemas.InsightReportCreate, db: Session = Depends(get_db)):
    return crud.create_insight_report(db, data)


@router.put("/reports/{id}", response_model=schemas.InsightReportOut)
def edit_report(id: int, data: schemas.InsightReportUpdate, db: Session = Depends(get_db)):
    row = crud.update_insight_report(db, id, data)
    if not row:
        raise HTTPException(status_code=404, detail="Insight report not found")
    return row


@router.post("/reports/{id}/run", response_model=schemas.InsightReportOut)
def execute_report(id: int, db: Session = Depends(get_db)):
    row = crud.run_insight_report(db, id)
    if not row:
        raise HTTPException(status_code=404, detail="Insight report not found")
    return row


@router.delete("/reports/{id}")
def remove_report(id: int, db: Session = Depends(get_db)):
    if not crud.delete_insight_report(db, id):
        raise HTTPException(status_code=404, detail="Insight report not found")
    return {"ok": True}
