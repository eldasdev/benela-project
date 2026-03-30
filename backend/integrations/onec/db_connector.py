from __future__ import annotations

from datetime import date
from typing import Any
from urllib.parse import quote_plus

from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, text

from core.config import settings
from database.onec_models import OneCConnection
from integrations.onec.security import decrypt_secret


class OneCDatabaseConnector:
    def __init__(self, connection: OneCConnection):
        self.connection = connection
        self.engine = None
        self.read_only = None

    def _build_url(self) -> str:
        db_type = (self.connection.db_type or "").strip().lower()
        if db_type == "postgresql":
            username = quote_plus(decrypt_secret(self.connection.db_username) or "")
            password = quote_plus(decrypt_secret(self.connection.db_password) or "")
            host = decrypt_secret(self.connection.db_host) or ""
            port = int(self.connection.db_port or 5432)
            db_name = self.connection.db_name or ""
            return f"postgresql+psycopg2://{username}:{password}@{host}:{port}/{db_name}"
        if db_type == "file_1cd":
            host = decrypt_secret(self.connection.db_host) or self.connection.db_name or ""
            if not host:
                raise HTTPException(status_code=422, detail="1C file-mode path is not configured.")
            return f"sqlite:///file:{host}?mode=ro&uri=true"
        if db_type == "mssql":
            raise HTTPException(status_code=422, detail="MSSQL direct sync is not enabled in this build. Use HTTP API or PostgreSQL read-only access.")
        raise HTTPException(status_code=422, detail=f"Unsupported 1C database type '{self.connection.db_type}'.")

    async def connect(self) -> bool:
        url = self._build_url()
        connect_args: dict[str, Any] = {}
        if url.startswith("postgresql"):
            connect_args = {
                "connect_timeout": int(settings.DB_CONNECT_TIMEOUT or 10),
                "application_name": "benela-onec-sync",
                "options": "-c default_transaction_read_only=on",
            }
        self.engine = create_engine(url, pool_pre_ping=True, connect_args=connect_args)
        with self.engine.connect() as conn:
            if url.startswith("postgresql"):
                readonly = conn.execute(text("SHOW transaction_read_only")).scalar()
                self.read_only = str(readonly).lower() == "on"
                if not self.read_only:
                    raise HTTPException(status_code=422, detail="1C database connection is writable. Benela requires a read-only connection.")
            else:
                self.read_only = True
        return True

    async def get_1c_tables(self) -> list[str]:
        if not self.engine:
            await self.connect()
        return sorted(inspect(self.engine).get_table_names())

    async def get_chart_of_accounts(self) -> list[dict]:
        return await self._read_known_table(["chart_of_accounts", "accounts", "_referenceaccounts"], ["code", "name"])

    async def get_transactions(self, date_from: date, date_to: date, account_codes: list[str] | None = None) -> list[dict]:
        rows = await self._read_known_table(["transactions", "journal_entries", "_documentjournal"], ["date", "amount"])
        result = []
        for row in rows:
            row_date = row.get("date")
            if hasattr(row_date, "date"):
                row_date = row_date.date()
            if row_date and date_from <= row_date <= date_to:
                if account_codes and row.get("account") not in set(account_codes):
                    continue
                result.append(row)
        return result

    async def get_counterparties(self) -> list[dict]:
        return await self._read_known_table(["counterparties", "customers", "vendors"], ["name"])

    async def get_inventory_balances(self, as_of_date: date) -> list[dict]:
        rows = await self._read_known_table(["inventory", "stock_balances", "warehouse_balances"], ["product_name"])
        return rows

    async def get_employees(self) -> list[dict]:
        return await self._read_known_table(["employees", "staff", "hr_employees"], ["employee_name", "name"])

    async def get_payroll(self, month: date) -> list[dict]:
        return await self._read_known_table(["payroll", "salary_register"], ["employee_name", "net_pay"])

    async def get_sales_docs(self, date_from: date, date_to: date) -> list[dict]:
        rows = await self._read_known_table(["sales_docs", "sales_invoices", "realization"], ["invoice_number", "amount"])
        return rows

    async def get_purchase_docs(self, date_from: date, date_to: date) -> list[dict]:
        return await self._read_known_table(["purchase_docs", "purchase_invoices", "receipt_docs"], ["document_number", "amount"])

    async def _read_known_table(self, candidates: list[str], required_columns: list[str]) -> list[dict]:
        if not self.engine:
            await self.connect()
        tables = {name.lower(): name for name in inspect(self.engine).get_table_names()}
        for candidate in candidates:
            actual = tables.get(candidate.lower())
            if not actual:
                continue
            with self.engine.connect() as conn:
                result = conn.execute(text(f'SELECT * FROM "{actual}" LIMIT 5000'))
                rows = [dict(row._mapping) for row in result]
            if rows:
                lowered = {str(key).lower() for key in rows[0].keys()}
                if any(column in lowered for column in required_columns):
                    return rows
        return []
