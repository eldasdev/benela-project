import logging
import os
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from core.config import settings
from api.agents import router as agents_router
from api.finance import router as finance_router
from api.hr import router as hr_router
from api.projects import router as projects_router
from api.admin import router as admin_router
from api.marketplace import router as marketplace_router
from api.dashboard import router as dashboard_router
from api.chat import router as chat_router
from api.notifications import router as notifications_router
from database.connection import Base, engine

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
    # Safe default: local/dev enabled, production disabled.
    return settings.APP_ENV.lower() != "production"


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

    if not _should_auto_create_tables():
        logger.info("AUTO_CREATE_TABLES disabled; skipping metadata.create_all()")
        return

    retries = max(1, int(os.getenv("DB_BOOTSTRAP_RETRIES", "3")))
    delay_seconds = max(0.0, float(os.getenv("DB_BOOTSTRAP_RETRY_DELAY", "2")))

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
