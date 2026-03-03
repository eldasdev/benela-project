from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.get("/{section}", response_model=List[schemas.ChatMessageOut])
def get_chat_history(
    section: str,
    session_id: str = Query(..., description="User+section session identifier"),
    limit: int = Query(50, description="Max messages to return"),
    db: Session = Depends(get_db),
):
    """
    Fetch chat history for a specific section and session.
    Frontend passes session_id as query param.
    """
    _ = section  # route keeps section explicit for frontend clarity
    return crud.get_chat_messages(db, session_id=session_id, limit=limit)


@router.post("/{section}/message", response_model=schemas.ChatMessageOut)
def save_message(
    section: str,
    payload: schemas.ChatMessageCreate,
    db: Session = Depends(get_db),
):
    """Save a single message (user or assistant)."""
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
    session_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Clear all chat history for this session+section."""
    crud.clear_chat_history(db, session_id=session_id)
    return {"success": True, "message": f"Chat history cleared for {section}"}


@router.get("/{section}/summary")
def get_summary(
    section: str,
    session_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Return message counts across all sections for this session."""
    _ = section
    return crud.get_all_sections_summary(db, session_id=session_id)
