from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas


router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get("/summary")
def projects_summary(db: Session = Depends(get_db)):
    return crud.get_project_summary(db)


@router.get("/", response_model=List[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return crud.get_projects(db)


@router.post("/", response_model=schemas.ProjectOut)
def create_project(data: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return crud.create_project(db, data)


@router.put("/{id}", response_model=schemas.ProjectOut)
def update_project(id: int, data: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    project = crud.update_project(db, id, data)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{id}")
def delete_project(id: int, db: Session = Depends(get_db)):
    if not crud.delete_project(db, id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


@router.get("/{project_id}/columns", response_model=List[schemas.ColumnOut])
def list_columns(project_id: int, db: Session = Depends(get_db)):
    return crud.get_columns(db, project_id)


@router.post("/{project_id}/columns", response_model=schemas.ColumnOut)
def create_column(
    project_id: int, data: schemas.ColumnCreate, db: Session = Depends(get_db)
):
    # Ensure path and body agree
    payload = data.model_copy(update={"project_id": project_id})
    return crud.create_column(db, payload)


@router.put("/columns/{id}", response_model=schemas.ColumnOut)
def update_column(id: int, data: schemas.ColumnUpdate, db: Session = Depends(get_db)):
    column = crud.update_column(db, id, data)
    if not column:
        raise HTTPException(status_code=404, detail="Column not found")
    return column


@router.delete("/columns/{id}")
def delete_column(id: int, db: Session = Depends(get_db)):
    if not crud.delete_column(db, id):
        raise HTTPException(status_code=404, detail="Column not found")
    return {"ok": True}


@router.get("/{project_id}/tasks", response_model=List[schemas.TaskOut])
def list_tasks(project_id: int, db: Session = Depends(get_db)):
    return crud.get_tasks(db, project_id)


@router.post("/{project_id}/tasks", response_model=schemas.TaskOut)
def create_task(
    project_id: int, data: schemas.TaskCreate, db: Session = Depends(get_db)
):
    payload = data.model_copy(update={"project_id": project_id})
    return crud.create_task(db, payload)


@router.put("/tasks/{id}", response_model=schemas.TaskOut)
def update_task(id: int, data: schemas.TaskUpdate, db: Session = Depends(get_db)):
    task = crud.update_task(db, id, data)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/tasks/{id}")
def delete_task(id: int, db: Session = Depends(get_db)):
    if not crud.delete_task(db, id):
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True}


class MoveTaskBody(BaseModel):
    column_id: int
    position: int


@router.patch("/tasks/{id}/move", response_model=schemas.TaskOut)
def move_task(id: int, body: MoveTaskBody, db: Session = Depends(get_db)):
    task = crud.move_task(db, id, body.column_id, body.position)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

