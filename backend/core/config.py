import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Benela AI")
    APP_ENV: str = os.getenv("APP_ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "True") == "True"
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")
    TELEGRAM_CHAT_IDS: str = os.getenv("TELEGRAM_CHAT_IDS", "")
    TELEGRAM_WORKSPACE_CHAT_IDS: str = os.getenv("TELEGRAM_WORKSPACE_CHAT_IDS", "")
    TELEGRAM_AUTO_DISCOVER_CHAT_IDS: bool = os.getenv("TELEGRAM_AUTO_DISCOVER_CHAT_IDS", "True") == "True"
    INTERNAL_CHAT_TELEGRAM_ENABLED: bool = os.getenv("INTERNAL_CHAT_TELEGRAM_ENABLED", "True") == "True"

settings = Settings()
