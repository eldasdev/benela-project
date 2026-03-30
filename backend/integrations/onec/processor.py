from __future__ import annotations

import asyncio
import logging
import math
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database.connection import SessionLocal
from database.models import Invoice
from database.onec_models import OneCConnection, OneCImportJob, OneCRecord
from integrations.onec.db_connector import OneCDatabaseConnector
from integrations.onec.file_parser import OneCFileParser
from integrations.onec.http_client import OneCHTTPClient
from integrations.onec.normalizer import OneCNormalizer


PARSER = OneCFileParser()
NORMALIZER = OneCNormalizer()
logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def process_import_job(job_id: int) -> None:
    db = SessionLocal()
    try:
        _process_import_job(db, job_id)
        db.commit()
    except Exception:
        db.rollback()
        job = db.query(OneCImportJob).filter(OneCImportJob.id == job_id).first()
        if job:
            job.status = "failed"
            job.error_message = _summarize_error()
            job.completed_at = _utcnow()
            db.commit()
        logger.exception("1C import job %s failed", job_id)
    finally:
        db.close()


def _truncate_error() -> str:
    import traceback

    detail = traceback.format_exc(limit=2)
    return detail[-1800:]


def _summarize_error() -> str:
    import sys
    import traceback

    exc = traceback.TracebackException(*sys.exc_info(), limit=2)
    if exc.exc_type and exc.exc_type.__name__ == "HTTPException":
        message = "".join(exc.format_exception_only()).strip()
        marker = "HTTPException:"
        if marker in message:
            return message.split(marker, maxsplit=1)[1].strip()
        return message
    detail = "".join(exc.format_exception_only()).strip()
    return detail or _truncate_error()


def _process_import_job(db: Session, job_id: int) -> None:
    job = db.query(OneCImportJob).filter(OneCImportJob.id == job_id).first()
    if not job:
        return
    job.status = "processing"
    job.error_message = None
    db.flush()

    parsed = asyncio.run(PARSER.parse_file(job.storage_path, report_type_hint=job.report_type if job.report_type != "unknown" else None))
    normalized_rows = _normalize_rows(parsed.report_type, parsed.rows, company_id=job.company_id)
    existing_hashes = {value for (value,) in db.query(OneCRecord.import_hash).filter(OneCRecord.company_id == job.company_id).all()}

    period_dates = []
    row_failures = 0
    anomaly_count = 0
    for raw_row, normalized in zip(parsed.rows, normalized_rows):
        try:
            deduped = asyncio.run(NORMALIZER.deduplicate([normalized], existing_hashes, record_type=_record_type_for_report(parsed.report_type)))
            normalized_payload = deduped[0]
            import_hash = normalized_payload.pop("import_hash")
            is_duplicate = bool(normalized_payload.pop("is_duplicate", False))
            row_status = "duplicate" if is_duplicate else "ready"
            if parsed.report_type == "inventory" and float(normalized_payload.get("closing_stock") or 0) < 0:
                anomaly_count += 1
            raw_date = normalized_payload.get("date") or normalized_payload.get("issue_date")
            if hasattr(raw_date, "date"):
                period_dates.append(raw_date.date())
            elif hasattr(raw_date, "year"):
                period_dates.append(raw_date)
            db.add(
                OneCRecord(
                    import_job_id=job.id,
                    company_id=job.company_id,
                    record_type=_record_type_for_report(parsed.report_type),
                    raw_data=_json_safe(raw_row),
                    normalized_data=_json_safe(normalized_payload),
                    benela_table=_benela_table_for_record_type(_record_type_for_report(parsed.report_type)),
                    import_hash=import_hash,
                    row_status=row_status,
                )
            )
            if not is_duplicate:
                existing_hashes.add(import_hash)
        except Exception as exc:
            row_failures += 1
            anomaly_count += 1
            db.add(
                OneCRecord(
                    import_job_id=job.id,
                    company_id=job.company_id,
                    record_type=_record_type_for_report(parsed.report_type),
                    raw_data=_json_safe(raw_row),
                    normalized_data={},
                    benela_table=_benela_table_for_record_type(_record_type_for_report(parsed.report_type)),
                    import_hash=f"failed-{job.id}-{row_failures}-{_utcnow().timestamp()}",
                    row_status="failed",
                    error_message=str(exc),
                )
            )

    job.report_type = parsed.report_type
    job.records_parsed = len(parsed.rows)
    job.records_skipped = int(db.query(OneCRecord).filter(OneCRecord.import_job_id == job.id, OneCRecord.row_status == "duplicate").count())
    job.records_failed = int(db.query(OneCRecord).filter(OneCRecord.import_job_id == job.id, OneCRecord.row_status == "failed").count()) + row_failures
    job.records_imported = 0
    job.anomaly_count = anomaly_count
    job.period_start = min(period_dates) if period_dates else None
    job.period_end = max(period_dates) if period_dates else None
    job.status = "completed"
    job.completed_at = _utcnow()


def confirm_import_job(db: Session, job_id: int) -> tuple[int, int, int]:
    job = db.query(OneCImportJob).filter(OneCImportJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="1C import job not found.")
    if job.status != "completed":
        raise HTTPException(status_code=409, detail="Only completed parse jobs can be confirmed.")

    ready_records = (
        db.query(OneCRecord)
        .filter(OneCRecord.import_job_id == job_id, OneCRecord.row_status == "ready")
        .order_by(OneCRecord.id.asc())
        .all()
    )
    skipped = int(db.query(OneCRecord).filter(OneCRecord.import_job_id == job_id, OneCRecord.row_status == "duplicate").count())
    failed = int(db.query(OneCRecord).filter(OneCRecord.import_job_id == job_id, OneCRecord.row_status == "failed").count())

    imported = 0
    for record in ready_records:
        normalized = record.normalized_data or {}
        if record.record_type == "transaction":
            tx = NORMALIZER.build_transaction_model(normalized)
            db.add(tx)
            db.flush()
            record.benela_record_id = tx.id
            record.benela_table = "transactions"
        elif record.record_type == "invoice":
            invoice_number = str(normalized.get("invoice_number") or "").strip()
            if invoice_number:
                existing = db.query(Invoice).filter(Invoice.invoice_number == invoice_number).first()
                if existing:
                    normalized["invoice_number"] = f"{invoice_number}-{record.company_id}-{record.id}"
            inv = NORMALIZER.build_invoice_model(normalized)
            db.add(inv)
            db.flush()
            record.benela_record_id = inv.id
            record.benela_table = "invoices"
        else:
            record.benela_record_id = None
            record.benela_table = record.benela_table or "onec_raw_records"
        record.row_status = "imported"
        imported += 1

    job.records_imported = imported
    job.records_skipped = skipped
    job.records_failed = failed
    job.confirmed_at = _utcnow()
    return imported, skipped, failed


def rollback_import_job(db: Session, job_id: int) -> None:
    job = db.query(OneCImportJob).filter(OneCImportJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="1C import job not found.")
    records = db.query(OneCRecord).filter(OneCRecord.import_job_id == job.id).all()
    for record in records:
        if record.benela_table == "transactions" and record.benela_record_id:
            from database.models import Transaction

            tx = db.query(Transaction).filter(Transaction.id == record.benela_record_id).first()
            if tx:
                db.delete(tx)
        elif record.benela_table == "invoices" and record.benela_record_id:
            inv = db.query(Invoice).filter(Invoice.id == record.benela_record_id).first()
            if inv:
                db.delete(inv)
        db.delete(record)
    try:
        path = Path(job.storage_path)
        if path.exists():
            path.unlink()
    except Exception:
        pass
    db.delete(job)


def run_connection_sync(connection_id: int) -> int | None:
    db = SessionLocal()
    try:
        connection = db.query(OneCConnection).filter(OneCConnection.id == connection_id).first()
        if not connection:
            return None
        job_id = asyncio.run(_run_connection_sync(db, connection))
        db.commit()
        return job_id
    except Exception:
        db.rollback()
        connection = db.query(OneCConnection).filter(OneCConnection.id == connection_id).first()
        if connection:
            connection.last_sync_at = _utcnow()
            connection.last_sync_status = "failed"
            connection.last_sync_message = _truncate_error()
            db.commit()
        raise
    finally:
        db.close()


async def _run_connection_sync(db: Session, connection: OneCConnection) -> int:
    report_type = "cash_flow"
    rows: list[dict[str, Any]] = []
    if connection.connection_type == "http_api":
        client = OneCHTTPClient(connection)
        await client.ping()
        rows = await client.get_recent_transactions(hours_back=max(24, connection.sync_interval_minutes))
        report_type = "cash_flow"
    elif connection.connection_type == "database":
        connector = OneCDatabaseConnector(connection)
        await connector.connect()
        rows = await connector.get_transactions(_utcnow().date() - timedelta(days=30), _utcnow().date())
        report_type = "cash_flow"
    else:
        raise HTTPException(status_code=422, detail="File-only connections do not support scheduled sync.")

    job = OneCImportJob(
        company_id=connection.company_id,
        connection_id=connection.id,
        filename=f"sync-{connection.connection_type}-{_utcnow().strftime('%Y%m%d%H%M%S')}.json",
        storage_path="__sync__",
        mime_type="application/json",
        source_hint=connection.connection_type,
        file_size_bytes=0,
        report_type=report_type,
        status="processing",
        imported_by=connection.created_by or "system",
    )
    db.add(job)
    db.flush()

    normalized_rows = _normalize_rows(report_type, rows, company_id=connection.company_id)
    existing_hashes = {value for (value,) in db.query(OneCRecord.import_hash).filter(OneCRecord.company_id == connection.company_id).all()}
    created = 0
    for raw_row, normalized in zip(rows, normalized_rows):
        deduped = await NORMALIZER.deduplicate([normalized], existing_hashes, record_type=_record_type_for_report(report_type))
        normalized_payload = deduped[0]
        import_hash = normalized_payload.pop("import_hash")
        if normalized_payload.pop("is_duplicate", False):
            continue
        record = OneCRecord(
            import_job_id=job.id,
            company_id=connection.company_id,
            record_type=_record_type_for_report(report_type),
            raw_data=_json_safe(raw_row),
            normalized_data=_json_safe(normalized_payload),
            benela_table=_benela_table_for_record_type(_record_type_for_report(report_type)),
            import_hash=import_hash,
            row_status="ready",
        )
        db.add(record)
        existing_hashes.add(import_hash)
        created += 1

    job.report_type = report_type
    job.records_parsed = len(rows)
    job.records_imported = 0
    job.records_skipped = max(0, len(rows) - created)
    job.records_failed = 0
    job.status = "completed"
    job.completed_at = _utcnow()
    imported, skipped, failed = confirm_import_job(db, job.id)
    connection.last_sync_at = _utcnow()
    connection.last_sync_status = "completed"
    connection.last_sync_message = f"Imported {imported} rows, skipped {skipped}, failed {failed}."
    return job.id


def _normalize_rows(report_type: str, rows: list[dict], *, company_id: int) -> list[dict]:
    if report_type in {"cash_flow", "account_card"}:
        return asyncio.run(NORMALIZER.to_transactions(rows, company_id))
    if report_type == "sales":
        return asyncio.run(NORMALIZER.to_invoices(rows, company_id))
    if report_type == "payroll":
        return asyncio.run(NORMALIZER.to_employees(rows, company_id))
    if report_type == "inventory":
        return asyncio.run(NORMALIZER.to_inventory(rows, company_id))
    return [dict(row, company_id=company_id) for row in rows]


def _record_type_for_report(report_type: str) -> str:
    mapping = {
        "cash_flow": "transaction",
        "account_card": "transaction",
        "sales": "invoice",
        "inventory": "inventory_item",
        "payroll": "employee",
        "counterparties": "counterparty",
        "trial_balance": "trial_balance",
        "account_analysis": "trial_balance",
        "reconciliation": "reconciliation",
    }
    return mapping.get(report_type, report_type)


def _benela_table_for_record_type(record_type: str) -> str | None:
    mapping = {
        "transaction": "transactions",
        "invoice": "invoices",
        "employee": "employees",
    }
    return mapping.get(record_type)


def _json_safe(payload: dict[str, Any]) -> dict[str, Any]:
    def convert(value: Any) -> Any:
        if isinstance(value, dict):
            return {str(key): convert(item) for key, item in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [convert(item) for item in value]
        if isinstance(value, Decimal):
            if value.is_nan() or not value.is_finite():
                return None
            return float(value)
        if isinstance(value, float):
            if math.isnan(value) or math.isinf(value):
                return None
            return value
        if isinstance(value, datetime):
            return value.isoformat()
        if hasattr(value, "isoformat"):
            try:
                return value.isoformat()
            except Exception:
                return value
        return value

    return {str(key): convert(value) for key, value in payload.items()}
