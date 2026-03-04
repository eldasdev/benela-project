"""
One-time helper to create legal tables if missing.

Usage:
  python scripts/ensure_legal_schema.py
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.connection import engine
from database.models import (
    LegalDocument,
    LegalContract,
    LegalComplianceTask,
    LegalSearchLog,
)


def main() -> None:
    LegalDocument.__table__.create(bind=engine, checkfirst=True)
    LegalContract.__table__.create(bind=engine, checkfirst=True)
    LegalComplianceTask.__table__.create(bind=engine, checkfirst=True)
    LegalSearchLog.__table__.create(bind=engine, checkfirst=True)
    print("Legal schema ensured successfully.")


if __name__ == "__main__":
    main()
