"""
One-time helper to create marketing tables if missing.

Usage:
  python scripts/ensure_marketing_schema.py
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.connection import engine
from database.models import (
    MarketingCampaign,
    MarketingContentItem,
    MarketingLead,
    MarketingChannelMetric,
)


def main() -> None:
    MarketingCampaign.__table__.create(bind=engine, checkfirst=True)
    MarketingContentItem.__table__.create(bind=engine, checkfirst=True)
    MarketingLead.__table__.create(bind=engine, checkfirst=True)
    MarketingChannelMetric.__table__.create(bind=engine, checkfirst=True)
    print("Marketing schema ensured successfully.")


if __name__ == "__main__":
    main()
