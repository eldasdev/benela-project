"""
One-time helper to create sales tables if missing.

Usage:
  python scripts/ensure_sales_schema.py
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.connection import engine
from database.models import (
    SalesProduct,
    SalesOrder,
    SalesOrderItem,
    SalesInventoryAdjustment,
)


def main() -> None:
    SalesProduct.__table__.create(bind=engine, checkfirst=True)
    SalesOrder.__table__.create(bind=engine, checkfirst=True)
    SalesOrderItem.__table__.create(bind=engine, checkfirst=True)
    SalesInventoryAdjustment.__table__.create(bind=engine, checkfirst=True)
    print("Sales schema ensured successfully.")


if __name__ == "__main__":
    main()
