from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database.connection import get_db
from database.onec_models import OneCConnection, OneCImportJob, OneCRecord
from database.onec_schemas import (
    OneCConfirmResponse,
    OneCConnectionCreate,
    OneCConnectionOut,
    OneCConnectionTestResponse,
    OneCConnectionUpdate,
    OneCImportJobOut,
    OneCOverviewOut,
    OneCRecordOut,
    OneCSyncResponse,
    OneCUploadResponse,
)
from integrations.onec.db_connector import OneCDatabaseConnector
from integrations.onec.file_parser import validate_uploaded_file
from integrations.onec.http_client import OneCHTTPClient
from integrations.onec.processor import confirm_import_job, process_import_job, rollback_import_job, run_connection_sync
from integrations.onec.service import (
    ONEC_STORAGE_ROOT,
    build_job_storage_path,
    build_overview,
    enforce_sync_rate_limit,
    enforce_upload_rate_limit,
    resolve_company_account,
    serialize_connection,
    upsert_connection_fields,
)
from core.config import settings

router = APIRouter(prefix="/onec", tags=["1C Integration"])


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


@router.get("/overview", response_model=OneCOverviewOut)
def get_onec_overview(
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    account = resolve_company_account(request, db, company_id=company_id)
    return build_overview(db, account.client_org_id)


@router.post("/import/upload", response_model=OneCUploadResponse)
async def upload_import_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    company_id: int | None = Query(default=None),
    report_type_hint: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    account = resolve_company_account(request, db, company_id=company_id)
    enforce_upload_rate_limit(db, account.client_org_id)
    payload = await file.read()
    validate_uploaded_file(
        file_name=file.filename or "",
        content_type=file.content_type,
        payload=payload,
        max_upload_mb=settings.ONEC_MAX_UPLOAD_MB,
    )
    job = OneCImportJob(
        company_id=account.client_org_id,
        filename=file.filename or "upload.bin",
        storage_path="",
        mime_type=file.content_type,
        source_hint="file",
        file_size_bytes=len(payload),
        report_type=(report_type_hint or "unknown").strip() or "unknown",
        status="pending",
        imported_by=account.user_id,
    )
    db.add(job)
    db.flush()
    storage_path = build_job_storage_path(job.id, file.filename or "upload.bin")
    storage_path.write_bytes(payload)
    job.storage_path = str(storage_path)
    db.commit()
    background_tasks.add_task(process_import_job, job.id)
    return OneCUploadResponse(status="pending", job_id=job.id, message="Processing started. Check the import job for status.")


@router.get("/import/jobs", response_model=list[OneCImportJobOut])
def list_import_jobs(
    request: Request,
    company_id: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=300),
    db: Session = Depends(get_db),
):
    account = resolve_company_account(request, db, company_id=company_id)
    return (
        db.query(OneCImportJob)
        .filter(
            OneCImportJob.company_id == account.client_org_id,
            OneCImportJob.source_hint != "ai_query",
        )
        .order_by(OneCImportJob.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/import/jobs/{job_id}", response_model=OneCImportJobOut)
def get_import_job(job_id: int, request: Request, company_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    account = resolve_company_account(request, db, company_id=company_id)
    job = (
        db.query(OneCImportJob)
        .filter(
            OneCImportJob.id == job_id,
            OneCImportJob.company_id == account.client_org_id,
            OneCImportJob.source_hint != "ai_query",
        )
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="1C import job not found.")
    return job


@router.get("/import/jobs/{job_id}/records")
def list_import_records(
    job_id: int,
    request: Request,
    company_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
):
    account = resolve_company_account(request, db, company_id=company_id)
    job = (
        db.query(OneCImportJob)
        .filter(
            OneCImportJob.id == job_id,
            OneCImportJob.company_id == account.client_org_id,
            OneCImportJob.source_hint != "ai_query",
        )
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="1C import job not found.")
    query = db.query(OneCRecord).filter(OneCRecord.import_job_id == job.id, OneCRecord.company_id == account.client_org_id)
    if status_filter:
        query = query.filter(OneCRecord.row_status == status_filter)
    total = query.count()
    items = query.order_by(OneCRecord.id.asc()).offset((page - 1) * per_page).limit(per_page).all()
    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "items": [OneCRecordOut.model_validate(item).model_dump() for item in items],
    }


@router.post("/import/jobs/{job_id}/confirm", response_model=OneCConfirmResponse)
def confirm_import(job_id: int, request: Request, company_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    account = resolve_company_account(request, db, company_id=company_id)
    job = (
        db.query(OneCImportJob)
        .filter(
            OneCImportJob.id == job_id,
            OneCImportJob.company_id == account.client_org_id,
            OneCImportJob.source_hint != "ai_query",
        )
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="1C import job not found.")
    imported, skipped, failed = confirm_import_job(db, job.id)
    db.commit()
    return OneCConfirmResponse(status="success", imported=imported, skipped=skipped, failed=failed, message="Import completed")


@router.delete("/import/jobs/{job_id}")
def delete_import(job_id: int, request: Request, company_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    account = resolve_company_account(request, db, company_id=company_id)
    job = (
        db.query(OneCImportJob)
        .filter(
            OneCImportJob.id == job_id,
            OneCImportJob.company_id == account.client_org_id,
            OneCImportJob.source_hint != "ai_query",
        )
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="1C import job not found.")
    rollback_import_job(db, job.id)
    db.commit()
    return {"status": "success", "message": "Import job removed."}


@router.get("/import/template/{report_type}")
def download_template(report_type: str, format: str = Query(default="xlsx", pattern="^(xlsx|csv)$")):
    templates = {
        "cash_flow": pd.DataFrame([
            {"Дата": "15.03.2026", "Сумма": "1 250 000,00", "Контрагент": "OOO Atlas", "Назначение платежа": "Оплата по договору", "Статья ДДС": "Операционная деятельность", "Вид операции": "Поступление"},
            {"Дата": "16.03.2026", "Сумма": "-420 000,00", "Контрагент": "OOO Supply", "Назначение платежа": "Оплата поставщику", "Статья ДДС": "Закупки", "Вид операции": "Расход"},
        ]),
        "sales": pd.DataFrame([
            {"Дата": "15.03.2026", "Номер документа": "REAL-001", "Контрагент": "Textile Group", "Номенклатура": "Fabric Roll", "Количество": 12, "Цена": "650 000,00", "НДС": "12 000,00"},
        ]),
        "inventory": pd.DataFrame([
            {"Товар": "Cotton Yarn", "Склад": "Омбор 1", "Единица": "кг", "Начальный остаток": 1200, "Приход": 200, "Расход": 150, "Конечный остаток": 1250},
        ]),
        "payroll": pd.DataFrame([
            {"Сотрудник": "A. Karimov", "Должность": "Accountant", "Подразделение": "Finance", "Начислено": "4 500 000,00", "Удержано": "540 000,00", "К выплате": "3 960 000,00"},
        ]),
    }
    frame = templates.get(report_type)
    if frame is None:
        raise HTTPException(status_code=404, detail="Unknown 1C template type.")
    if format == "csv":
        content = frame.to_csv(index=False).encode("utf-8")
        return Response(content=content, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="onec-{report_type}-template.csv"'})
    buffer = BytesIO()
    frame.to_excel(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="onec-{report_type}-template.xlsx"'})


@router.get("/connections", response_model=list[OneCConnectionOut])
def list_connections(request: Request, company_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    account = resolve_company_account(request, db, company_id=company_id)
    rows = db.query(OneCConnection).filter(OneCConnection.company_id == account.client_org_id).order_by(OneCConnection.updated_at.desc()).all()
    return [serialize_connection(row) for row in rows]


@router.post("/connections", response_model=OneCConnectionOut)
def create_connection(payload: OneCConnectionCreate, request: Request, company_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    account = resolve_company_account(request, db, company_id=company_id)
    connection = OneCConnection(company_id=account.client_org_id, created_by=account.user_id)
    upsert_connection_fields(connection, payload.model_dump(exclude_none=True), partial=False)
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return serialize_connection(connection)


@router.put("/connections/{connection_id}", response_model=OneCConnectionOut)
def update_connection(connection_id: int, payload: OneCConnectionUpdate, request: Request, company_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    account = resolve_company_account(request, db, company_id=company_id)
    connection = db.query(OneCConnection).filter(OneCConnection.id == connection_id, OneCConnection.company_id == account.client_org_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="1C connection not found.")
    upsert_connection_fields(connection, payload.model_dump(exclude_unset=True, exclude_none=False), partial=True)
    connection.updated_at = _utcnow()
    db.commit()
    db.refresh(connection)
    return serialize_connection(connection)


@router.delete("/connections/{connection_id}")
def delete_connection(connection_id: int, request: Request, company_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    account = resolve_company_account(request, db, company_id=company_id)
    connection = db.query(OneCConnection).filter(OneCConnection.id == connection_id, OneCConnection.company_id == account.client_org_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="1C connection not found.")
    db.delete(connection)
    db.commit()
    return {"status": "success", "message": "Connection removed."}


@router.post("/connections/{connection_id}/test", response_model=OneCConnectionTestResponse)
async def test_connection(connection_id: int, request: Request, company_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    account = resolve_company_account(request, db, company_id=company_id)
    connection = db.query(OneCConnection).filter(OneCConnection.id == connection_id, OneCConnection.company_id == account.client_org_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="1C connection not found.")
    try:
        if connection.connection_type == "http_api":
            client = OneCHTTPClient(connection)
            reachable = await client.ping()
            return OneCConnectionTestResponse(status="success", reachable=reachable, detail="1C HTTP service is reachable.", metadata={"base_url": connection.api_base_url})
        if connection.connection_type == "database":
            connector = OneCDatabaseConnector(connection)
            reachable = await connector.connect()
            tables = await connector.get_1c_tables()
            return OneCConnectionTestResponse(status="success", reachable=reachable, read_only=connector.read_only, detail="1C database connection is reachable and read-only.", metadata={"tables_detected": len(tables), "sample_tables": tables[:10]})
        return OneCConnectionTestResponse(status="success", reachable=True, detail="File import bridge is ready. Upload-based imports do not require connection testing.")
    except HTTPException as exc:
        return OneCConnectionTestResponse(status="failed", reachable=False, detail=str(exc.detail), metadata={})
    except Exception as exc:
        return OneCConnectionTestResponse(status="failed", reachable=False, detail=str(exc), metadata={})


@router.post("/connections/{connection_id}/sync", response_model=OneCSyncResponse)
def sync_connection(connection_id: int, request: Request, background_tasks: BackgroundTasks, company_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    account = resolve_company_account(request, db, company_id=company_id)
    connection = db.query(OneCConnection).filter(OneCConnection.id == connection_id, OneCConnection.company_id == account.client_org_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="1C connection not found.")
    enforce_sync_rate_limit(connection)
    connection.last_sync_at = _utcnow()
    connection.last_sync_status = "processing"
    connection.last_sync_message = "Background sync started."
    db.commit()
    background_tasks.add_task(run_connection_sync, connection.id)
    return OneCSyncResponse(status="pending", connection_id=connection.id, message="1C sync started.")
