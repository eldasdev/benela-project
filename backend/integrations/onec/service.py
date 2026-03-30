from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.auth import get_request_user
from database.connection import SessionLocal
from database import models
from database.admin_crud import log_activity
from database.onec_models import OneCConnection, OneCImportJob, OneCRecord
from database.onec_schemas import OneCConnectionOut, OneCOverviewOut
from integrations.onec.security import decrypt_secret, encrypt_secret, mask_secret

ONEC_STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "onec_uploads"
ONEC_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

UPLOAD_LIMIT_WINDOW = timedelta(hours=1)
UPLOAD_LIMIT_COUNT = 10
SYNC_LIMIT_WINDOW = timedelta(minutes=5)


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def resolve_company_account(request: Request, db: Session, company_id: int | None = None) -> models.ClientWorkspaceAccount:
    auth_user = get_request_user(request)
    account = db.query(models.ClientWorkspaceAccount).filter(models.ClientWorkspaceAccount.user_id == auth_user.user_id).first()
    if auth_user.is_admin:
        if company_id is None:
            raise HTTPException(status_code=400, detail="company_id is required for admin 1C operations.")
        company_account = (
            db.query(models.ClientWorkspaceAccount)
            .filter(models.ClientWorkspaceAccount.client_org_id == company_id)
            .order_by(models.ClientWorkspaceAccount.id.asc())
            .first()
        )
        if not company_account or not company_account.client_org_id:
            raise HTTPException(status_code=404, detail="Workspace company was not found.")
        return company_account
    if not account or not account.client_org_id:
        raise HTTPException(status_code=400, detail="Client workspace does not have linked company billing context yet.")
    return account


def enforce_upload_rate_limit(db: Session, company_id: int) -> None:
    since = _utcnow() - UPLOAD_LIMIT_WINDOW
    count = (
        db.query(func.count(OneCImportJob.id))
        .filter(OneCImportJob.company_id == company_id, OneCImportJob.created_at >= since)
        .scalar()
        or 0
    )
    if int(count) >= UPLOAD_LIMIT_COUNT:
        raise HTTPException(status_code=429, detail="Upload rate limit reached. Try again later.")


def enforce_sync_rate_limit(connection: OneCConnection) -> None:
    if connection.last_sync_at and connection.last_sync_at > _utcnow() - SYNC_LIMIT_WINDOW:
        raise HTTPException(status_code=429, detail="Sync rate limit reached. Wait a few minutes before syncing again.")


ANOMALY_TITLES = {
    "negative_inventory": "Negative inventory balances detected.",
    "round_number": "Round-number transactions may indicate manual journal adjustments.",
    "missing_counterparty": "Some 1C transactions do not include counterparties.",
    "stale_sync": "1C data has not been refreshed recently.",
}


def collect_company_anomalies(db: Session, company_id: int) -> list[str]:
    latest_records = (
        db.query(OneCRecord)
        .filter(OneCRecord.company_id == company_id)
        .order_by(OneCRecord.created_at.desc())
        .limit(500)
        .all()
    )
    anomalies: list[str] = []
    for record in latest_records:
        normalized = record.normalized_data or {}
        if record.record_type == "inventory_item" and float(normalized.get("closing_stock") or 0) < 0:
            anomalies.append(ANOMALY_TITLES["negative_inventory"])
        if record.record_type == "transaction":
            amount = float(normalized.get("amount") or 0)
            if amount and abs(amount) % 1000 == 0:
                anomalies.append(ANOMALY_TITLES["round_number"])
            if not normalized.get("source_counterparty") and "counterparty" not in normalized:
                anomalies.append(ANOMALY_TITLES["missing_counterparty"])
    latest_job = (
        db.query(OneCImportJob)
        .filter(
            OneCImportJob.company_id == company_id,
            OneCImportJob.status == "completed",
            OneCImportJob.source_hint != "ai_query",
        )
        .order_by(OneCImportJob.completed_at.desc().nullslast(), OneCImportJob.id.desc())
        .first()
    )
    if latest_job and latest_job.completed_at and latest_job.completed_at < _utcnow() - timedelta(hours=24):
        anomalies.append(ANOMALY_TITLES["stale_sync"])
    return list(dict.fromkeys(anomalies))[:8]


def serialize_connection(connection: OneCConnection) -> OneCConnectionOut:
    db_host = decrypt_secret(connection.db_host) if connection.db_host else None
    db_username = decrypt_secret(connection.db_username) if connection.db_username else None
    api_username = decrypt_secret(connection.api_username) if connection.api_username else None
    return OneCConnectionOut(
        id=connection.id,
        company_id=connection.company_id,
        connection_type=connection.connection_type,
        connection_label=connection.connection_label,
        db_port=connection.db_port,
        db_name=connection.db_name,
        db_type=connection.db_type,
        api_base_url=connection.api_base_url,
        api_version=connection.api_version,
        sync_enabled=connection.sync_enabled,
        sync_interval_minutes=connection.sync_interval_minutes,
        last_sync_at=connection.last_sync_at,
        last_sync_status=connection.last_sync_status,
        last_sync_message=connection.last_sync_message,
        is_active=connection.is_active,
        masked_db_host=mask_secret(db_host),
        masked_db_username=mask_secret(db_username),
        masked_api_username=mask_secret(api_username),
        created_at=connection.created_at,
        updated_at=connection.updated_at,
    )


def apply_connection_secrets(connection: OneCConnection, payload: dict, *, partial: bool = False) -> None:
    raw_keys = {
        "db_host": payload.get("db_host"),
        "db_username": payload.get("db_username"),
        "db_password": payload.get("db_password"),
        "api_username": payload.get("api_username"),
        "api_password": payload.get("api_password"),
    }
    for key, value in raw_keys.items():
        if partial and key not in payload:
            continue
        if value is None:
            if not partial:
                setattr(connection, key, None)
            continue
        setattr(connection, key, encrypt_secret(str(value)))


def upsert_connection_fields(connection: OneCConnection, payload: dict, *, partial: bool = False) -> None:
    plain_fields = (
        "connection_type",
        "connection_label",
        "db_port",
        "db_name",
        "db_type",
        "api_base_url",
        "api_version",
        "sync_enabled",
        "sync_interval_minutes",
        "is_active",
    )
    for field_name in plain_fields:
        if partial and field_name not in payload:
            continue
        if field_name in payload:
            setattr(connection, field_name, payload[field_name])
    apply_connection_secrets(connection, payload, partial=partial)


def build_overview(db: Session, company_id: int) -> OneCOverviewOut:
    jobs = (
        db.query(OneCImportJob)
        .filter(OneCImportJob.company_id == company_id, OneCImportJob.source_hint != "ai_query")
        .order_by(OneCImportJob.created_at.desc())
        .all()
    )
    latest_job = jobs[0] if jobs else None
    connection = (
        db.query(OneCConnection)
        .filter(OneCConnection.company_id == company_id, OneCConnection.is_active.is_(True))
        .order_by(OneCConnection.updated_at.desc())
        .first()
    )
    records = db.query(OneCRecord).filter(OneCRecord.company_id == company_id).all()
    row_counts = Counter(record.row_status for record in records)
    dates: list[datetime.date] = []
    for record in records:
        normalized = record.normalized_data or {}
        raw_date = normalized.get("date") or normalized.get("issue_date")
        if hasattr(raw_date, "year") and hasattr(raw_date, "month"):
            try:
                dates.append(raw_date)
            except Exception:
                pass
    anomalies = collect_company_anomalies(db, company_id)
    return OneCOverviewOut(
        company_id=company_id,
        has_data=bool(records),
        has_active_connection=connection is not None,
        connection_type=connection.connection_type if connection else None,
        connection_label=connection.connection_label if connection else None,
        last_sync_at=(connection.last_sync_at if connection and connection.last_sync_at else (latest_job.completed_at if latest_job else None)),
        last_sync_status=(connection.last_sync_status if connection and connection.last_sync_status else (latest_job.status if latest_job else None)),
        latest_job=latest_job,
        total_jobs=len(jobs),
        total_records=len(records),
        imported_records=int(row_counts.get("imported", 0)),
        ready_records=int(row_counts.get("ready", 0)),
        duplicate_records=int(row_counts.get("duplicate", 0)),
        failed_records=int(row_counts.get("failed", 0)),
        anomaly_count=len(anomalies),
        coverage_period_start=min(dates) if dates else (latest_job.period_start if latest_job else None),
        coverage_period_end=max(dates) if dates else (latest_job.period_end if latest_job else None),
        anomalies=anomalies,
    )


def build_job_storage_path(job_id: int, filename: str) -> Path:
    suffix = Path(filename).suffix.lower() or ".bin"
    safe_stem = Path(filename).stem[:80].replace(" ", "-") or "import"
    return ONEC_STORAGE_ROOT / f"job-{job_id}-{safe_stem}{suffix}"


def audit_onec_ai_query(
    *,
    company_id: int | None,
    user_id: str | None,
    section: str,
    prompt: str,
    success: bool,
    error_message: str | None = None,
) -> None:
    if not company_id or not user_id:
        return

    db = SessionLocal()
    try:
        status_label = "success" if success else "failed"
        metadata = (
            f"section={section or 'general'};"
            f" source=1c_ai_context;"
            f" prompt_chars={len((prompt or '').strip())};"
            f" error={((error_message or '').strip()[:240] or 'none')}"
        )
        log_activity(
            db=db,
            client_id=company_id,
            action=f"1c_ai_query_{status_label}",
            actor=user_id,
            metadata=metadata,
        )
    except Exception:
        db.rollback()
    finally:
        db.close()
