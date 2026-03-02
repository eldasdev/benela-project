import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

# Create all tables on startup
Base.metadata.create_all(bind=engine)

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
