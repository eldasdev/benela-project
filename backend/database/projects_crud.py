"""Dedicated CRUD layer for the Projects module.

All list/get functions are workspace-scoped (``client_org_id``). Mutating
functions call :func:`log_activity` at the end so the project Activity feed
captures a complete audit trail automatically.

This module does **not** enforce RBAC — callers must use the helpers in
``core.project_access`` to resolve the caller's ``client_org_id`` and
confirm ownership where needed.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database.models import (
    Employee,
    KanbanColumn,
    KanbanTask,
    Project,
    ProjectActivity,
    ProjectLabel,
    ProjectStatus,
    TaskAttachment,
    TaskChecklistItem,
    TaskComment,
    TaskLabelLink,
    TaskPriority,
    TaskWatcher,
)

# ── Activity log ──────────────────────────────────────


def log_activity(
    db: Session,
    *,
    project_id: int,
    task_id: Optional[int],
    actor_user_id: Optional[str],
    actor_name: Optional[str],
    action: str,
    metadata: Optional[dict[str, Any]] = None,
    commit: bool = True,
) -> ProjectActivity:
    row = ProjectActivity(
        project_id=project_id,
        task_id=task_id,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action=action,
        metadata_json=metadata or None,
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row


def list_project_activity(db: Session, project_id: int, limit: int = 100) -> list[ProjectActivity]:
    return (
        db.query(ProjectActivity)
        .filter(ProjectActivity.project_id == project_id)
        .order_by(ProjectActivity.created_at.desc())
        .limit(limit)
        .all()
    )


def list_task_activity(db: Session, task_id: int, limit: int = 100) -> list[ProjectActivity]:
    return (
        db.query(ProjectActivity)
        .filter(ProjectActivity.task_id == task_id)
        .order_by(ProjectActivity.created_at.desc())
        .limit(limit)
        .all()
    )


# ── Projects ──────────────────────────────────────────


def list_projects(db: Session, client_org_id: int) -> list[Project]:
    return (
        db.query(Project)
        .filter(Project.client_org_id == client_org_id)
        .order_by(Project.created_at.desc())
        .all()
    )


def get_project(db: Session, project_id: int, client_org_id: int) -> Optional[Project]:
    return (
        db.query(Project)
        .filter(Project.id == project_id, Project.client_org_id == client_org_id)
        .first()
    )


def create_project(
    db: Session,
    *,
    client_org_id: int,
    owner_user_id: str,
    owner_name: Optional[str],
    name: str,
    description: Optional[str] = None,
    color: Optional[str] = None,
    due_date: Optional[datetime] = None,
    status: Optional[ProjectStatus] = None,
) -> Project:
    project = Project(
        client_org_id=client_org_id,
        owner_user_id=owner_user_id,
        name=name,
        description=description,
        color=color or "#7c6aff",
        due_date=due_date,
        status=status or ProjectStatus.active,
        owner=owner_name or None,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Seed 3 default columns (Trello-style nicety)
    defaults = [
        ("To Do", "#64748b", 0),
        ("In Progress", "#f59e0b", 1),
        ("Done", "#10b981", 2),
    ]
    for col_name, col_color, pos in defaults:
        db.add(
            KanbanColumn(
                project_id=project.id, name=col_name, color=col_color, position=pos
            )
        )
    db.commit()
    db.refresh(project)

    log_activity(
        db,
        project_id=project.id,
        task_id=None,
        actor_user_id=owner_user_id,
        actor_name=owner_name,
        action="project.created",
        metadata={"name": project.name},
    )
    return project


def update_project(
    db: Session,
    project: Project,
    patch: dict[str, Any],
    *,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> Project:
    changed: dict[str, Any] = {}
    for key in ("name", "description", "color", "status", "due_date"):
        if key in patch and patch[key] is not None:
            old = getattr(project, key)
            new = patch[key]
            if old != new:
                setattr(project, key, new)
                changed[key] = {"from": str(old) if old is not None else None, "to": str(new)}
    if changed:
        db.commit()
        db.refresh(project)
        log_activity(
            db,
            project_id=project.id,
            task_id=None,
            actor_user_id=actor_user_id,
            actor_name=actor_name,
            action="project.updated",
            metadata={"changes": changed},
        )
    return project


def delete_project(db: Session, project: Project) -> None:
    db.delete(project)
    db.commit()


def project_counts(db: Session, project_id: int) -> dict[str, int]:
    task_count = db.query(func.count(KanbanTask.id)).filter(KanbanTask.project_id == project_id).scalar() or 0
    done_count = (
        db.query(func.count(KanbanTask.id))
        .filter(KanbanTask.project_id == project_id, KanbanTask.completed_at.isnot(None))
        .scalar()
        or 0
    )
    return {"task_count": int(task_count), "done_count": int(done_count)}


# ── Columns ───────────────────────────────────────────


def list_columns(db: Session, project_id: int) -> list[KanbanColumn]:
    return (
        db.query(KanbanColumn)
        .filter(KanbanColumn.project_id == project_id)
        .order_by(KanbanColumn.position.asc(), KanbanColumn.id.asc())
        .all()
    )


def get_column(db: Session, column_id: int) -> Optional[KanbanColumn]:
    return db.query(KanbanColumn).filter(KanbanColumn.id == column_id).first()


def create_column(
    db: Session,
    *,
    project_id: int,
    name: str,
    color: Optional[str] = None,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> KanbanColumn:
    max_pos = (
        db.query(func.coalesce(func.max(KanbanColumn.position), -1))
        .filter(KanbanColumn.project_id == project_id)
        .scalar()
    )
    col = KanbanColumn(
        project_id=project_id,
        name=name,
        color=color or "#555",
        position=int(max_pos) + 1,
    )
    db.add(col)
    db.commit()
    db.refresh(col)
    log_activity(
        db,
        project_id=project_id,
        task_id=None,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action="column.created",
        metadata={"column_id": col.id, "name": col.name},
    )
    return col


def update_column(
    db: Session,
    col: KanbanColumn,
    patch: dict[str, Any],
    *,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> KanbanColumn:
    changed = False
    for key in ("name", "color"):
        if key in patch and patch[key] is not None and getattr(col, key) != patch[key]:
            setattr(col, key, patch[key])
            changed = True
    if changed:
        db.commit()
        db.refresh(col)
        log_activity(
            db,
            project_id=col.project_id,
            task_id=None,
            actor_user_id=actor_user_id,
            actor_name=actor_name,
            action="column.updated",
            metadata={"column_id": col.id, "name": col.name},
        )
    return col


def delete_column(
    db: Session,
    col: KanbanColumn,
    *,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> None:
    project_id = col.project_id
    col_name = col.name
    db.delete(col)
    db.commit()
    log_activity(
        db,
        project_id=project_id,
        task_id=None,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action="column.deleted",
        metadata={"name": col_name},
    )


def reorder_columns(db: Session, project_id: int, ordered_ids: list[int]) -> None:
    cols = {
        c.id: c
        for c in db.query(KanbanColumn).filter(KanbanColumn.project_id == project_id).all()
    }
    for idx, cid in enumerate(ordered_ids):
        col = cols.get(cid)
        if col is not None:
            col.position = idx
    db.commit()


# ── Tasks ─────────────────────────────────────────────


def list_tasks(db: Session, project_id: int) -> list[KanbanTask]:
    return (
        db.query(KanbanTask)
        .filter(KanbanTask.project_id == project_id)
        .order_by(KanbanTask.column_id.asc(), KanbanTask.position.asc(), KanbanTask.id.asc())
        .all()
    )


def get_task(db: Session, task_id: int) -> Optional[KanbanTask]:
    return db.query(KanbanTask).filter(KanbanTask.id == task_id).first()


def get_task_in_org(db: Session, task_id: int, client_org_id: int) -> Optional[KanbanTask]:
    return (
        db.query(KanbanTask)
        .join(Project, Project.id == KanbanTask.project_id)
        .filter(KanbanTask.id == task_id, Project.client_org_id == client_org_id)
        .first()
    )


def create_task(
    db: Session,
    *,
    project_id: int,
    column_id: int,
    title: str,
    description: Optional[str] = None,
    priority: Optional[TaskPriority] = None,
    due_date: Optional[datetime] = None,
    start_date: Optional[datetime] = None,
    employee_id: Optional[int] = None,
    cover_color: Optional[str] = None,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> KanbanTask:
    max_pos = (
        db.query(func.coalesce(func.max(KanbanTask.position), -1))
        .filter(KanbanTask.column_id == column_id)
        .scalar()
    )
    task = KanbanTask(
        project_id=project_id,
        column_id=column_id,
        title=title,
        description=description,
        priority=priority or TaskPriority.medium,
        due_date=due_date,
        start_date=start_date,
        employee_id=employee_id,
        cover_color=cover_color,
        position=int(max_pos) + 1,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    log_activity(
        db,
        project_id=project_id,
        task_id=task.id,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action="task.created",
        metadata={"title": task.title, "column_id": column_id},
    )
    return task


def update_task(
    db: Session,
    task: KanbanTask,
    patch: dict[str, Any],
    *,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> KanbanTask:
    tracked = (
        "title",
        "description",
        "priority",
        "due_date",
        "start_date",
        "employee_id",
        "cover_color",
    )
    changed: dict[str, Any] = {}
    for key in tracked:
        if key in patch:
            new = patch[key]
            old = getattr(task, key)
            if old != new:
                setattr(task, key, new)
                changed[key] = {
                    "from": str(old) if old is not None else None,
                    "to": str(new) if new is not None else None,
                }
    if changed:
        db.commit()
        db.refresh(task)
        log_activity(
            db,
            project_id=task.project_id,
            task_id=task.id,
            actor_user_id=actor_user_id,
            actor_name=actor_name,
            action="task.updated",
            metadata={"changes": changed},
        )
    return task


def move_task(
    db: Session,
    task: KanbanTask,
    *,
    new_column_id: int,
    new_position: int,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> KanbanTask:
    old_column_id = task.column_id
    task.column_id = new_column_id
    task.position = new_position
    db.commit()
    db.refresh(task)

    # Normalize sibling positions in target column so they are 0..N-1 preserving
    # the requested ordering (the moved task sits at new_position).
    _normalize_task_positions(db, new_column_id)
    if old_column_id != new_column_id:
        _normalize_task_positions(db, old_column_id)

    db.refresh(task)
    log_activity(
        db,
        project_id=task.project_id,
        task_id=task.id,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action="task.moved",
        metadata={
            "from_column_id": old_column_id,
            "to_column_id": new_column_id,
            "position": new_position,
        },
    )
    return task


def _normalize_task_positions(db: Session, column_id: int) -> None:
    tasks = (
        db.query(KanbanTask)
        .filter(KanbanTask.column_id == column_id)
        .order_by(KanbanTask.position.asc(), KanbanTask.id.asc())
        .all()
    )
    for idx, t in enumerate(tasks):
        if t.position != idx:
            t.position = idx
    db.commit()


def reorder_tasks_in_column(
    db: Session, column_id: int, ordered_ids: list[int]
) -> None:
    tasks = {
        t.id: t
        for t in db.query(KanbanTask).filter(KanbanTask.column_id == column_id).all()
    }
    for idx, tid in enumerate(ordered_ids):
        t = tasks.get(tid)
        if t is not None:
            t.position = idx
    db.commit()


def toggle_task_complete(
    db: Session,
    task: KanbanTask,
    *,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> KanbanTask:
    if task.completed_at is None:
        task.completed_at = datetime.utcnow()
        action = "task.completed"
    else:
        task.completed_at = None
        action = "task.reopened"
    db.commit()
    db.refresh(task)
    log_activity(
        db,
        project_id=task.project_id,
        task_id=task.id,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action=action,
        metadata=None,
    )
    return task


def delete_task(
    db: Session,
    task: KanbanTask,
    *,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> None:
    project_id = task.project_id
    title = task.title
    tid = task.id
    db.delete(task)
    db.commit()
    log_activity(
        db,
        project_id=project_id,
        task_id=None,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action="task.deleted",
        metadata={"task_id": tid, "title": title},
    )


# ── Labels ────────────────────────────────────────────


def list_labels(db: Session, project_id: int) -> list[ProjectLabel]:
    return (
        db.query(ProjectLabel)
        .filter(ProjectLabel.project_id == project_id)
        .order_by(ProjectLabel.created_at.asc(), ProjectLabel.id.asc())
        .all()
    )


def get_label(db: Session, label_id: int) -> Optional[ProjectLabel]:
    return db.query(ProjectLabel).filter(ProjectLabel.id == label_id).first()


def create_label(
    db: Session, *, project_id: int, name: str, color: str
) -> ProjectLabel:
    label = ProjectLabel(project_id=project_id, name=name, color=color)
    db.add(label)
    db.commit()
    db.refresh(label)
    return label


def update_label(
    db: Session, label: ProjectLabel, patch: dict[str, Any]
) -> ProjectLabel:
    for key in ("name", "color"):
        if key in patch and patch[key] is not None:
            setattr(label, key, patch[key])
    db.commit()
    db.refresh(label)
    return label


def delete_label(db: Session, label: ProjectLabel) -> None:
    db.delete(label)
    db.commit()


def list_task_labels(db: Session, task_id: int) -> list[ProjectLabel]:
    return (
        db.query(ProjectLabel)
        .join(TaskLabelLink, TaskLabelLink.label_id == ProjectLabel.id)
        .filter(TaskLabelLink.task_id == task_id)
        .all()
    )


def attach_label(db: Session, task_id: int, label_id: int) -> None:
    exists = (
        db.query(TaskLabelLink)
        .filter(TaskLabelLink.task_id == task_id, TaskLabelLink.label_id == label_id)
        .first()
    )
    if exists:
        return
    db.add(TaskLabelLink(task_id=task_id, label_id=label_id))
    db.commit()


def detach_label(db: Session, task_id: int, label_id: int) -> None:
    db.query(TaskLabelLink).filter(
        TaskLabelLink.task_id == task_id, TaskLabelLink.label_id == label_id
    ).delete()
    db.commit()


def labels_map_for_tasks(
    db: Session, task_ids: Iterable[int]
) -> dict[int, list[ProjectLabel]]:
    """Return ``{task_id: [labels]}`` for a batch of tasks (board rendering)."""
    ids = list(task_ids)
    if not ids:
        return {}
    rows = (
        db.query(TaskLabelLink.task_id, ProjectLabel)
        .join(ProjectLabel, ProjectLabel.id == TaskLabelLink.label_id)
        .filter(TaskLabelLink.task_id.in_(ids))
        .all()
    )
    out: dict[int, list[ProjectLabel]] = {}
    for task_id, label in rows:
        out.setdefault(task_id, []).append(label)
    return out


# ── Checklist ─────────────────────────────────────────


def list_checklist(db: Session, task_id: int) -> list[TaskChecklistItem]:
    return (
        db.query(TaskChecklistItem)
        .filter(TaskChecklistItem.task_id == task_id)
        .order_by(TaskChecklistItem.position.asc(), TaskChecklistItem.id.asc())
        .all()
    )


def create_checklist_item(
    db: Session, *, task_id: int, text: str
) -> TaskChecklistItem:
    max_pos = (
        db.query(func.coalesce(func.max(TaskChecklistItem.position), -1))
        .filter(TaskChecklistItem.task_id == task_id)
        .scalar()
    )
    item = TaskChecklistItem(
        task_id=task_id, text=text, done=False, position=int(max_pos) + 1
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_checklist_item(
    db: Session, item: TaskChecklistItem, patch: dict[str, Any]
) -> TaskChecklistItem:
    if "text" in patch and patch["text"] is not None:
        item.text = patch["text"]
    if "done" in patch and patch["done"] is not None:
        item.done = bool(patch["done"])
    if "position" in patch and patch["position"] is not None:
        item.position = int(patch["position"])
    db.commit()
    db.refresh(item)
    return item


def delete_checklist_item(db: Session, item: TaskChecklistItem) -> None:
    db.delete(item)
    db.commit()


def checklist_counts_for_tasks(
    db: Session, task_ids: Iterable[int]
) -> dict[int, tuple[int, int]]:
    """Return ``{task_id: (total, done)}`` for a batch of tasks."""
    ids = list(task_ids)
    if not ids:
        return {}
    items = (
        db.query(TaskChecklistItem.task_id, TaskChecklistItem.done)
        .filter(TaskChecklistItem.task_id.in_(ids))
        .all()
    )
    out: dict[int, tuple[int, int]] = {}
    for task_id, done in items:
        tid = int(task_id)
        total, done_count = out.get(tid, (0, 0))
        out[tid] = (total + 1, done_count + (1 if done else 0))
    return out


# ── Comments ──────────────────────────────────────────


def list_comments(db: Session, task_id: int) -> list[TaskComment]:
    return (
        db.query(TaskComment)
        .filter(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.asc(), TaskComment.id.asc())
        .all()
    )


def get_comment(db: Session, comment_id: int) -> Optional[TaskComment]:
    return db.query(TaskComment).filter(TaskComment.id == comment_id).first()


def create_comment(
    db: Session,
    *,
    task_id: int,
    project_id: int,
    author_user_id: str,
    author_name: Optional[str],
    body: str,
) -> TaskComment:
    comment = TaskComment(
        task_id=task_id,
        author_user_id=author_user_id,
        author_name=author_name,
        body=body,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    log_activity(
        db,
        project_id=project_id,
        task_id=task_id,
        actor_user_id=author_user_id,
        actor_name=author_name,
        action="comment.added",
        metadata={"comment_id": comment.id},
    )
    return comment


def update_comment(
    db: Session, comment: TaskComment, body: str
) -> TaskComment:
    comment.body = body
    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(
    db: Session,
    comment: TaskComment,
    *,
    project_id: int,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> None:
    task_id = comment.task_id
    db.delete(comment)
    db.commit()
    log_activity(
        db,
        project_id=project_id,
        task_id=task_id,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action="comment.deleted",
        metadata=None,
    )


def comment_counts_for_tasks(
    db: Session, task_ids: Iterable[int]
) -> dict[int, int]:
    ids = list(task_ids)
    if not ids:
        return {}
    rows = (
        db.query(TaskComment.task_id, func.count(TaskComment.id))
        .filter(TaskComment.task_id.in_(ids))
        .group_by(TaskComment.task_id)
        .all()
    )
    return {int(tid): int(c) for tid, c in rows}


# ── Attachments ───────────────────────────────────────


def list_attachments(db: Session, task_id: int) -> list[TaskAttachment]:
    return (
        db.query(TaskAttachment)
        .filter(TaskAttachment.task_id == task_id)
        .order_by(TaskAttachment.created_at.desc(), TaskAttachment.id.desc())
        .all()
    )


def get_attachment(db: Session, attachment_id: int) -> Optional[TaskAttachment]:
    return (
        db.query(TaskAttachment).filter(TaskAttachment.id == attachment_id).first()
    )


def create_attachment(
    db: Session,
    *,
    task_id: int,
    project_id: int,
    uploaded_by_user_id: Optional[str],
    uploaded_by_name: Optional[str],
    file_name: str,
    mime_type: Optional[str],
    size_bytes: Optional[int],
    storage_path: str,
) -> TaskAttachment:
    att = TaskAttachment(
        task_id=task_id,
        uploaded_by_user_id=uploaded_by_user_id,
        uploaded_by_name=uploaded_by_name,
        file_name=file_name,
        mime_type=mime_type,
        size_bytes=size_bytes,
        storage_path=storage_path,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    log_activity(
        db,
        project_id=project_id,
        task_id=task_id,
        actor_user_id=uploaded_by_user_id,
        actor_name=uploaded_by_name,
        action="attachment.added",
        metadata={"file_name": file_name, "attachment_id": att.id},
    )
    return att


def delete_attachment(
    db: Session,
    att: TaskAttachment,
    *,
    project_id: int,
    actor_user_id: Optional[str],
    actor_name: Optional[str],
) -> None:
    task_id = att.task_id
    file_name = att.file_name
    db.delete(att)
    db.commit()
    log_activity(
        db,
        project_id=project_id,
        task_id=task_id,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action="attachment.removed",
        metadata={"file_name": file_name},
    )


def attachment_counts_for_tasks(
    db: Session, task_ids: Iterable[int]
) -> dict[int, int]:
    ids = list(task_ids)
    if not ids:
        return {}
    rows = (
        db.query(TaskAttachment.task_id, func.count(TaskAttachment.id))
        .filter(TaskAttachment.task_id.in_(ids))
        .group_by(TaskAttachment.task_id)
        .all()
    )
    return {int(tid): int(c) for tid, c in rows}


# ── Watchers ──────────────────────────────────────────


def list_watchers(db: Session, task_id: int) -> list[str]:
    rows = (
        db.query(TaskWatcher.user_id)
        .filter(TaskWatcher.task_id == task_id)
        .all()
    )
    return [r[0] for r in rows]


def add_watcher(db: Session, task_id: int, user_id: str) -> None:
    exists = (
        db.query(TaskWatcher)
        .filter(TaskWatcher.task_id == task_id, TaskWatcher.user_id == user_id)
        .first()
    )
    if exists:
        return
    db.add(TaskWatcher(task_id=task_id, user_id=user_id))
    db.commit()


def remove_watcher(db: Session, task_id: int, user_id: str) -> None:
    db.query(TaskWatcher).filter(
        TaskWatcher.task_id == task_id, TaskWatcher.user_id == user_id
    ).delete()
    db.commit()


# ── Members (HR employee picker feed) ─────────────────


def list_org_employees(db: Session, client_org_id: int) -> list[Employee]:
    """Return employees belonging to the caller's workspace.

    Employees are scoped via ``Employee.company_id`` (FK to ``client_orgs``).
    Rows with no company (legacy single-tenant data) are included so that
    existing installs without tenant isolation still see their employees.
    """
    return (
        db.query(Employee)
        .filter(
            or_(Employee.company_id == client_org_id, Employee.company_id.is_(None))
        )
        .order_by(Employee.full_name.asc())
        .all()
    )
