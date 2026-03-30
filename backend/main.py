import logging
import os
import time
import threading
from datetime import date, datetime, timedelta
from typing import Callable
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text, inspect, func
from sqlalchemy.exc import DBAPIError, SQLAlchemyError, TimeoutError as SATimeoutError
from core.auth import require_admin_user, require_authenticated_user, require_client_user
from core.config import settings
from api.agents import router as agents_router
from api.finance import router as finance_router
from api.sales import router as sales_router
from api.support import router as support_router
from api.supply_chain import router as supply_chain_router
from api.procurement import router as procurement_router
from api.insights import router as insights_router
from api.hr import router as hr_router
from api.hr_attendance import router as hr_attendance_router
from api.projects import router as projects_router
from api.marketing import router as marketing_router
from api.legal import router as legal_router
from api.admin import router as admin_router
from api.marketplace import router as marketplace_router
from api.dashboard import router as dashboard_router
from api.chat import router as chat_router
from api.notifications import router as notifications_router
from api.client_account import router as client_account_router
from api.internal_chat import router as internal_chat_router
from api.internal_chat import dispatch_due_reminders_job, process_telegram_bot_updates_job
from api.onec import router as onec_router
from api.platform_content import router as platform_content_router
from integrations.attendance.attendance_service import attendance_service
from integrations.onec.scheduler import sync_all_active_connections
from database.connection import Base, engine, SessionLocal
from database.models import (
    ClientOrg,
    Transaction,
    Invoice,
    SalesProduct,
    SalesOrder,
    SalesOrderItem,
    SalesInventoryAdjustment,
    SupportTicket,
    SupplyChainItem,
    SupplyChainShipment,
    ProcurementRequest,
    InsightReport,
    MarketingCampaign,
    MarketingContentItem,
    MarketingLead,
    MarketingChannelMetric,
    LegalDocument,
    LegalContract,
    LegalComplianceTask,
    LegalSearchLog,
    ChatMessage,
    ChatAttachment,
    InternalChatThread,
    InternalChatParticipant,
    InternalChatMessage,
    InternalChatAttachment,
    InternalChatTask,
    InternalChatTaskReminder,
    InternalChatTelegramLink,
    InternalChatZoomLink,
    ClientWorkspaceAccount,
    ClientBusinessDocument,
    ClientPlatformReport,
    AdminNotification,
    NotificationTarget,
    NotificationType,
    AITrainerProfile,
    AITrainerSource,
    AITrainerChunk,
    PlatformSettings,
    PlatformAboutPage,
    PlatformBlogPost,
    PlatformBlogComment,
)
from database.onec_models import OneCConnection, OneCImportJob, OneCRecord
from database.attendance_models import AttendanceRecord, QRToken, OfficeLocation, LeaveRequest, PayrollRecord, UzbekHoliday

logger = logging.getLogger("uvicorn.error")
_db_bootstrap_ok = False
_attendance_schema_ready = False
_reminder_worker_thread = None
_reminder_worker_stop_event = threading.Event()
_onec_sync_worker_thread = None
_onec_sync_worker_stop_event = threading.Event()
_attendance_worker_thread = None
_attendance_worker_stop_event = threading.Event()
_telegram_updates_offset = None
_maintenance_state_lock = threading.Lock()
_maintenance_state_checked_at = 0.0
_maintenance_state_cached = False
_MAINTENANCE_CACHE_TTL_SECONDS = max(1.0, float(os.getenv("MAINTENANCE_MODE_CACHE_SECONDS", "5")))
TASHKENT_TZ = ZoneInfo("Asia/Tashkent")
_MAINTENANCE_EXACT_PATHS = {
    "/docs",
    "/openapi.json",
    "/redoc",
    "/platform/about",
    "/platform/pricing-plans",
    "/platform/runtime",
    "/api/platform/about",
    "/api/platform/pricing-plans",
    "/api/platform/runtime",
}
_MAINTENANCE_PREFIXES = ("/admin", "/api/admin")


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _cors_origins() -> list[str]:
    defaults = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://benela.dev",
        "https://www.benela.dev",
        "https://benela-frontend-vtjir.ondigitalocean.app",
    ]
    extra_raw = os.getenv("CORS_ALLOW_ORIGINS", "")
    extra = [item.strip() for item in extra_raw.replace(";", ",").split(",") if item.strip()]
    seen: set[str] = set()
    merged: list[str] = []
    for value in [*defaults, *extra]:
        if value in seen:
            continue
        seen.add(value)
        merged.append(value)
    return merged


def _should_auto_create_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_TABLES", False)
    # Safe default: disabled unless explicitly enabled.
    return False


def _should_auto_create_marketing_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_MARKETING_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_MARKETING_TABLES", True)
    # Keep marketing module usable by default even when full create_all is disabled.
    return True


def _should_auto_create_sales_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_SALES_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_SALES_TABLES", True)
    # Keep sales module usable by default even when full create_all is disabled.
    return True


def _ensure_sales_schema():
    SalesProduct.__table__.create(bind=engine, checkfirst=True)
    SalesOrder.__table__.create(bind=engine, checkfirst=True)
    SalesOrderItem.__table__.create(bind=engine, checkfirst=True)
    SalesInventoryAdjustment.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_support_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_SUPPORT_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_SUPPORT_TABLES", True)
    return True


def _ensure_support_schema():
    SupportTicket.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_supply_chain_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_SUPPLY_CHAIN_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_SUPPLY_CHAIN_TABLES", True)
    return True


def _ensure_supply_chain_schema():
    SupplyChainItem.__table__.create(bind=engine, checkfirst=True)
    SupplyChainShipment.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_procurement_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_PROCUREMENT_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_PROCUREMENT_TABLES", True)
    return True


def _ensure_procurement_schema():
    ProcurementRequest.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_insights_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_INSIGHTS_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_INSIGHTS_TABLES", True)
    return True


def _ensure_insights_schema():
    InsightReport.__table__.create(bind=engine, checkfirst=True)


def _ensure_marketing_schema():
    MarketingCampaign.__table__.create(bind=engine, checkfirst=True)
    MarketingContentItem.__table__.create(bind=engine, checkfirst=True)
    MarketingLead.__table__.create(bind=engine, checkfirst=True)
    MarketingChannelMetric.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_legal_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_LEGAL_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_LEGAL_TABLES", True)
    # Keep legal module usable by default even when full create_all is disabled.
    return True


def _ensure_legal_schema():
    LegalDocument.__table__.create(bind=engine, checkfirst=True)
    LegalContract.__table__.create(bind=engine, checkfirst=True)
    LegalComplianceTask.__table__.create(bind=engine, checkfirst=True)
    LegalSearchLog.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_chat_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_CHAT_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_CHAT_TABLES", True)
    # Keep chat features usable by default even when full create_all is disabled.
    return True


def _ensure_chat_schema():
    ChatMessage.__table__.create(bind=engine, checkfirst=True)
    ChatAttachment.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_internal_chat_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_INTERNAL_CHAT_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_INTERNAL_CHAT_TABLES", True)
    return True


def _ensure_internal_chat_schema():
    InternalChatThread.__table__.create(bind=engine, checkfirst=True)
    InternalChatParticipant.__table__.create(bind=engine, checkfirst=True)
    InternalChatMessage.__table__.create(bind=engine, checkfirst=True)
    InternalChatAttachment.__table__.create(bind=engine, checkfirst=True)
    InternalChatTask.__table__.create(bind=engine, checkfirst=True)
    InternalChatTaskReminder.__table__.create(bind=engine, checkfirst=True)
    InternalChatTelegramLink.__table__.create(bind=engine, checkfirst=True)
    InternalChatZoomLink.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_ai_trainer_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_AI_TRAINER_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_AI_TRAINER_TABLES", True)
    # Keep super-admin AI Trainer module usable by default.
    return True


def _ensure_ai_trainer_schema():
    AITrainerProfile.__table__.create(bind=engine, checkfirst=True)
    AITrainerSource.__table__.create(bind=engine, checkfirst=True)
    AITrainerChunk.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_client_account_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_CLIENT_ACCOUNT_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_CLIENT_ACCOUNT_TABLES", True)
    return True


def _ensure_client_account_schema():
    ClientWorkspaceAccount.__table__.create(bind=engine, checkfirst=True)
    ClientBusinessDocument.__table__.create(bind=engine, checkfirst=True)
    ClientPlatformReport.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_platform_content_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_PLATFORM_CONTENT_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_PLATFORM_CONTENT_TABLES", True)
    return True


def _ensure_platform_content_schema():
    PlatformSettings.__table__.create(bind=engine, checkfirst=True)
    PlatformAboutPage.__table__.create(bind=engine, checkfirst=True)
    PlatformBlogPost.__table__.create(bind=engine, checkfirst=True)
    PlatformBlogComment.__table__.create(bind=engine, checkfirst=True)

    dialect = engine.dialect.name
    with engine.begin() as conn:
        if dialect == "postgresql":
            conn.execute(
                text(
                    """
                    ALTER TABLE platform_settings
                    ADD COLUMN IF NOT EXISTS pricing_plans JSONB NOT NULL DEFAULT '[]'::jsonb
                    """
                )
            )
        elif dialect == "sqlite":
            columns = {
                row[1]
                for row in conn.execute(text("PRAGMA table_info(platform_settings)")).fetchall()
            }
            if "pricing_plans" not in columns:
                conn.execute(
                    text(
                        """
                        ALTER TABLE platform_settings
                        ADD COLUMN pricing_plans TEXT NOT NULL DEFAULT '[]'
                        """
                    )
                )
        else:
            inspector = inspect(conn)
            column_names = {column["name"] for column in inspector.get_columns("platform_settings")}
            if "pricing_plans" not in column_names:
                conn.execute(
                    text(
                        """
                        ALTER TABLE platform_settings
                        ADD COLUMN pricing_plans JSON NOT NULL DEFAULT ('[]')
                        """
                    )
                )


def _should_auto_create_onec_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_ONEC_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_ONEC_TABLES", True)
    return True


def _ensure_onec_schema():
    OneCConnection.__table__.create(bind=engine, checkfirst=True)
    OneCImportJob.__table__.create(bind=engine, checkfirst=True)
    OneCRecord.__table__.create(bind=engine, checkfirst=True)

    dialect = engine.dialect.name
    with engine.begin() as conn:
        if dialect == "postgresql":
            conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS company_id INTEGER"))
            conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_id INTEGER"))
        elif dialect == "sqlite":
            transaction_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(transactions)")).fetchall()}
            invoice_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(invoices)")).fetchall()}
            if "company_id" not in transaction_columns:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN company_id INTEGER"))
            if "company_id" not in invoice_columns:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN company_id INTEGER"))
        else:
            inspector = inspect(conn)
            transaction_columns = {column["name"] for column in inspector.get_columns("transactions")}
            invoice_columns = {column["name"] for column in inspector.get_columns("invoices")}
            if "company_id" not in transaction_columns:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN company_id INTEGER"))
            if "company_id" not in invoice_columns:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN company_id INTEGER"))


def _should_auto_create_attendance_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_ATTENDANCE_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_ATTENDANCE_TABLES", True)
    return True


def _attendance_holiday_rows() -> list[dict[str, object]]:
    return [
        {"date": date(2025, 1, 1), "name_uz": "Yangi yil", "name_ru": "Новый год", "is_work_day": False},
        {"date": date(2025, 1, 14), "name_uz": "Vatan himoyachilari kuni", "name_ru": "День защитников Отечества", "is_work_day": False},
        {"date": date(2025, 3, 8), "name_uz": "Xalqaro xotin-qizlar kuni", "name_ru": "Международный женский день", "is_work_day": False},
        {"date": date(2025, 3, 21), "name_uz": "Navro'z", "name_ru": "Навруз", "is_work_day": False},
        {"date": date(2025, 3, 30), "name_uz": "Ramazon hayiti", "name_ru": "Ид аль-Фитр", "is_work_day": False},
        {"date": date(2025, 5, 9), "name_uz": "Xotira va qadrlash kuni", "name_ru": "День памяти и почестей", "is_work_day": False},
        {"date": date(2025, 6, 6), "name_uz": "Qurbon hayiti", "name_ru": "Ид аль-Адха", "is_work_day": False},
        {"date": date(2025, 9, 1), "name_uz": "Mustaqillik kuni", "name_ru": "День независимости", "is_work_day": False},
        {"date": date(2025, 10, 1), "name_uz": "O'qituvchi va murabbiylar kuni", "name_ru": "День учителя", "is_work_day": False},
        {"date": date(2025, 12, 8), "name_uz": "Konstitutsiya kuni", "name_ru": "День Конституции", "is_work_day": False},
        {"date": date(2026, 1, 1), "name_uz": "Yangi yil", "name_ru": "Новый год", "is_work_day": False},
        {"date": date(2026, 1, 14), "name_uz": "Vatan himoyachilari kuni", "name_ru": "День защитников Отечества", "is_work_day": False},
        {"date": date(2026, 3, 8), "name_uz": "Xalqaro xotin-qizlar kuni", "name_ru": "Международный женский день", "is_work_day": False},
        {"date": date(2026, 3, 20), "name_uz": "Ramazon hayiti", "name_ru": "Ид аль-Фитр", "is_work_day": False},
        {"date": date(2026, 3, 21), "name_uz": "Navro'z", "name_ru": "Навруз", "is_work_day": False},
        {"date": date(2026, 5, 27), "name_uz": "Qurbon hayiti", "name_ru": "Ид аль-Адха", "is_work_day": False},
        {"date": date(2026, 5, 9), "name_uz": "Xotira va qadrlash kuni", "name_ru": "День памяти и почестей", "is_work_day": False},
        {"date": date(2026, 9, 1), "name_uz": "Mustaqillik kuni", "name_ru": "День независимости", "is_work_day": False},
        {"date": date(2026, 10, 1), "name_uz": "O'qituvchi va murabbiylar kuni", "name_ru": "День учителя", "is_work_day": False},
        {"date": date(2026, 12, 8), "name_uz": "Konstitutsiya kuni", "name_ru": "День Конституции", "is_work_day": False},
    ]


def _is_attendance_schema_ready() -> bool:
    required_tables = {
        OfficeLocation.__tablename__,
        UzbekHoliday.__tablename__,
        QRToken.__tablename__,
        LeaveRequest.__tablename__,
        AttendanceRecord.__tablename__,
        PayrollRecord.__tablename__,
    }
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
    except DBAPIError:
        return False
    return required_tables.issubset(existing_tables)


def _seed_attendance_holidays() -> None:
    session = SessionLocal()
    try:
        existing_dates = {row.date for row in session.query(UzbekHoliday.date).all()}
        for payload in _attendance_holiday_rows():
            if payload["date"] in existing_dates:
                continue
            session.add(UzbekHoliday(**payload))
        session.commit()
    finally:
        session.close()


def _ensure_attendance_schema():
    global _attendance_schema_ready

    attendance_tables = [
        OfficeLocation.__table__,
        UzbekHoliday.__table__,
        QRToken.__table__,
        LeaveRequest.__table__,
        AttendanceRecord.__table__,
        PayrollRecord.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=attendance_tables, checkfirst=True)

    dialect = engine.dialect.name
    with engine.begin() as conn:
        if dialect == "postgresql":
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS company_id INTEGER"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_pin VARCHAR(255)"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_start TIME"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_end TIME"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS late_grace_minutes INTEGER NOT NULL DEFAULT 15"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS hourly_rate DOUBLE PRECISION"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_type VARCHAR(40) NOT NULL DEFAULT 'monthly'"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(255)"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(80)"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(120)"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS telegram_first_name VARCHAR(120)"))
            conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMP WITHOUT TIME ZONE"))
        elif dialect == "sqlite":
            employee_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(employees)")).fetchall()}
            statements = {
                "company_id": "ALTER TABLE employees ADD COLUMN company_id INTEGER",
                "employee_pin": "ALTER TABLE employees ADD COLUMN employee_pin VARCHAR(255)",
                "shift_start": "ALTER TABLE employees ADD COLUMN shift_start TIME",
                "shift_end": "ALTER TABLE employees ADD COLUMN shift_end TIME",
                "late_grace_minutes": "ALTER TABLE employees ADD COLUMN late_grace_minutes INTEGER NOT NULL DEFAULT 15",
                "hourly_rate": "ALTER TABLE employees ADD COLUMN hourly_rate FLOAT",
                "contract_type": "ALTER TABLE employees ADD COLUMN contract_type VARCHAR(40) NOT NULL DEFAULT 'monthly'",
                "work_days": "ALTER TABLE employees ADD COLUMN work_days JSON NOT NULL DEFAULT '[1,2,3,4,5]'",
                "device_fingerprint": "ALTER TABLE employees ADD COLUMN device_fingerprint VARCHAR(255)",
                "telegram_chat_id": "ALTER TABLE employees ADD COLUMN telegram_chat_id VARCHAR(80)",
                "telegram_username": "ALTER TABLE employees ADD COLUMN telegram_username VARCHAR(120)",
                "telegram_first_name": "ALTER TABLE employees ADD COLUMN telegram_first_name VARCHAR(120)",
                "telegram_linked_at": "ALTER TABLE employees ADD COLUMN telegram_linked_at DATETIME",
            }
            for column_name, statement in statements.items():
                if column_name not in employee_columns:
                    conn.execute(text(statement))
        else:
            inspector = inspect(conn)
            employee_columns = {column["name"] for column in inspector.get_columns("employees")}
            fallback_statements = {
                "company_id": "ALTER TABLE employees ADD COLUMN company_id INTEGER",
                "employee_pin": "ALTER TABLE employees ADD COLUMN employee_pin VARCHAR(255)",
                "shift_start": "ALTER TABLE employees ADD COLUMN shift_start TIME",
                "shift_end": "ALTER TABLE employees ADD COLUMN shift_end TIME",
                "late_grace_minutes": "ALTER TABLE employees ADD COLUMN late_grace_minutes INTEGER NOT NULL DEFAULT 15",
                "hourly_rate": "ALTER TABLE employees ADD COLUMN hourly_rate FLOAT",
                "contract_type": "ALTER TABLE employees ADD COLUMN contract_type VARCHAR(40) NOT NULL DEFAULT 'monthly'",
                "work_days": "ALTER TABLE employees ADD COLUMN work_days JSON NOT NULL DEFAULT ('[1,2,3,4,5]')",
                "device_fingerprint": "ALTER TABLE employees ADD COLUMN device_fingerprint VARCHAR(255)",
                "telegram_chat_id": "ALTER TABLE employees ADD COLUMN telegram_chat_id VARCHAR(80)",
                "telegram_username": "ALTER TABLE employees ADD COLUMN telegram_username VARCHAR(120)",
                "telegram_first_name": "ALTER TABLE employees ADD COLUMN telegram_first_name VARCHAR(120)",
                "telegram_linked_at": "ALTER TABLE employees ADD COLUMN telegram_linked_at TIMESTAMP",
            }
            for column_name, statement in fallback_statements.items():
                if column_name not in employee_columns:
                    conn.execute(text(statement))

    _seed_attendance_holidays()
    _attendance_schema_ready = _is_attendance_schema_ready()


def _should_run_internal_chat_reminder_worker() -> bool:
    raw = os.getenv("INTERNAL_CHAT_REMINDER_WORKER_ENABLED")
    if raw is not None:
        return _env_bool("INTERNAL_CHAT_REMINDER_WORKER_ENABLED", True)
    return True


def _should_run_onec_sync_worker() -> bool:
    raw = os.getenv("ONEC_SYNC_WORKER_ENABLED")
    if raw is not None:
        return _env_bool("ONEC_SYNC_WORKER_ENABLED", True)
    return True


def _should_run_attendance_scheduler_worker() -> bool:
    raw = os.getenv("ATTENDANCE_SCHEDULER_ENABLED")
    if raw is not None:
        return _env_bool("ATTENDANCE_SCHEDULER_ENABLED", True)
    return True


def _internal_chat_reminder_worker_loop():
    global _telegram_updates_offset
    poll_seconds = max(15, int(os.getenv("INTERNAL_CHAT_REMINDER_POLL_SECONDS", "30")))
    max_backoff_seconds = max(
        poll_seconds,
        int(os.getenv("INTERNAL_CHAT_REMINDER_MAX_BACKOFF_SECONDS", "300")),
    )
    failure_count = 0
    logger.info(
        "Internal chat reminder worker started (interval=%ss, max_backoff=%ss).",
        poll_seconds,
        max_backoff_seconds,
    )

    while not _reminder_worker_stop_event.is_set():
        wait_seconds = poll_seconds
        db = SessionLocal()
        try:
            _telegram_updates_offset = process_telegram_bot_updates_job(db, _telegram_updates_offset)
            processed = dispatch_due_reminders_job(db)
            force_commit = bool(db.info.pop("force_commit", False))
            if processed or db.new or db.dirty or db.deleted or force_commit:
                db.commit()
                if processed:
                    logger.info("Internal chat reminder worker dispatched %s due reminder(s).", processed)
            else:
                db.rollback()
            failure_count = 0
        except DBAPIError as exc:
            db.rollback()
            failure_count += 1
            wait_seconds = min(max_backoff_seconds, poll_seconds * (2 ** min(6, max(0, failure_count - 1))))
            logger.warning(
                "Internal chat reminder worker DB unavailable (attempt=%s, retry_in=%ss): %s",
                failure_count,
                wait_seconds,
                exc,
            )
            try:
                # Drop stale/invalid pooled sockets before next retry.
                engine.dispose()
            except Exception:
                logger.exception("Failed to dispose SQLAlchemy engine after worker DB failure")
        except Exception:
            db.rollback()
            failure_count += 1
            wait_seconds = min(max_backoff_seconds, poll_seconds * (2 ** min(6, max(0, failure_count - 1))))
            logger.exception(
                "Internal chat reminder worker failed during reminder dispatch (attempt=%s, retry_in=%ss)",
                failure_count,
                wait_seconds,
            )
        finally:
            db.close()

        if _reminder_worker_stop_event.wait(wait_seconds):
            break


def _onec_sync_worker_loop():
    poll_seconds = max(60, int(os.getenv("ONEC_SYNC_WORKER_INTERVAL_SECONDS", "60")))
    logger.info("1C sync worker started (interval=%ss).", poll_seconds)

    while not _onec_sync_worker_stop_event.is_set():
        try:
            dispatched = sync_all_active_connections()
            if dispatched:
                logger.info("1C sync worker dispatched %s scheduled sync job(s).", dispatched)
        except DBAPIError as exc:
            logger.warning("1C sync worker DB unavailable: %s", exc)
            try:
                engine.dispose()
            except Exception:
                logger.exception("Failed to dispose SQLAlchemy engine after 1C sync worker DB failure")
        except Exception:
            logger.exception("1C sync worker failed during scheduled sync dispatch")

        if _onec_sync_worker_stop_event.wait(poll_seconds):
            break


def _local_tashkent_now() -> datetime:
    return datetime.now(TASHKENT_TZ)


def _is_last_day_of_month(value: date) -> bool:
    return (value + timedelta(days=1)).month != value.month


def _send_payroll_reminders(db, current_date: date) -> int:
    rows = (
        db.query(ClientWorkspaceAccount.workspace_id, ClientWorkspaceAccount.client_org_id, ClientOrg.name)
        .join(ClientOrg, ClientOrg.id == ClientWorkspaceAccount.client_org_id)
        .filter(
            ClientWorkspaceAccount.workspace_id.isnot(None),
            ClientWorkspaceAccount.client_org_id.isnot(None),
        )
        .order_by(ClientWorkspaceAccount.id.asc())
        .all()
    )
    created = 0
    seen_workspace_ids: set[str] = set()
    for workspace_id, client_org_id, client_name in rows:
        if not workspace_id or workspace_id in seen_workspace_ids:
            continue
        seen_workspace_ids.add(workspace_id)
        existing = (
            db.query(AdminNotification.id)
            .filter(
                AdminNotification.target == NotificationTarget.specific,
                AdminNotification.target_value == workspace_id,
                AdminNotification.title == "Payroll review reminder",
                func.date(AdminNotification.created_at) == current_date,
            )
            .first()
        )
        if existing:
            continue
        db.add(
            AdminNotification(
                title="Payroll review reminder",
                message=f"Review and approve {client_name}'s payroll before month-end close.",
                type=NotificationType.warning,
                target=NotificationTarget.specific,
                target_value=workspace_id,
                is_sent=True,
                sent_at=attendance_service.utcnow(),
                recipient_count=1,
            )
        )
        created += 1
        if client_org_id:
            log_session = SessionLocal()
            try:
                from database.admin_crud import log_activity
                log_activity(log_session, int(client_org_id), "attendance_payroll_reminder_sent", actor="system", metadata=f"workspace_id={workspace_id}")
            finally:
                log_session.close()
    if created:
        db.commit()
    return created


def _attendance_scheduler_loop():
    global _attendance_schema_ready
    poll_seconds = max(30, int(os.getenv("ATTENDANCE_SCHEDULER_POLL_SECONDS", "60")))
    logger.info("Attendance scheduler worker started (interval=%ss).", poll_seconds)
    last_hourly_cleanup_key: tuple[int, int, int, int] | None = None
    last_absent_mark_key: date | None = None
    last_payroll_reminder_key: date | None = None
    schema_warning_logged = False

    while not _attendance_worker_stop_event.is_set():
        if not _attendance_schema_ready:
            if _is_attendance_schema_ready():
                _attendance_schema_ready = True
                schema_warning_logged = False
                continue
            if not schema_warning_logged:
                logger.warning(
                    "Attendance scheduler is idle because attendance schema is not ready. "
                    "Apply the attendance schema or fix bootstrap before relying on attendance endpoints."
                )
                schema_warning_logged = True
            if _attendance_worker_stop_event.wait(poll_seconds):
                break
            continue

        schema_warning_logged = False
        db = SessionLocal()
        try:
            now_local = _local_tashkent_now()
            cleanup_key = (now_local.year, now_local.month, now_local.day, now_local.hour)
            if cleanup_key != last_hourly_cleanup_key:
                deleted = attendance_service.cleanup_expired_qr_tokens(db)
                last_hourly_cleanup_key = cleanup_key
                if deleted:
                    logger.info("Attendance scheduler deleted %s expired QR token(s).", deleted)

            if now_local.hour >= 20 and last_absent_mark_key != now_local.date():
                company_ids = [row[0] for row in db.query(ClientOrg.id).filter(ClientOrg.is_active.is_(True)).all()]
                marked_total = 0
                for company_id in company_ids:
                    marked_total += attendance_service.bulk_mark_absent(db, int(company_id), now_local.date())
                last_absent_mark_key = now_local.date()
                if marked_total:
                    logger.info("Attendance scheduler created %s absent attendance row(s).", marked_total)

            if _is_last_day_of_month(now_local.date()) and now_local.hour >= 10 and last_payroll_reminder_key != now_local.date():
                reminder_count = _send_payroll_reminders(db, now_local.date())
                last_payroll_reminder_key = now_local.date()
                if reminder_count:
                    logger.info("Attendance scheduler sent %s payroll reminder notification(s).", reminder_count)
        except DBAPIError as exc:
            logger.warning("Attendance scheduler DB unavailable: %s", exc)
            try:
                engine.dispose()
            except Exception:
                logger.exception("Failed to dispose SQLAlchemy engine after attendance scheduler DB failure")
        except Exception:
            logger.exception("Attendance scheduler failed during scheduled attendance job execution")
        finally:
            db.close()

        if _attendance_worker_stop_event.wait(poll_seconds):
            break


app = FastAPI(
    title="Benela AI",
    description="Enterprise Agentic ERP",
    version="0.1.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _is_maintenance_exempt_path(path: str) -> bool:
    if path in _MAINTENANCE_EXACT_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in _MAINTENANCE_PREFIXES)


def _is_maintenance_enabled() -> bool:
    global _maintenance_state_checked_at, _maintenance_state_cached

    now = time.monotonic()
    with _maintenance_state_lock:
        if now - _maintenance_state_checked_at <= _MAINTENANCE_CACHE_TTL_SECONDS:
            return _maintenance_state_cached

    db = SessionLocal()
    try:
        settings_row = db.query(PlatformSettings).first()
        enabled = bool(settings_row and settings_row.maintenance_mode)
    finally:
        db.close()

    with _maintenance_state_lock:
        _maintenance_state_cached = enabled
        _maintenance_state_checked_at = time.monotonic()

    return enabled


@app.middleware("http")
async def maintenance_mode_guard(request: Request, call_next):
    if request.method == "OPTIONS" or _is_maintenance_exempt_path(request.url.path):
        return await call_next(request)

    try:
        if _is_maintenance_enabled():
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "Platform is temporarily unavailable due to scheduled maintenance.",
                    "code": "maintenance_mode_enabled",
                },
                headers={"Retry-After": "300"},
            )
    except Exception:
        logger.exception("Maintenance-mode guard failed; allowing request to continue")

    return await call_next(request)

# Register routes
def _register_routes(prefix: str = ""):
    """
    Register all API routers under the given prefix.
    We expose both root routes (e.g. /dashboard/overview) and prefixed routes
    (e.g. /api/dashboard/overview) to support cloud reverse-proxy setups.
    """
    app.include_router(
        agents_router,
        prefix=f"{prefix}/agents",
        tags=["Agents"],
        dependencies=[Depends(require_authenticated_user)],
    )
    app.include_router(finance_router, prefix=prefix, tags=["Finance"], dependencies=[Depends(require_client_user)])
    app.include_router(sales_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(support_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(supply_chain_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(procurement_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(insights_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(hr_router, prefix=prefix, tags=["HR"], dependencies=[Depends(require_client_user)])
    app.include_router(hr_attendance_router, prefix=prefix)
    app.include_router(projects_router, prefix=prefix, tags=["Projects"], dependencies=[Depends(require_client_user)])
    app.include_router(marketing_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(legal_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(admin_router, prefix=prefix, dependencies=[Depends(require_admin_user)])
    app.include_router(marketplace_router, prefix=prefix, dependencies=[Depends(require_authenticated_user)])
    app.include_router(dashboard_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(chat_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(notifications_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(client_account_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(internal_chat_router, prefix=prefix, dependencies=[Depends(require_authenticated_user)])
    app.include_router(onec_router, prefix=prefix, dependencies=[Depends(require_client_user)])
    app.include_router(platform_content_router, prefix=prefix)


_register_routes("")
_register_routes("/api")


@app.on_event("startup")
def bootstrap_database():
    """
    Best-effort DB bootstrap.
    Do not crash API startup on transient DB outages.
    """
    global _db_bootstrap_ok, _attendance_schema_ready
    _db_bootstrap_ok = False
    _attendance_schema_ready = _is_attendance_schema_ready()

    retries = max(1, int(os.getenv("DB_BOOTSTRAP_RETRIES", "3")))
    delay_seconds = max(0.0, float(os.getenv("DB_BOOTSTRAP_RETRY_DELAY", "2")))

    if not _should_auto_create_tables():
        logger.info("AUTO_CREATE_TABLES disabled; skipping metadata.create_all()")
        targeted_bootstraps: list[tuple[str, Callable[[], None]]] = []
        if _should_auto_create_sales_tables():
            targeted_bootstraps.append(("sales", _ensure_sales_schema))
        else:
            logger.info("AUTO_CREATE_SALES_TABLES disabled; skipping sales schema checks")

        if _should_auto_create_support_tables():
            targeted_bootstraps.append(("support", _ensure_support_schema))
        else:
            logger.info("AUTO_CREATE_SUPPORT_TABLES disabled; skipping support schema checks")

        if _should_auto_create_supply_chain_tables():
            targeted_bootstraps.append(("supply_chain", _ensure_supply_chain_schema))
        else:
            logger.info("AUTO_CREATE_SUPPLY_CHAIN_TABLES disabled; skipping supply chain schema checks")

        if _should_auto_create_procurement_tables():
            targeted_bootstraps.append(("procurement", _ensure_procurement_schema))
        else:
            logger.info("AUTO_CREATE_PROCUREMENT_TABLES disabled; skipping procurement schema checks")

        if _should_auto_create_insights_tables():
            targeted_bootstraps.append(("insights", _ensure_insights_schema))
        else:
            logger.info("AUTO_CREATE_INSIGHTS_TABLES disabled; skipping insights schema checks")

        if _should_auto_create_marketing_tables():
            targeted_bootstraps.append(("marketing", _ensure_marketing_schema))
        else:
            logger.info("AUTO_CREATE_MARKETING_TABLES disabled; skipping marketing schema checks")

        if _should_auto_create_legal_tables():
            targeted_bootstraps.append(("legal", _ensure_legal_schema))
        else:
            logger.info("AUTO_CREATE_LEGAL_TABLES disabled; skipping legal schema checks")

        if _should_auto_create_chat_tables():
            targeted_bootstraps.append(("chat", _ensure_chat_schema))
        else:
            logger.info("AUTO_CREATE_CHAT_TABLES disabled; skipping chat schema checks")

        if _should_auto_create_internal_chat_tables():
            targeted_bootstraps.append(("internal_chat", _ensure_internal_chat_schema))
        else:
            logger.info("AUTO_CREATE_INTERNAL_CHAT_TABLES disabled; skipping internal chat schema checks")

        if _should_auto_create_ai_trainer_tables():
            targeted_bootstraps.append(("ai_trainer", _ensure_ai_trainer_schema))
        else:
            logger.info("AUTO_CREATE_AI_TRAINER_TABLES disabled; skipping AI trainer schema checks")

        if _should_auto_create_client_account_tables():
            targeted_bootstraps.append(("client_account", _ensure_client_account_schema))
        else:
            logger.info("AUTO_CREATE_CLIENT_ACCOUNT_TABLES disabled; skipping client account schema checks")

        if _should_auto_create_platform_content_tables():
            targeted_bootstraps.append(("platform_content", _ensure_platform_content_schema))
        else:
            logger.info("AUTO_CREATE_PLATFORM_CONTENT_TABLES disabled; skipping platform content schema checks")

        if _should_auto_create_onec_tables():
            targeted_bootstraps.append(("onec", _ensure_onec_schema))
        else:
            logger.info("AUTO_CREATE_ONEC_TABLES disabled; skipping 1C integration schema checks")

        if _should_auto_create_attendance_tables():
            targeted_bootstraps.append(("attendance", _ensure_attendance_schema))
        else:
            logger.info("AUTO_CREATE_ATTENDANCE_TABLES disabled; skipping attendance schema checks")

        if not targeted_bootstraps:
            return

        for attempt in range(1, retries + 1):
            try:
                for _, bootstrap_fn in targeted_bootstraps:
                    bootstrap_fn()
                _db_bootstrap_ok = True
                logger.info(
                    "Targeted schema bootstrap complete (%s).",
                    ", ".join(name for name, _ in targeted_bootstraps),
                )
                return
            except DBAPIError as exc:
                logger.warning(
                    "Targeted schema bootstrap attempt %s/%s failed: %s",
                    attempt,
                    retries,
                    exc,
                )
                try:
                    engine.dispose()
                except Exception:
                    logger.exception("Failed to dispose SQLAlchemy engine after targeted schema bootstrap error")
                if attempt < retries and delay_seconds > 0:
                    time.sleep(delay_seconds)

        logger.error(
            "Targeted schema bootstrap skipped after %s failed attempts. "
            "Affected endpoints may return 503 until schema is applied.",
            retries,
        )
        return

    for attempt in range(1, retries + 1):
        try:
            Base.metadata.create_all(bind=engine)
            _db_bootstrap_ok = True
            logger.info("Database bootstrap complete (create_all).")
            return
        except DBAPIError as exc:
            logger.warning(
                "Database bootstrap attempt %s/%s failed: %s",
                attempt,
                retries,
                exc,
            )
            try:
                engine.dispose()
            except Exception:
                logger.exception("Failed to dispose SQLAlchemy engine after bootstrap error")
            if attempt < retries and delay_seconds > 0:
                time.sleep(delay_seconds)

    logger.error(
        "Database bootstrap skipped after %s failed attempts. "
        "API will continue running and return 503 on DB-dependent routes.",
        retries,
    )


@app.on_event("startup")
def start_internal_chat_reminder_worker():
    global _reminder_worker_thread

    if not _should_run_internal_chat_reminder_worker():
        logger.info("Internal chat reminder worker disabled by INTERNAL_CHAT_REMINDER_WORKER_ENABLED.")
        return

    if _reminder_worker_thread and _reminder_worker_thread.is_alive():
        return

    _reminder_worker_stop_event.clear()
    _reminder_worker_thread = threading.Thread(
        target=_internal_chat_reminder_worker_loop,
        name="internal-chat-reminder-worker",
        daemon=True,
    )
    _reminder_worker_thread.start()


@app.on_event("startup")
def start_onec_sync_worker():
    global _onec_sync_worker_thread

    if not _should_run_onec_sync_worker():
        logger.info("1C sync worker disabled by ONEC_SYNC_WORKER_ENABLED.")
        return

    if _onec_sync_worker_thread and _onec_sync_worker_thread.is_alive():
        return

    _onec_sync_worker_stop_event.clear()
    _onec_sync_worker_thread = threading.Thread(
        target=_onec_sync_worker_loop,
        name="onec-sync-worker",
        daemon=True,
    )
    _onec_sync_worker_thread.start()


@app.on_event("startup")
def start_attendance_scheduler_worker():
    global _attendance_worker_thread

    if not _should_run_attendance_scheduler_worker():
        logger.info("Attendance scheduler worker disabled by ATTENDANCE_SCHEDULER_ENABLED.")
        return

    if _attendance_worker_thread and _attendance_worker_thread.is_alive():
        return

    _attendance_worker_stop_event.clear()
    _attendance_worker_thread = threading.Thread(
        target=_attendance_scheduler_loop,
        name="attendance-scheduler-worker",
        daemon=True,
    )
    _attendance_worker_thread.start()


@app.on_event("shutdown")
def stop_internal_chat_reminder_worker():
    global _reminder_worker_thread

    _reminder_worker_stop_event.set()
    if _reminder_worker_thread and _reminder_worker_thread.is_alive():
        _reminder_worker_thread.join(timeout=3)
    _reminder_worker_thread = None


@app.on_event("shutdown")
def stop_onec_sync_worker():
    global _onec_sync_worker_thread

    _onec_sync_worker_stop_event.set()
    if _onec_sync_worker_thread and _onec_sync_worker_thread.is_alive():
        _onec_sync_worker_thread.join(timeout=3)
    _onec_sync_worker_thread = None


@app.on_event("shutdown")
def stop_attendance_scheduler_worker():
    global _attendance_worker_thread

    _attendance_worker_stop_event.set()
    if _attendance_worker_thread and _attendance_worker_thread.is_alive():
        _attendance_worker_thread.join(timeout=3)
    _attendance_worker_thread = None


@app.exception_handler(DBAPIError)
async def sqlalchemy_error_handler(request, exc: DBAPIError):
    # Reset the pool so stale sockets are dropped after transient network failures.
    try:
        engine.dispose()
    except Exception:
        logger.exception("Failed to dispose SQLAlchemy engine after DBAPIError")

    logger.error("DBAPIError on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database temporarily unavailable. Please retry in a few seconds."},
    )


@app.exception_handler(SATimeoutError)
async def sqlalchemy_timeout_handler(request, exc: SATimeoutError):
    try:
        engine.dispose()
    except Exception:
        logger.exception("Failed to dispose SQLAlchemy engine after timeout")

    logger.error("SQLAlchemy timeout on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database request timed out. Please retry in a few seconds."},
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_generic_handler(request, exc: SQLAlchemyError):
    try:
        engine.dispose()
    except Exception:
        logger.exception("Failed to dispose SQLAlchemy engine after SQLAlchemyError")

    logger.error("SQLAlchemyError on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database temporarily unavailable. Please retry in a few seconds."},
    )


@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "status": "running",
        "environment": settings.APP_ENV,
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/ready")
def ready():
    """
    Readiness probe: verifies DB connectivity.
    Use /health for liveness, /ready for readiness.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except DBAPIError as exc:
        logger.warning("Readiness check failed: %s", exc)
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "detail": "Database unreachable",
                "db_bootstrap_ok": _db_bootstrap_ok,
            },
        )
    return {"status": "ready", "db_bootstrap_ok": _db_bootstrap_ok}
