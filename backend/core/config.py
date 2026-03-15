import os
from pathlib import Path

from dotenv import load_dotenv


def _load_env_chain() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    project_root = backend_dir.parent
    candidates = (
        backend_dir / ".env",
        backend_dir / ".env.local",
        project_root / ".env",
        project_root / ".env.local",
        project_root / "frontend" / ".env.local",
    )
    for env_path in candidates:
        if env_path.exists():
            load_dotenv(env_path, override=False)


_load_env_chain()

class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Benela AI")
    APP_ENV: str = os.getenv("APP_ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "True") == "True"
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", os.getenv("NEXT_PUBLIC_SUPABASE_URL", ""))
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")
    SUPABASE_JWKS_URL: str = os.getenv("SUPABASE_JWKS_URL", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")
    TELEGRAM_CHAT_IDS: str = os.getenv("TELEGRAM_CHAT_IDS", "")
    TELEGRAM_WORKSPACE_CHAT_IDS: str = os.getenv("TELEGRAM_WORKSPACE_CHAT_IDS", "")
    TELEGRAM_AUTO_DISCOVER_CHAT_IDS: bool = os.getenv("TELEGRAM_AUTO_DISCOVER_CHAT_IDS", "True") == "True"
    INTERNAL_CHAT_TELEGRAM_ENABLED: bool = os.getenv("INTERNAL_CHAT_TELEGRAM_ENABLED", "True") == "True"
    INTERNAL_CHAT_TELEGRAM_UPDATES_ENABLED: bool = os.getenv("INTERNAL_CHAT_TELEGRAM_UPDATES_ENABLED", "True") == "True"

settings = Settings()
