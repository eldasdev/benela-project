import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from core.auth import assert_request_user_matches
from database.connection import get_db
from database import crud, schemas

router = APIRouter(prefix="/chat", tags=["Chat"])

SESSION_ID_RE = re.compile(r"^u:(?P<user_id>[^:]+):w:(?P<workspace_id>[^:]+):s:(?P<section>[^:]+):t:(?P<thread_id>.+)$")


def _assert_session_access(request: Request, section: str, session_id: str) -> dict[str, str]:
    match = SESSION_ID_RE.match((session_id or "").strip())
    if not match:
        raise HTTPException(status_code=403, detail="Invalid chat session scope.")

    payload = match.groupdict()
    assert_request_user_matches(request, user_id=payload["user_id"])
    if payload["section"] != section:
        raise HTTPException(status_code=403, detail="Chat section mismatch.")
    return payload


@router.get("/{section}/sessions", response_model=List[schemas.ChatSessionOut])
def list_sessions(
    section: str,
    request: Request,
    user_id: str = Query(..., description="Authenticated user id"),
    workspace_id: str = Query("default-workspace", description="Workspace id"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    assert_request_user_matches(request, user_id=user_id)
    session_prefix = f"u:{user_id}:w:{workspace_id}:s:{section}:t:"
    return crud.list_chat_sessions(
        db,
        section=section,
        session_prefix=session_prefix,
        limit=limit,
    )


@router.get("/{section}", response_model=List[schemas.ChatMessageOut])
def get_chat_history(
    section: str,
    request: Request,
    session_id: str = Query(..., description="User+section session identifier"),
    limit: int = Query(50, description="Max messages to return"),
    db: Session = Depends(get_db),
):
    """
    Fetch chat history for a specific section and session.
    Frontend passes session_id as query param.
    """
    _assert_session_access(request, section, session_id)
    _ = section  # route keeps section explicit for frontend clarity
    return crud.get_chat_messages(db, session_id=session_id, limit=limit)


@router.post("/{section}/message", response_model=schemas.ChatMessageOut)
def save_message(
    section: str,
    request: Request,
    payload: schemas.ChatMessageCreate,
    db: Session = Depends(get_db),
):
    """Save a single message (user or assistant)."""
    _assert_session_access(request, section, payload.session_id)
    return crud.save_chat_message(
        db,
        session_id=payload.session_id,
        section=section,
        role=payload.role,
        content=payload.content,
        attachments=payload.attachments,
    )


@router.delete("/{section}")
def clear_history(
    section: str,
    request: Request,
    session_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Clear all chat history for this session+section."""
    _assert_session_access(request, section, session_id)
    crud.clear_chat_history(db, session_id=session_id)
    return {"success": True, "message": f"Chat history cleared for {section}"}


@router.get("/{section}/summary")
def get_summary(
    section: str,
    request: Request,
    session_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Return message counts across all sections for this session."""
    _assert_session_access(request, section, session_id)
    _ = section
    return crud.get_all_sections_summary(db, session_id=session_id)
