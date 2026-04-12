"""Projects / Kanban API — Trello-class workspace-scoped endpoints.

All handlers resolve the caller's ``client_org_id`` via
``core.project_access.resolve_project_context`` and filter every query by it
so users in different workspaces cannot see or touch each other's projects.

RBAC:
- **Every org member** can view / edit / comment / upload.
- **Only the project owner** (or workspace owner) can delete the project or
  remove someone else's comment/attachment.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.auth import resolve_request_user
from core.project_access import (
    require_project_member,
    require_project_owner,
    resolve_project_context,
)
from core.supabase_storage import (
    build_storage_path,
    create_download_signed_url,
    create_upload_signed_url,
    delete_object,
)
from database import projects_crud
from database import schemas
from database.connection import get_db
from database.models import (
    KanbanColumn,
    KanbanTask,
    Project,
    ProjectActivity,
    ProjectLabel,
    ProjectStatus,
    TaskAttachment,
    TaskChecklistItem,
    TaskComment,
)

router = APIRouter(prefix="/projects", tags=["Projects"])


# ── Helpers ───────────────────────────────────────────


def _actor_name(user) -> Optional[str]:
    meta = (user.claims or {}).get("user_metadata") or {}
    return (
        meta.get("full_name")
        or meta.get("name")
        or user.email
        or None
    )


def _project_out(
    db: Session, project: Project, *, is_owner: bool
) -> schemas.ProjectOut:
    counts = projects_crud.project_counts(db, project.id)
    return schemas.ProjectOut(
        id=project.id,
        client_org_id=project.client_org_id,
        owner_user_id=project.owner_user_id,
        name=project.name,
        description=project.description,
        status=project.status,
        color=project.color,
        due_date=project.due_date,
        created_at=project.created_at,
        updated_at=project.updated_at,
        task_count=counts["task_count"],
        done_count=counts["done_count"],
        is_owner=is_owner,
    )


def _task_out(
    task: KanbanTask,
    *,
    labels: list,
    assignee: Optional[schemas.EmployeeMini],
    checklist_total: int,
    checklist_done: int,
    comment_count: int,
    attachment_count: int,
) -> schemas.TaskOut:
    return schemas.TaskOut(
        id=task.id,
        column_id=task.column_id,
        project_id=task.project_id,
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=task.due_date,
        start_date=task.start_date,
        completed_at=task.completed_at,
        cover_color=task.cover_color,
        employee_id=task.employee_id,
        position=task.position,
        created_at=task.created_at,
        updated_at=task.updated_at,
        labels=[schemas.LabelOut.model_validate(l) for l in labels],
        assignee=assignee,
        checklist_total=checklist_total,
        checklist_done=checklist_done,
        comment_count=comment_count,
        attachment_count=attachment_count,
    )


def _employee_mini(db: Session, employee_id: Optional[int]) -> Optional[schemas.EmployeeMini]:
    if not employee_id:
        return None
    from database.models import Employee

    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        return None
    return schemas.EmployeeMini(
        id=emp.id,
        full_name=emp.full_name,
        email=emp.email,
        role=emp.role,
        department=emp.department,
    )


def _enrich_tasks(db: Session, tasks: list[KanbanTask]) -> list[schemas.TaskOut]:
    from database.models import Employee

    task_ids = [t.id for t in tasks]
    labels_map = projects_crud.labels_map_for_tasks(db, task_ids)
    checklist_map = projects_crud.checklist_counts_for_tasks(db, task_ids)
    comments_map = projects_crud.comment_counts_for_tasks(db, task_ids)
    attachments_map = projects_crud.attachment_counts_for_tasks(db, task_ids)

    # Batch-fetch employees
    emp_ids = {t.employee_id for t in tasks if t.employee_id}
    emp_rows = (
        db.query(Employee).filter(Employee.id.in_(emp_ids)).all() if emp_ids else []
    )
    emp_map = {
        e.id: schemas.EmployeeMini(
            id=e.id,
            full_name=e.full_name,
            email=e.email,
            role=e.role,
            department=e.department,
        )
        for e in emp_rows
    }

    out: list[schemas.TaskOut] = []
    for t in tasks:
        total, done = checklist_map.get(t.id, (0, 0))
        out.append(
            _task_out(
                t,
                labels=labels_map.get(t.id, []),
                assignee=emp_map.get(t.employee_id) if t.employee_id else None,
                checklist_total=total,
                checklist_done=done,
                comment_count=comments_map.get(t.id, 0),
                attachment_count=attachments_map.get(t.id, 0),
            )
        )
    return out


def _ensure_comment_author_or_owner(
    comment: TaskComment, user, is_ws_owner: bool
) -> None:
    if is_ws_owner:
        return
    if comment.author_user_id != user.user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the author or a workspace owner can modify this comment.",
        )


def _ensure_uploader_or_owner(
    att: TaskAttachment, user, is_ws_owner: bool
) -> None:
    if is_ws_owner:
        return
    if att.uploaded_by_user_id != user.user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the uploader or a workspace owner can remove this file.",
        )


# ── Projects ──────────────────────────────────────────


@router.get("/summary", response_model=schemas.ProjectsSummaryOut)
def projects_summary(request: Request, db: Session = Depends(get_db)):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)

    total = (
        db.query(Project).filter(Project.client_org_id == client_org_id).count()
    )
    active = (
        db.query(Project)
        .filter(
            Project.client_org_id == client_org_id,
            Project.status == ProjectStatus.active,
        )
        .count()
    )
    task_q = db.query(KanbanTask).join(Project).filter(
        Project.client_org_id == client_org_id
    )
    total_tasks = task_q.count()
    done_tasks = task_q.filter(KanbanTask.completed_at.isnot(None)).count()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    overdue = task_q.filter(
        KanbanTask.due_date.isnot(None),
        KanbanTask.due_date < now,
        KanbanTask.completed_at.is_(None),
    ).count()

    return schemas.ProjectsSummaryOut(
        total_projects=total,
        active_projects=active,
        total_tasks=total_tasks,
        done_tasks=done_tasks,
        overdue_tasks=overdue,
    )


@router.get("", response_model=List[schemas.ProjectOut])
def list_projects(request: Request, db: Session = Depends(get_db)):
    user = resolve_request_user(request)
    client_org_id, is_ws_owner = resolve_project_context(db, user.user_id)
    projects = projects_crud.list_projects(db, client_org_id)
    out: list[schemas.ProjectOut] = []
    for p in projects:
        is_owner = is_ws_owner or p.owner_user_id == user.user_id
        out.append(_project_out(db, p, is_owner=is_owner))
    return out


@router.post("", response_model=schemas.ProjectOut)
def create_project(
    data: schemas.ProjectCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    project = projects_crud.create_project(
        db,
        client_org_id=client_org_id,
        owner_user_id=user.user_id,
        owner_name=_actor_name(user),
        name=data.name,
        description=data.description,
        color=data.color,
        due_date=data.due_date,
        status=data.status,
    )
    return _project_out(db, project, is_owner=True)


@router.get("/members", response_model=List[schemas.EmployeeMini])
def list_members(request: Request, db: Session = Depends(get_db)):
    """Feed for the assignee picker — HR employees in the caller's workspace."""
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    employees = projects_crud.list_org_employees(db, client_org_id)
    return [
        schemas.EmployeeMini(
            id=e.id,
            full_name=e.full_name,
            email=e.email,
            role=e.role,
            department=e.department,
        )
        for e in employees
    ]


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(
    project_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    project, _, is_ws_owner = require_project_member(db, project_id, user.user_id)
    is_owner = is_ws_owner or project.owner_user_id == user.user_id
    return _project_out(db, project, is_owner=is_owner)


@router.put("/{project_id}", response_model=schemas.ProjectOut)
def update_project(
    project_id: int,
    data: schemas.ProjectUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    project, _, is_ws_owner = require_project_member(db, project_id, user.user_id)
    project = projects_crud.update_project(
        db,
        project,
        data.model_dump(exclude_unset=True),
        actor_user_id=user.user_id,
        actor_name=_actor_name(user),
    )
    is_owner = is_ws_owner or project.owner_user_id == user.user_id
    return _project_out(db, project, is_owner=is_owner)


@router.delete("/{project_id}")
def delete_project(
    project_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    project, _ = require_project_owner(db, project_id, user.user_id)
    projects_crud.delete_project(db, project)
    return {"ok": True}


# ── Columns ───────────────────────────────────────────


@router.get("/{project_id}/columns", response_model=List[schemas.ColumnOut])
def list_columns(
    project_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    require_project_member(db, project_id, user.user_id)
    return projects_crud.list_columns(db, project_id)


@router.post("/{project_id}/columns", response_model=schemas.ColumnOut)
def create_column(
    project_id: int,
    data: schemas.ColumnCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    require_project_member(db, project_id, user.user_id)
    return projects_crud.create_column(
        db,
        project_id=project_id,
        name=data.name,
        color=data.color,
        actor_user_id=user.user_id,
        actor_name=_actor_name(user),
    )


@router.put("/columns/{column_id}", response_model=schemas.ColumnOut)
def update_column(
    column_id: int,
    data: schemas.ColumnUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    col = projects_crud.get_column(db, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found.")
    require_project_member(db, col.project_id, user.user_id)
    return projects_crud.update_column(
        db,
        col,
        data.model_dump(exclude_unset=True),
        actor_user_id=user.user_id,
        actor_name=_actor_name(user),
    )


@router.delete("/columns/{column_id}")
def delete_column(
    column_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    col = projects_crud.get_column(db, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found.")
    require_project_member(db, col.project_id, user.user_id)
    projects_crud.delete_column(
        db, col, actor_user_id=user.user_id, actor_name=_actor_name(user)
    )
    return {"ok": True}


@router.patch("/{project_id}/columns/reorder")
def reorder_columns(
    project_id: int,
    body: schemas.ReorderIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    require_project_member(db, project_id, user.user_id)
    projects_crud.reorder_columns(db, project_id, body.ordered_ids)
    return {"ok": True}


# ── Tasks ─────────────────────────────────────────────


@router.get("/{project_id}/tasks", response_model=List[schemas.TaskOut])
def list_tasks(
    project_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    require_project_member(db, project_id, user.user_id)
    tasks = projects_crud.list_tasks(db, project_id)
    return _enrich_tasks(db, tasks)


@router.post("/{project_id}/tasks", response_model=schemas.TaskOut)
def create_task(
    project_id: int,
    data: schemas.TaskCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    require_project_member(db, project_id, user.user_id)
    col = projects_crud.get_column(db, data.column_id)
    if not col or col.project_id != project_id:
        raise HTTPException(status_code=400, detail="Column does not belong to this project.")
    task = projects_crud.create_task(
        db,
        project_id=project_id,
        column_id=data.column_id,
        title=data.title,
        description=data.description,
        priority=data.priority,
        due_date=data.due_date,
        start_date=data.start_date,
        employee_id=data.employee_id,
        cover_color=data.cover_color,
        actor_user_id=user.user_id,
        actor_name=_actor_name(user),
    )
    return _enrich_tasks(db, [task])[0]


@router.get("/tasks/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, request: Request, db: Session = Depends(get_db)):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return _enrich_tasks(db, [task])[0]


@router.patch("/tasks/{task_id}", response_model=schemas.TaskOut)
def update_task(
    task_id: int,
    data: schemas.TaskUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    task = projects_crud.update_task(
        db,
        task,
        data.model_dump(exclude_unset=True),
        actor_user_id=user.user_id,
        actor_name=_actor_name(user),
    )
    return _enrich_tasks(db, [task])[0]


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, request: Request, db: Session = Depends(get_db)):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    projects_crud.delete_task(
        db, task, actor_user_id=user.user_id, actor_name=_actor_name(user)
    )
    return {"ok": True}


@router.patch("/tasks/{task_id}/move", response_model=schemas.TaskOut)
def move_task(
    task_id: int,
    body: schemas.TaskMoveIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    col = projects_crud.get_column(db, body.column_id)
    if not col or col.project_id != task.project_id:
        raise HTTPException(
            status_code=400, detail="Destination column is not in this project."
        )
    task = projects_crud.move_task(
        db,
        task,
        new_column_id=body.column_id,
        new_position=body.position,
        actor_user_id=user.user_id,
        actor_name=_actor_name(user),
    )
    return _enrich_tasks(db, [task])[0]


@router.patch("/columns/{column_id}/tasks/reorder")
def reorder_tasks_in_column(
    column_id: int,
    body: schemas.ReorderIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    col = projects_crud.get_column(db, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found.")
    require_project_member(db, col.project_id, user.user_id)
    projects_crud.reorder_tasks_in_column(db, column_id, body.ordered_ids)
    return {"ok": True}


@router.patch("/tasks/{task_id}/complete", response_model=schemas.TaskOut)
def toggle_complete(
    task_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    task = projects_crud.toggle_task_complete(
        db, task, actor_user_id=user.user_id, actor_name=_actor_name(user)
    )
    return _enrich_tasks(db, [task])[0]


# ── Labels ────────────────────────────────────────────


@router.get("/{project_id}/labels", response_model=List[schemas.LabelOut])
def list_labels(
    project_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    require_project_member(db, project_id, user.user_id)
    return projects_crud.list_labels(db, project_id)


@router.post("/{project_id}/labels", response_model=schemas.LabelOut)
def create_label(
    project_id: int,
    data: schemas.LabelCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    require_project_member(db, project_id, user.user_id)
    return projects_crud.create_label(
        db, project_id=project_id, name=data.name, color=data.color
    )


@router.patch("/labels/{label_id}", response_model=schemas.LabelOut)
def update_label(
    label_id: int,
    data: schemas.LabelUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    label = projects_crud.get_label(db, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found.")
    require_project_member(db, label.project_id, user.user_id)
    return projects_crud.update_label(db, label, data.model_dump(exclude_unset=True))


@router.delete("/labels/{label_id}")
def delete_label(
    label_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    label = projects_crud.get_label(db, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found.")
    require_project_member(db, label.project_id, user.user_id)
    projects_crud.delete_label(db, label)
    return {"ok": True}


@router.post("/tasks/{task_id}/labels/{label_id}")
def attach_label_to_task(
    task_id: int,
    label_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    label = projects_crud.get_label(db, label_id)
    if not label or label.project_id != task.project_id:
        raise HTTPException(status_code=400, detail="Label is not in this project.")
    projects_crud.attach_label(db, task_id, label_id)
    return {"ok": True}


@router.delete("/tasks/{task_id}/labels/{label_id}")
def detach_label_from_task(
    task_id: int,
    label_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    projects_crud.detach_label(db, task_id, label_id)
    return {"ok": True}


# ── Checklist ─────────────────────────────────────────


@router.get("/tasks/{task_id}/checklist", response_model=List[schemas.ChecklistItemOut])
def list_checklist(
    task_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return projects_crud.list_checklist(db, task_id)


@router.post("/tasks/{task_id}/checklist", response_model=schemas.ChecklistItemOut)
def create_checklist_item(
    task_id: int,
    data: schemas.ChecklistItemCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return projects_crud.create_checklist_item(db, task_id=task_id, text=data.text)


@router.patch("/checklist/{item_id}", response_model=schemas.ChecklistItemOut)
def update_checklist_item(
    item_id: int,
    data: schemas.ChecklistItemUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    item = (
        db.query(TaskChecklistItem)
        .filter(TaskChecklistItem.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found.")
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, item.task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Checklist item not found.")
    return projects_crud.update_checklist_item(
        db, item, data.model_dump(exclude_unset=True)
    )


@router.delete("/checklist/{item_id}")
def delete_checklist_item(
    item_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    item = (
        db.query(TaskChecklistItem)
        .filter(TaskChecklistItem.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found.")
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, item.task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Checklist item not found.")
    projects_crud.delete_checklist_item(db, item)
    return {"ok": True}


# ── Comments ──────────────────────────────────────────


@router.get("/tasks/{task_id}/comments", response_model=List[schemas.CommentOut])
def list_comments(
    task_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return projects_crud.list_comments(db, task_id)


@router.post("/tasks/{task_id}/comments", response_model=schemas.CommentOut)
def create_comment(
    task_id: int,
    data: schemas.CommentCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return projects_crud.create_comment(
        db,
        task_id=task_id,
        project_id=task.project_id,
        author_user_id=user.user_id,
        author_name=_actor_name(user),
        body=data.body,
    )


@router.patch("/comments/{comment_id}", response_model=schemas.CommentOut)
def update_comment(
    comment_id: int,
    data: schemas.CommentUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    comment = projects_crud.get_comment(db, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found.")
    client_org_id, is_ws_owner = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, comment.task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Comment not found.")
    _ensure_comment_author_or_owner(comment, user, is_ws_owner)
    return projects_crud.update_comment(db, comment, data.body)


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    comment = projects_crud.get_comment(db, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found.")
    client_org_id, is_ws_owner = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, comment.task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Comment not found.")
    _ensure_comment_author_or_owner(comment, user, is_ws_owner)
    projects_crud.delete_comment(
        db,
        comment,
        project_id=task.project_id,
        actor_user_id=user.user_id,
        actor_name=_actor_name(user),
    )
    return {"ok": True}


# ── Attachments ───────────────────────────────────────


@router.get("/tasks/{task_id}/attachments", response_model=List[schemas.AttachmentOut])
def list_attachments(
    task_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return projects_crud.list_attachments(db, task_id)


@router.post(
    "/tasks/{task_id}/attachments/upload-url",
    response_model=schemas.AttachmentUploadUrlOut,
)
def request_upload_url(
    task_id: int,
    data: schemas.AttachmentUploadUrlIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    storage_path = build_storage_path(
        client_org_id=client_org_id,
        project_id=task.project_id,
        task_id=task.id,
        file_name=data.file_name,
    )
    signed = create_upload_signed_url(storage_path)
    return schemas.AttachmentUploadUrlOut(**signed)


@router.post("/tasks/{task_id}/attachments", response_model=schemas.AttachmentOut)
def register_attachment(
    task_id: int,
    data: schemas.AttachmentCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    # Basic safety: the storage_path must start with the caller's org prefix
    expected_prefix = f"{client_org_id}/{task.project_id}/{task.id}/"
    if not data.storage_path.startswith(expected_prefix):
        raise HTTPException(
            status_code=400, detail="Storage path does not belong to this task."
        )

    return projects_crud.create_attachment(
        db,
        task_id=task_id,
        project_id=task.project_id,
        uploaded_by_user_id=user.user_id,
        uploaded_by_name=_actor_name(user),
        file_name=data.file_name,
        mime_type=data.mime_type,
        size_bytes=data.size_bytes,
        storage_path=data.storage_path,
    )


@router.get(
    "/attachments/{attachment_id}/download-url",
    response_model=schemas.SignedDownloadOut,
)
def get_download_url(
    attachment_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    att = projects_crud.get_attachment(db, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, att.task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    url = create_download_signed_url(att.storage_path, expires_in=60)
    return schemas.SignedDownloadOut(url=url, expires_in=60)


@router.delete("/attachments/{attachment_id}")
def delete_attachment(
    attachment_id: int, request: Request, db: Session = Depends(get_db)
):
    user = resolve_request_user(request)
    att = projects_crud.get_attachment(db, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    client_org_id, is_ws_owner = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, att.task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    _ensure_uploader_or_owner(att, user, is_ws_owner)

    storage_path = att.storage_path
    projects_crud.delete_attachment(
        db,
        att,
        project_id=task.project_id,
        actor_user_id=user.user_id,
        actor_name=_actor_name(user),
    )
    # Best-effort remove from storage (never blocks the DB delete)
    try:
        delete_object(storage_path)
    except Exception:
        pass
    return {"ok": True}


# ── Activity feed ─────────────────────────────────────


@router.get("/{project_id}/activity", response_model=List[schemas.ActivityOut])
def project_activity(
    project_id: int,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 100,
):
    user = resolve_request_user(request)
    require_project_member(db, project_id, user.user_id)
    return projects_crud.list_project_activity(db, project_id, limit=limit)


@router.get("/tasks/{task_id}/activity", response_model=List[schemas.ActivityOut])
def task_activity(
    task_id: int,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 100,
):
    user = resolve_request_user(request)
    client_org_id, _ = resolve_project_context(db, user.user_id)
    task = projects_crud.get_task_in_org(db, task_id, client_org_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return projects_crud.list_task_activity(db, task_id, limit=limit)
