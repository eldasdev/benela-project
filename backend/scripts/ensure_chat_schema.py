"""
One-time helper to create chat tables if missing.

Usage:
  python scripts/ensure_chat_schema.py
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.connection import engine
from database.models import ChatMessage, ChatAttachment


def main() -> None:
    ChatMessage.__table__.create(bind=engine, checkfirst=True)
    ChatAttachment.__table__.create(bind=engine, checkfirst=True)
    print("Chat schema ensured successfully.")


if __name__ == "__main__":
    main()
