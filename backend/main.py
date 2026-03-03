import logging
import os
import time
from typing import Callable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, SQLAlchemyError, TimeoutError as SATimeoutError
from core.config import settings
from api.agents import router as agents_router
from api.finance import router as finance_router
from api.hr import router as hr_router
from api.projects import router as projects_router
from api.marketing import router as marketing_router
from api.admin import router as admin_router
from api.marketplace import router as marketplace_router
from api.dashboard import router as dashboard_router
from api.chat import router as chat_router
from api.notifications import router as notifications_router
from database.connection import Base, engine
from database.models import (
    MarketingCampaign,
    MarketingContentItem,
    MarketingLead,
    MarketingChannelMetric,
    ChatMessage,
    ChatAttachment,
)

logger = logging.getLogger("uvicorn.error")
_db_bootstrap_ok = False


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


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


def _ensure_marketing_schema():
    MarketingCampaign.__table__.create(bind=engine, checkfirst=True)
    MarketingContentItem.__table__.create(bind=engine, checkfirst=True)
    MarketingLead.__table__.create(bind=engine, checkfirst=True)
    MarketingChannelMetric.__table__.create(bind=engine, checkfirst=True)


def _should_auto_create_chat_tables() -> bool:
    raw = os.getenv("AUTO_CREATE_CHAT_TABLES")
    if raw is not None:
        return _env_bool("AUTO_CREATE_CHAT_TABLES", True)
    # Keep chat features usable by default even when full create_all is disabled.
    return True


def _ensure_chat_schema():
    ChatMessage.__table__.create(bind=engine, checkfirst=True)
    ChatAttachment.__table__.create(bind=engine, checkfirst=True)


app = FastAPI(
    title="Benela AI",
    description="Enterprise Agentic ERP",
    version="0.1.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://benela.dev",
        "https://www.benela.dev",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(agents_router, prefix="/agents", tags=["Agents"])
app.include_router(finance_router, tags=["Finance"])
app.include_router(hr_router, tags=["HR"])
app.include_router(projects_router, tags=["Projects"])
app.include_router(marketing_router)
app.include_router(admin_router)
app.include_router(marketplace_router)
app.include_router(dashboard_router)
app.include_router(chat_router)
app.include_router(notifications_router)


@app.on_event("startup")
def bootstrap_database():
    """
    Best-effort DB bootstrap.
    Do not crash API startup on transient DB outages.
    """
    global _db_bootstrap_ok

    retries = max(1, int(os.getenv("DB_BOOTSTRAP_RETRIES", "3")))
    delay_seconds = max(0.0, float(os.getenv("DB_BOOTSTRAP_RETRY_DELAY", "2")))

    if not _should_auto_create_tables():
        logger.info("AUTO_CREATE_TABLES disabled; skipping metadata.create_all()")
        targeted_bootstraps: list[tuple[str, Callable[[], None]]] = []
        if _should_auto_create_marketing_tables():
            targeted_bootstraps.append(("marketing", _ensure_marketing_schema))
        else:
            logger.info("AUTO_CREATE_MARKETING_TABLES disabled; skipping marketing schema checks")

        if _should_auto_create_chat_tables():
            targeted_bootstraps.append(("chat", _ensure_chat_schema))
        else:
            logger.info("AUTO_CREATE_CHAT_TABLES disabled; skipping chat schema checks")

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
