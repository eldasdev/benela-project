from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl


OneCReportType = Literal[
    "unknown",
    "trial_balance",
    "cash_flow",
    "sales",
    "counterparties",
    "inventory",
    "payroll",
    "account_card",
    "account_analysis",
    "reconciliation",
]

OneCConnectionType = Literal["file", "database", "http_api"]
OneCJobStatus = Literal["pending", "processing", "completed", "failed", "cancelled"]
OneCRecordStatus = Literal["ready", "duplicate", "failed", "imported", "skipped"]


class OneCUploadResponse(BaseModel):
    status: Literal["pending"]
    job_id: int
    message: str


class OneCImportJobOut(BaseModel):
    id: int
    company_id: int
    connection_id: int | None = None
    filename: str
    mime_type: str | None = None
    file_size_bytes: int
    report_type: str
    status: str
    records_parsed: int
    records_imported: int
    records_skipped: int
    records_failed: int
    anomaly_count: int
    error_message: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    imported_by: str
    created_at: datetime
    completed_at: datetime | None = None
    confirmed_at: datetime | None = None

    model_config = {"from_attributes": True}


class OneCRecordOut(BaseModel):
    id: int
    import_job_id: int
    company_id: int
    record_type: str
    raw_data: dict[str, Any]
    normalized_data: dict[str, Any]
    benela_record_id: int | None = None
    benela_table: str | None = None
    import_hash: str
    row_status: str
    error_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class OneCConfirmResponse(BaseModel):
    status: Literal["success"]
    imported: int
    skipped: int
    failed: int
    message: str


class OneCConnectionBase(BaseModel):
    connection_type: OneCConnectionType
    connection_label: str | None = None
    db_host: str | None = None
    db_port: int | None = None
    db_name: str | None = None
    db_username: str | None = None
    db_password: str | None = None
    db_type: Literal["postgresql", "mssql", "file_1cd"] | None = None
    api_base_url: HttpUrl | None = None
    api_username: str | None = None
    api_password: str | None = None
    api_version: str | None = None
    sync_enabled: bool = False
    sync_interval_minutes: int = Field(default=1440, ge=60, le=10080)
    is_active: bool = True


class OneCConnectionCreate(OneCConnectionBase):
    pass


class OneCConnectionUpdate(BaseModel):
    connection_label: str | None = None
    db_host: str | None = None
    db_port: int | None = None
    db_name: str | None = None
    db_username: str | None = None
    db_password: str | None = None
    db_type: Literal["postgresql", "mssql", "file_1cd"] | None = None
    api_base_url: HttpUrl | None = None
    api_username: str | None = None
    api_password: str | None = None
    api_version: str | None = None
    sync_enabled: bool | None = None
    sync_interval_minutes: int | None = Field(default=None, ge=60, le=10080)
    is_active: bool | None = None


class OneCConnectionOut(BaseModel):
    id: int
    company_id: int
    connection_type: str
    connection_label: str | None = None
    db_port: int | None = None
    db_name: str | None = None
    db_type: str | None = None
    api_base_url: str | None = None
    api_version: str | None = None
    sync_enabled: bool
    sync_interval_minutes: int
    last_sync_at: datetime | None = None
    last_sync_status: str | None = None
    last_sync_message: str | None = None
    is_active: bool
    masked_db_host: str | None = None
    masked_db_username: str | None = None
    masked_api_username: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OneCConnectionTestResponse(BaseModel):
    status: Literal["success", "failed"]
    reachable: bool
    read_only: bool | None = None
    detail: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class OneCOverviewOut(BaseModel):
    company_id: int
    has_data: bool
    has_active_connection: bool
    connection_type: str | None = None
    connection_label: str | None = None
    last_sync_at: datetime | None = None
    last_sync_status: str | None = None
    latest_job: OneCImportJobOut | None = None
    total_jobs: int
    total_records: int
    imported_records: int
    ready_records: int
    duplicate_records: int
    failed_records: int
    anomaly_count: int
    coverage_period_start: date | None = None
    coverage_period_end: date | None = None
    anomalies: list[str] = Field(default_factory=list)


class OneCSyncResponse(BaseModel):
    status: Literal["pending", "success"]
    connection_id: int
    message: str
    job_id: int | None = None


class OneCCommentaryContext(BaseModel):
    label: str
    value: str
