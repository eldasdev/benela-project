from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
import hashlib
import re

from database.models import Invoice, Transaction, TransactionStatus, TransactionType


@dataclass(slots=True)
class ConflictResolution:
    strategy: str
    reason: str


class OneCNormalizer:
    def _utcnow(self) -> datetime:
        return datetime.now(UTC).replace(tzinfo=None)

    def _hash_payload(self, values: list[str]) -> str:
        digest = hashlib.sha256("|".join(values).encode("utf-8")).hexdigest()
        return digest

    def _money(self, value: str | float | int | Decimal | None) -> float:
        if value in (None, ""):
            return 0.0
        if isinstance(value, Decimal):
            return float(value)
        return float(value)

    def _normalize_category(self, value: str | None, fallback: str) -> str:
        text = (value or "").strip()
        if not text:
            return fallback
        return re.sub(r"\s+", " ", text)

    def _coerce_datetime(self, value: object | None) -> datetime:
        if value is None or value == "":
            return self._utcnow()
        if isinstance(value, datetime):
            return value
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time())
        text = str(value).strip()
        if not text:
            return self._utcnow()
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                return parsed.replace(tzinfo=None)
            return parsed
        except ValueError:
            for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
                try:
                    return datetime.strptime(text, fmt)
                except ValueError:
                    continue
        return self._utcnow()

    def _coerce_transaction_type(self, value: object | None) -> TransactionType:
        if isinstance(value, TransactionType):
            return value
        text = str(value or "").strip().lower()
        if text == TransactionType.expense.value:
            return TransactionType.expense
        return TransactionType.income

    def _coerce_transaction_status(self, value: object | None) -> TransactionStatus:
        if isinstance(value, TransactionStatus):
            return value
        text = str(value or "").strip().lower()
        for status in TransactionStatus:
            if text == status.value:
                return status
        return TransactionStatus.pending

    async def to_transactions(self, parsed_data: list[dict], company_id: int) -> list[dict]:
        results: list[dict] = []
        for row in parsed_data:
            date_value = row.get("date")
            results.append(
                {
                    "company_id": company_id,
                    "date": datetime.combine(date_value, datetime.min.time()) if date_value else self._utcnow(),
                    "description": (row.get("description") or "1C cash movement").strip(),
                    "category": self._normalize_category(row.get("category") or row.get("cash_flow_item"), "1C Import"),
                    "amount": abs(self._money(row.get("amount"))),
                    "type": TransactionType(row.get("type") or "income"),
                    "status": TransactionStatus(row.get("status") or "pending"),
                    "notes": row.get("notes") or f"1C import counterparty: {row.get('counterparty') or 'n/a'}",
                    "source_counterparty": row.get("counterparty"),
                    "source_account": row.get("account"),
                    "source_currency": row.get("currency") or "UZS",
                }
            )
        return results

    async def to_invoices(self, parsed_data: list[dict], company_id: int) -> list[dict]:
        results: list[dict] = []
        for index, row in enumerate(parsed_data, start=1):
            issue_date = row.get("issue_date")
            due_date = row.get("due_date")
            invoice_number = (row.get("invoice_number") or "").strip() or f"1C-INV-{company_id}-{index}"
            results.append(
                {
                    "company_id": company_id,
                    "invoice_number": invoice_number,
                    "client_name": (row.get("client_name") or "1C Customer").strip(),
                    "client_email": (row.get("client_email") or "").strip() or None,
                    "amount": self._money(row.get("amount")),
                    "tax": self._money(row.get("tax")),
                    "status": (row.get("status") or "pending").strip() or "pending",
                    "issue_date": datetime.combine(issue_date, datetime.min.time()) if issue_date else self._utcnow(),
                    "due_date": datetime.combine(due_date, datetime.min.time()) if due_date else None,
                    "notes": row.get("notes") or row.get("product_name") or "Imported from 1C",
                    "source_product_name": row.get("product_name"),
                    "source_quantity": row.get("quantity"),
                    "source_unit_price": row.get("unit_price"),
                }
            )
        return results

    async def to_employees(self, parsed_data: list[dict], company_id: int) -> list[dict]:
        results: list[dict] = []
        for index, row in enumerate(parsed_data, start=1):
            base_email = (row.get("email") or "").strip().lower()
            if not base_email:
                slug = re.sub(r"[^a-z0-9]+", "-", (row.get("employee_name") or f"employee-{index}").lower()).strip("-") or f"employee-{index}"
                base_email = f"{slug}.{company_id}@onec.local"
            results.append(
                {
                    "company_id": company_id,
                    "full_name": (row.get("employee_name") or f"Employee {index}").strip(),
                    "email": base_email,
                    "department": (row.get("department") or "General").strip(),
                    "role": (row.get("position") or "Employee").strip(),
                    "salary": self._money(row.get("salary") or row.get("net_pay")),
                    "status": "active",
                    "notes": f"Imported from 1C payroll. Accrued={row.get('accrued')}, Deducted={row.get('deducted')}, Net={row.get('net_pay')}",
                }
            )
        return results

    async def to_inventory(self, parsed_data: list[dict], company_id: int) -> list[dict]:
        results: list[dict] = []
        for row in parsed_data:
            results.append(
                {
                    "company_id": company_id,
                    "product_name": row.get("product_name"),
                    "warehouse": row.get("warehouse") or "Main warehouse",
                    "unit": row.get("unit") or "pcs",
                    "opening_stock": self._money(row.get("opening_stock")),
                    "closing_stock": self._money(row.get("closing_stock")),
                    "incoming": self._money(row.get("incoming")),
                    "outgoing": self._money(row.get("outgoing")),
                    "sku": row.get("sku"),
                }
            )
        return results

    async def deduplicate(self, new_records: list[dict], existing_hashes: set[str], *, record_type: str) -> list[dict]:
        rows: list[dict] = []
        for row in new_records:
            if record_type == "transaction":
                digest = self._hash_payload([
                    str(row.get("company_id") or ""),
                    str(row.get("date") or ""),
                    str(row.get("description") or ""),
                    str(row.get("amount") or ""),
                    str(row.get("type") or ""),
                ])
            elif record_type == "invoice":
                digest = self._hash_payload([
                    str(row.get("company_id") or ""),
                    str(row.get("invoice_number") or ""),
                    str(row.get("amount") or ""),
                    str(row.get("issue_date") or ""),
                ])
            else:
                digest = self._hash_payload([str(row)])
            row["import_hash"] = digest
            row["is_duplicate"] = digest in existing_hashes
            rows.append(row)
        return rows

    async def detect_conflicts(self, new_record: dict, existing_record: dict) -> ConflictResolution:
        if new_record == existing_record:
            return ConflictResolution(strategy="skip", reason="Exact duplicate already exists.")
        return ConflictResolution(strategy="update", reason="Existing record differs from imported 1C data.")

    def build_transaction_model(self, payload: dict) -> Transaction:
        return Transaction(
            company_id=payload.get("company_id"),
            date=self._coerce_datetime(payload.get("date")),
            description=payload.get("description") or "1C cash movement",
            category=payload.get("category") or "1C Import",
            amount=float(payload.get("amount") or 0),
            type=self._coerce_transaction_type(payload.get("type")),
            status=self._coerce_transaction_status(payload.get("status")),
            notes=payload.get("notes"),
        )

    def build_invoice_model(self, payload: dict) -> Invoice:
        return Invoice(
            company_id=payload.get("company_id"),
            invoice_number=payload.get("invoice_number"),
            client_name=payload.get("client_name") or "1C Customer",
            client_email=payload.get("client_email"),
            amount=float(payload.get("amount") or 0),
            tax=float(payload.get("tax") or 0),
            status=payload.get("status") or "pending",
            issue_date=self._coerce_datetime(payload.get("issue_date")),
            due_date=self._coerce_datetime(payload.get("due_date")) if payload.get("due_date") else None,
            notes=payload.get("notes"),
        )
