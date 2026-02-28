from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from api.agents import router as agents_router
from api.finance import router as finance_router
from database.connection import Base, engine

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