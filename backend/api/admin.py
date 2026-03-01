from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.connection import get_db
from database import admin_schemas
from database import admin_crud as crud
from database.models import PlanStatus, PaymentStatus

router = APIRouter(prefix="/admin", tags=["Admin"])


class SendNotificationBody(BaseModel):
    recipient_count: int


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
