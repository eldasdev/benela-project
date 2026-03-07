import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit, SplitResult

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _is_supabase_pooler(url: str) -> bool:
    if not url.startswith("postgresql"):
        return False
    host = (urlsplit(url).hostname or "").lower()
    return host.endswith(".pooler.supabase.com")


def _use_supabase_tx_pooler() -> bool:
    # Supabase session-mode pooler (5432) frequently hits max clients.
    # Prefer transaction mode (6543) unless explicitly disabled.
    return _env_bool("DB_SUPABASE_USE_TRANSACTION_POOLER", True)


def _swap_port(parts: SplitResult, new_port: int) -> SplitResult:
    host = parts.hostname or ""
    if not host:
        return parts
    userinfo = ""
    if parts.username:
        userinfo = parts.username
        if parts.password:
            userinfo = f"{userinfo}:{parts.password}"
        userinfo = f"{userinfo}@"
    netloc = f"{userinfo}{host}:{new_port}"
    return SplitResult(parts.scheme, netloc, parts.path, parts.query, parts.fragment)


def _normalize_database_url(url: str) -> str:
    if not url:
        raise RuntimeError("DATABASE_URL is not configured")
    if not url.startswith("postgresql"):
        return url
    parts = urlsplit(url)
    if _is_supabase_pooler(url) and (parts.port or 5432) == 5432 and _use_supabase_tx_pooler():
        parts = _swap_port(parts, 6543)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    if "sslmode" not in query:
        query["sslmode"] = os.getenv("DB_SSLMODE", "require")
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _build_connect_args(url: str) -> dict:
    if url.startswith("postgresql"):
        connect_args = {
            "connect_timeout": int(os.getenv("DB_CONNECT_TIMEOUT", "5")),
            "keepalives": 1,
            "keepalives_idle": int(os.getenv("DB_KEEPALIVES_IDLE", "30")),
            "keepalives_interval": int(os.getenv("DB_KEEPALIVES_INTERVAL", "10")),
            "keepalives_count": int(os.getenv("DB_KEEPALIVES_COUNT", "5")),
            "application_name": os.getenv("DB_APPLICATION_NAME", "benela-api"),
        }
        if "DB_SSLMODE" in os.environ:
            connect_args["sslmode"] = os.getenv("DB_SSLMODE", "require")
        return connect_args
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def _engine_kwargs(url: str) -> dict:
    kwargs = {
        "pool_pre_ping": True,
        "connect_args": _build_connect_args(url),
    }

    if not url.startswith("postgresql"):
        return kwargs

    use_null_pool = _env_bool("DB_USE_NULL_POOL", _is_supabase_pooler(url))
    if use_null_pool:
        kwargs["poolclass"] = NullPool
        return kwargs

    kwargs.update(
        {
            "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", "600")),
            "pool_size": int(os.getenv("DB_POOL_SIZE", "2")),
            "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "2")),
            "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "5")),
            "pool_use_lifo": _env_bool("DB_POOL_USE_LIFO", True),
        }
    )
    return kwargs


DATABASE_URL = _normalize_database_url(DATABASE_URL)

engine = create_engine(
    DATABASE_URL,
    **_engine_kwargs(DATABASE_URL),
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
