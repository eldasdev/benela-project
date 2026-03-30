from __future__ import annotations

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text, Index
from sqlalchemy.sql import func

from database.connection import Base


class OneCImportJob(Base):
    __tablename__ = "onec_import_jobs"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False, index=True)
    connection_id = Column(Integer, ForeignKey("onec_connections.id", ondelete="SET NULL"), nullable=True, index=True)
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(500), nullable=False)
    mime_type = Column(String(120), nullable=True)
    source_hint = Column(String(50), nullable=True)
    file_size_bytes = Column(Integer, nullable=False, default=0)
    report_type = Column(String(80), nullable=False, default="unknown")
    status = Column(String(40), nullable=False, default="pending", index=True)
    records_parsed = Column(Integer, nullable=False, default=0)
    records_imported = Column(Integer, nullable=False, default=0)
    records_skipped = Column(Integer, nullable=False, default=0)
    records_failed = Column(Integer, nullable=False, default=0)
    anomaly_count = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    imported_by = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)


class OneCRecord(Base):
    __tablename__ = "onec_raw_records"

    id = Column(Integer, primary_key=True, index=True)
    import_job_id = Column(Integer, ForeignKey("onec_import_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False, index=True)
    record_type = Column(String(80), nullable=False, index=True)
    raw_data = Column(JSON, nullable=False)
    normalized_data = Column(JSON, nullable=False)
    benela_record_id = Column(Integer, nullable=True)
    benela_table = Column(String(80), nullable=True)
    import_hash = Column(String(64), nullable=False, index=True)
    row_status = Column(String(40), nullable=False, default="ready", index=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())


class OneCConnection(Base):
    __tablename__ = "onec_connections"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False, index=True)
    connection_type = Column(String(40), nullable=False)
    connection_label = Column(String(120), nullable=True)

    db_host = Column(String(500), nullable=True)
    db_port = Column(Integer, nullable=True)
    db_name = Column(String(255), nullable=True)
    db_username = Column(String(500), nullable=True)
    db_password = Column(String(500), nullable=True)
    db_type = Column(String(40), nullable=True)

    api_base_url = Column(String(500), nullable=True)
    api_username = Column(String(500), nullable=True)
    api_password = Column(String(500), nullable=True)
    api_version = Column(String(40), nullable=True)

    sync_enabled = Column(Boolean, nullable=False, default=False)
    sync_interval_minutes = Column(Integer, nullable=False, default=1440)
    last_sync_at = Column(DateTime, nullable=True)
    last_sync_status = Column(String(40), nullable=True)
    last_sync_message = Column(Text, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


Index("idx_onec_raw_records_company_id", OneCRecord.company_id)
Index("idx_onec_raw_records_import_job", OneCRecord.import_job_id)
Index("idx_onec_raw_records_hash", OneCRecord.import_hash)
Index("idx_onec_import_jobs_company", OneCImportJob.company_id, OneCImportJob.created_at)
Index("idx_onec_connections_company", OneCConnection.company_id, OneCConnection.is_active)
