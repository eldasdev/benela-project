from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.connection import get_db
from database import admin_schemas
from database import admin_crud as crud
from database.models import PlanStatus, PaymentStatus

router = APIRouter(prefix="/admin", tags=["Admin"])


class SendNotificationBody(BaseModel):
    recipient_count: int


class AITrainerContextPreviewBody(BaseModel):
    section: str
    message: str
    max_context_chars: Optional[int] = 12000
    max_chunks: Optional[int] = 8


# ── Overview ──────────────────────────────────────────
@router.get("/summary")
def admin_summary(db: Session = Depends(get_db)):
    return crud.get_platform_summary(db)


# ── Clients ───────────────────────────────────────────
@router.get("/clients")
def list_clients(db: Session = Depends(get_db)):
    rows = crud.get_clients_with_subscriptions(db)
    return [
        {
            "client": admin_schemas.ClientOut.model_validate(r["client"]),
            "subscription": admin_schemas.SubscriptionOut.model_validate(r["subscription"]) if r["subscription"] else None,
        }
        for r in rows
    ]


@router.get("/clients/{id}", response_model=admin_schemas.ClientOut)
def get_client(id: int, db: Session = Depends(get_db)):
    c = crud.get_client(db, id)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.post("/clients", response_model=admin_schemas.ClientOut)
def create_client(data: admin_schemas.ClientCreate, db: Session = Depends(get_db)):
    return crud.create_client(db, data)


@router.put("/clients/{id}", response_model=admin_schemas.ClientOut)
def update_client(id: int, data: admin_schemas.ClientUpdate, db: Session = Depends(get_db)):
    c = crud.update_client(db, id, data)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.delete("/clients/{id}")
def delete_client(id: int, db: Session = Depends(get_db)):
    if not crud.delete_client(db, id):
        raise HTTPException(status_code=404, detail="Client not found")
    return {"ok": True}


@router.patch("/clients/{id}/suspend", response_model=admin_schemas.ClientOut)
def suspend_client(id: int, db: Session = Depends(get_db)):
    c = crud.suspend_client(db, id)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.patch("/clients/{id}/unsuspend", response_model=admin_schemas.ClientOut)
def unsuspend_client(id: int, db: Session = Depends(get_db)):
    c = crud.unsuspend_client(db, id)
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


# ── Subscriptions ────────────────────────────────────
@router.get("/subscriptions", response_model=List[admin_schemas.SubscriptionOut])
def list_subscriptions(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return crud.get_subscriptions(db, skip, limit)


@router.get("/subscriptions/{id}", response_model=admin_schemas.SubscriptionOut)
def get_subscription(id: int, db: Session = Depends(get_db)):
    s = crud.get_subscription(db, id)
    if not s:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return s


@router.post("/subscriptions", response_model=admin_schemas.SubscriptionOut)
def create_subscription(data: admin_schemas.SubscriptionCreate, db: Session = Depends(get_db)):
    return crud.create_subscription(db, data)


@router.put("/subscriptions/{id}", response_model=admin_schemas.SubscriptionOut)
def update_subscription(id: int, data: admin_schemas.SubscriptionUpdate, db: Session = Depends(get_db)):
    s = crud.update_subscription(db, id, data)
    if not s:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return s


@router.patch("/subscriptions/{id}/cancel", response_model=admin_schemas.SubscriptionOut)
def cancel_subscription(id: int, body: Optional[admin_schemas.CancelSubscriptionBody] = None, db: Session = Depends(get_db)):
    reason = body.reason if body else None
    s = crud.cancel_subscription(db, id, reason=reason)
    if not s:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return s


# ── Payments ──────────────────────────────────────────
@router.get("/payments/summary", response_model=admin_schemas.PaymentSummaryOut)
def payments_summary(db: Session = Depends(get_db)):
    return crud.get_payment_summary(db)


@router.get("/payments", response_model=List[admin_schemas.PaymentOut])
def list_payments(
    skip: int = 0,
    limit: int = 200,
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return crud.get_payments(db, skip, limit, client_id=client_id, status=status)


@router.get("/payments/client/{client_id}", response_model=List[admin_schemas.PaymentOut])
def list_payments_by_client(client_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_payments(db, skip, limit, client_id=client_id)


@router.post("/payments", response_model=admin_schemas.PaymentOut)
def create_payment(data: admin_schemas.PaymentCreate, db: Session = Depends(get_db)):
    return crud.create_payment(db, data)


@router.patch("/payments/{id}/status", response_model=admin_schemas.PaymentOut)
def update_payment_status(
    id: int,
    body: admin_schemas.PaymentStatusUpdate,
    db: Session = Depends(get_db),
):
    p = crud.update_payment_status(db, id, body.status, paid_at=body.paid_at)
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    return p


@router.get("/payment-methods", response_model=List[admin_schemas.PaymentMethodOut])
def list_payment_methods(
    active_only: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
):
    return crud.get_payment_methods(db, active_only=active_only)


@router.post("/payment-methods", response_model=admin_schemas.PaymentMethodOut)
def create_payment_method(data: admin_schemas.PaymentMethodCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_payment_method(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/payment-methods/{id}", response_model=admin_schemas.PaymentMethodOut)
def update_payment_method(id: int, data: admin_schemas.PaymentMethodUpdate, db: Session = Depends(get_db)):
    try:
        method = crud.update_payment_method(db, id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    return method


@router.patch("/payment-methods/{id}/default", response_model=admin_schemas.PaymentMethodOut)
def set_default_payment_method(id: int, db: Session = Depends(get_db)):
    try:
        method = crud.set_default_payment_method(db, id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    return method


@router.patch("/payment-methods/{id}/status", response_model=admin_schemas.PaymentMethodOut)
def set_payment_method_status(
    id: int,
    body: admin_schemas.PaymentMethodStatusBody,
    db: Session = Depends(get_db),
):
    method = crud.set_payment_method_status(db, id, body.is_active)
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    return method


# ── Notifications ─────────────────────────────────────
@router.get("/notifications", response_model=List[admin_schemas.NotificationOut])
def list_notifications(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_notifications(db, skip, limit)


@router.post("/notifications", response_model=admin_schemas.NotificationOut)
def create_notification(data: admin_schemas.NotificationCreate, db: Session = Depends(get_db)):
    return crud.create_notification(db, data)


@router.post("/notifications/{id}/send", response_model=admin_schemas.NotificationOut)
def send_notification(id: int, body: SendNotificationBody, db: Session = Depends(get_db)):
    n = crud.send_notification(db, id, body.recipient_count)
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    return n


@router.delete("/notifications/{id}")
def delete_notification(id: int, db: Session = Depends(get_db)):
    if not crud.delete_notification(db, id):
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


# ── Activity ───────────────────────────────────────────
@router.get("/activity", response_model=List[admin_schemas.ActivityOut])
def list_activity(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_activity(db, skip, limit)


@router.get("/activity/client/{client_id}", response_model=List[admin_schemas.ActivityOut])
def list_activity_by_client(client_id: int, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return crud.get_activity_by_client(db, client_id, skip, limit)


# ── Analytics ─────────────────────────────────────────
@router.get("/analytics/revenue")
def analytics_revenue(db: Session = Depends(get_db)):
    return crud.get_revenue_chart(db)


@router.get("/analytics/growth")
def analytics_growth(months: int = 12, db: Session = Depends(get_db)):
    return crud.get_analytics_growth(db, months)


@router.get("/analytics/churn")
def analytics_churn(months: int = 12, db: Session = Depends(get_db)):
    return crud.get_analytics_churn(db, months)


# ── Platform Settings ─────────────────────────────────
@router.get("/settings", response_model=admin_schemas.PlatformSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return crud.get_platform_settings(db)


@router.put("/settings", response_model=admin_schemas.PlatformSettingsOut)
def update_settings(data: admin_schemas.PlatformSettingsUpdate, db: Session = Depends(get_db)):
    try:
        return crud.update_platform_settings(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/settings/maintenance", response_model=admin_schemas.PlatformSettingsOut)
def set_maintenance_mode(body: admin_schemas.MaintenanceModeBody, db: Session = Depends(get_db)):
    return crud.set_maintenance_mode(db, body.enabled)


@router.post("/settings/emergency-lockdown", response_model=admin_schemas.PlatformSettingsOut)
def emergency_lockdown(db: Session = Depends(get_db)):
    return crud.emergency_lockdown(db)


@router.post("/settings/rotate-api-key")
def rotate_api_key(db: Session = Depends(get_db)):
    return {"platform_api_key": crud.rotate_platform_api_key(db)}


@router.post("/settings/rotate-webhook-secret")
def rotate_webhook_secret(db: Session = Depends(get_db)):
    return {"webhook_signing_secret": crud.rotate_webhook_signing_secret(db)}


# ── AI Trainer ────────────────────────────────────────
@router.get("/ai-trainer/profiles", response_model=List[admin_schemas.AITrainerProfileOut])
def list_ai_trainer_profiles(db: Session = Depends(get_db)):
    return crud.get_ai_trainer_profiles(db)


@router.get("/ai-trainer/profile/{section}", response_model=admin_schemas.AITrainerProfileOut)
def get_ai_trainer_profile(section: str, db: Session = Depends(get_db)):
    try:
        profile = crud.get_ai_trainer_profile(db, section)
        sources = crud.list_ai_trainer_sources(db, section, limit=1000)
        chunks_total = sum(item.chunk_count for item in sources)
        ready_total = sum(1 for item in sources if item.status == "ready")
        payload = admin_schemas.AITrainerProfileOut.model_validate(profile).model_dump()
        payload["sources_total"] = len(sources)
        payload["sources_ready"] = ready_total
        payload["chunks_total"] = chunks_total
        return payload
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/ai-trainer/profile/{section}", response_model=admin_schemas.AITrainerProfileOut)
def update_ai_trainer_profile(
    section: str,
    data: admin_schemas.AITrainerProfileUpdate,
    db: Session = Depends(get_db),
):
    try:
        profile = crud.update_ai_trainer_profile(db, section, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return profile


@router.get("/ai-trainer/sources", response_model=List[admin_schemas.AITrainerSourceOut])
def list_ai_trainer_sources(
    section: str = Query(...),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        return crud.list_ai_trainer_sources(db, section, limit=limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-trainer/sources/url", response_model=admin_schemas.AITrainerSourceOut)
def add_ai_trainer_source_url(
    data: admin_schemas.AITrainerSourceCreateURL,
    db: Session = Depends(get_db),
):
    try:
        return crud.create_ai_trainer_source_from_url(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-trainer/sources/text", response_model=admin_schemas.AITrainerSourceOut)
def add_ai_trainer_source_text(
    data: admin_schemas.AITrainerSourceCreateText,
    db: Session = Depends(get_db),
):
    try:
        return crud.create_ai_trainer_source_from_text(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-trainer/sources/file", response_model=admin_schemas.AITrainerSourceOut)
async def add_ai_trainer_source_file(
    section: str = Form(...),
    title: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    try:
        return crud.create_ai_trainer_source_from_file(
            db,
            section=section,
            file_name=file.filename or "source.bin",
            mime_type=file.content_type,
            payload=payload,
            title=title,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-trainer/sources/{source_id}/reindex", response_model=admin_schemas.AITrainerSourceOut)
def reindex_ai_trainer_source(source_id: int, db: Session = Depends(get_db)):
    source = crud.reindex_ai_trainer_source(db, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


@router.delete("/ai-trainer/sources/{source_id}")
def delete_ai_trainer_source(source_id: int, db: Session = Depends(get_db)):
    if not crud.delete_ai_trainer_source(db, source_id):
        raise HTTPException(status_code=404, detail="Source not found")
    return {"ok": True}


@router.post("/ai-trainer/context-preview")
def ai_trainer_context_preview(body: AITrainerContextPreviewBody, db: Session = Depends(get_db)):
    context = crud.get_ai_trainer_training_context(
        db=db,
        section=body.section,
        query=body.message,
        max_context_chars=body.max_context_chars or 12000,
        max_chunks=body.max_chunks or 8,
    )
    return {"context": context}
