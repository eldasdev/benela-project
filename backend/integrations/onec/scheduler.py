from __future__ import annotations

from datetime import UTC, datetime, timedelta

from database.connection import SessionLocal
from database.onec_models import OneCConnection
from integrations.onec.processor import run_connection_sync


async def run_scheduled_sync(connection_id: int):
    run_connection_sync(connection_id)


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def sync_all_active_connections() -> int:
    db = SessionLocal()
    try:
        now = _utcnow()
        due_connections = (
            db.query(OneCConnection)
            .filter(OneCConnection.is_active.is_(True), OneCConnection.sync_enabled.is_(True))
            .all()
        )
        dispatched = 0
        for connection in due_connections:
            interval = max(60, int(connection.sync_interval_minutes or 1440))
            if connection.last_sync_at and connection.last_sync_at > now - timedelta(minutes=interval):
                continue
            run_connection_sync(connection.id)
            dispatched += 1
        return dispatched
    finally:
        db.close()
