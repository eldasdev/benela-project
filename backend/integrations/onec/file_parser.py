from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path
import math
import re
import zipfile

import chardet
import pandas as pd
from fastapi import HTTPException
from lxml import etree


ONEC_HEADER_MAP = {
    "date": "date",
    "дата": "date",
    "amount": "amount",
    "sales amount": "amount",
    "total amount": "amount",
    "сумма": "amount",
    "сумма операции": "amount",
    "counterparty": "counterparty",
    "customer": "counterparty",
    "customer name": "counterparty",
    "customer_name": "counterparty",
    "client": "counterparty",
    "контрагент": "counterparty",
    "организация": "organization",
    "currency": "currency",
    "валюта": "currency",
    "account": "account",
    "счёт": "account",
    "счет": "account",
    "debit": "debit",
    "дебет": "debit",
    "credit": "credit",
    "кредит": "credit",
    "balance": "balance",
    "остаток": "balance",
    "входящий остаток": "opening_balance",
    "исходящий остаток": "closing_balance",
    "description": "description",
    "назначение платежа": "description",
    "статья ддс": "cash_flow_item",
    "вид операции": "operation_type",
    "product": "product_name",
    "item": "product_name",
    "номенклатура": "product_name",
    "quantity": "quantity",
    "qty": "quantity",
    "количество": "quantity",
    "price": "unit_price",
    "unit_price": "unit_price",
    "цена": "unit_price",
    "скидка": "discount",
    "vat": "vat",
    "tax": "vat",
    "ндс": "vat",
    "invoice": "document_number",
    "invoice_number": "document_number",
    "invoice number": "document_number",
    "document number": "document_number",
    "номер документа": "document_number",
    "employee": "employee_name",
    "employee_name": "employee_name",
    "сотрудник": "employee_name",
    "job_title": "position",
    "должность": "position",
    "division": "department",
    "подразделение": "department",
    "salary": "salary",
    "оклад": "salary",
    "gross_pay": "accrued",
    "начислено": "accrued",
    "withheld": "deducted",
    "удержано": "deducted",
    "net_pay": "net_pay",
    "к выплате": "net_pay",
    "товар": "product_name",
    "warehouse": "warehouse",
    "склад": "warehouse",
    "омбор": "warehouse",
    "unit": "unit",
    "единица": "unit",
    "opening_stock": "opening_stock",
    "начальный остаток": "opening_stock",
    "closing_stock": "closing_stock",
    "конечный остаток": "closing_stock",
    "incoming": "incoming",
    "приход": "incoming",
    "outgoing": "outgoing",
    "расход": "outgoing",
    "клиент": "counterparty",
    "покупатель": "counterparty",
    "поставщик": "counterparty",
    "notes": "notes",
    "комментарий": "notes",
    "описание": "description",
    "наименование": "name",
    "sku": "sku",
    "артикул": "sku",
    "phone": "phone",
    "телефон": "phone",
    "email_address": "email",
    "email": "email",
}

REPORT_TYPE_HINTS: dict[str, tuple[str, ...]] = {
    "trial_balance": ("opening_balance", "closing_balance", "account"),
    "account_card": ("account", "date", "debit", "credit"),
    "account_analysis": ("account", "debit", "credit", "balance"),
    "cash_flow": ("date", "amount", "description"),
    "sales": ("document_number", "counterparty", "product_name", "quantity", "unit_price", "vat", "amount"),
    "counterparties": ("counterparty", "organization", "email", "phone", "account"),
    "inventory": ("product_name", "warehouse", "closing_stock"),
    "payroll": ("employee_name", "net_pay"),
    "reconciliation": ("counterparty", "opening_balance", "closing_balance"),
}

REPORT_TYPE_MIN_MATCHES: dict[str, int] = {
    "trial_balance": 3,
    "account_card": 3,
    "account_analysis": 3,
    "cash_flow": 3,
    "sales": 3,
    "counterparties": 2,
    "inventory": 3,
    "payroll": 2,
    "reconciliation": 3,
}

REPORT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "trial_balance": ("оборотно-сальдовая", "осв"),
    "account_card": ("карточка счета", "карточка счёта"),
    "account_analysis": ("анализ счета", "анализ счёта"),
    "cash_flow": ("движение денежных средств", "ддс"),
    "sales": ("отчёт по продажам", "реализация"),
    "counterparties": ("контрагент", "контрагентов"),
    "inventory": ("склад", "товар", "остаток"),
    "payroll": ("зарплат", "ведомость"),
    "reconciliation": ("акт сверки",),
}

INCOME_HINTS = ("поступ", "приход", "income", "sale", "оплата от")
EXPENSE_HINTS = ("списан", "расход", "expense", "payment", "оплата постав")

UZBEK_SPECIFIC = {
    "account_plan": "uz_nsbu_2024",
    "tax_codes": {
        "qqs": "VAT (12%)",
        "inps": "Social tax (12%)",
        "jshdsh": "Personal income tax (12%)",
        "yer soligi": "Land tax",
    },
    "default_currency": "UZS",
    "currency_symbol": "сўм",
    "date_format": "DD.MM.YYYY",
    "number_format": "1 234 567,89",
    "legal_forms": ["МЧЖ", "АЖ", "ХК", "ДК", "ФХ", "ЯТТ", "IP", "OOO", "AO"],
    "warehouse_prefixes": ["Склад", "Омбор", "Mahsulot"],
}


@dataclass(slots=True)
class ParsedOneCFile:
    report_type: str
    detected_encoding: str | None
    rows: list[dict]
    columns: list[str]


class OneCFileParser:
    def __init__(self, *, max_rows: int = 500_000):
        self.max_rows = max_rows

    def _utc_today(self) -> date:
        return datetime.now(UTC).date()

    def _normalize_header_text(self, header: str) -> str:
        normalized = re.sub(
            r"\s+",
            " ",
            str(header or "").strip().replace("\xa0", " ").replace("_", " "),
        ).lower()
        return ONEC_HEADER_MAP.get(normalized, normalized.replace(" ", "_"))

    async def normalize_cyrillic_header(self, header: str) -> str:
        return self._normalize_header_text(header)

    async def normalize_date(self, date_str: str | date | datetime | None) -> date | None:
        if date_str is None or date_str == "":
            return None
        if pd.isna(date_str):
            return None
        if isinstance(date_str, datetime):
            return date_str.date()
        if isinstance(date_str, date):
            return date_str
        text = str(date_str).strip()
        if not text:
            return None
        for fmt in ("%d.%m.%Y", "%d.%m.%y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
        try:
            parsed = pd.to_datetime(text, dayfirst=True, errors="raise")
            if pd.isna(parsed):
                return None
            return parsed.date()
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not parse 1C date value '{text}': {exc}")

    async def normalize_amount(self, amount_str: str | float | int | Decimal | None) -> Decimal:
        if amount_str is None or amount_str == "":
            return Decimal("0")
        if pd.isna(amount_str):
            return Decimal("0")
        if isinstance(amount_str, Decimal):
            if amount_str.is_nan() or not amount_str.is_finite():
                return Decimal("0")
            return amount_str
        if isinstance(amount_str, (int, float)):
            if isinstance(amount_str, float) and (math.isnan(amount_str) or math.isinf(amount_str)):
                return Decimal("0")
            return Decimal(str(amount_str))
        text = str(amount_str).strip().replace("\xa0", " ")
        text = re.sub(r"[^0-9,\.\- ]", "", text)
        text = re.sub(r"\s+", "", text)
        if text.count(",") and text.count("."):
            if text.rfind(",") > text.rfind("."):
                text = text.replace(".", "").replace(",", ".")
            else:
                text = text.replace(",", "")
        elif text.count(","):
            text = text.replace(",", ".")
        try:
            value = Decimal(text or "0")
            if value.is_nan() or not value.is_finite():
                return Decimal("0")
            return value
        except InvalidOperation as exc:
            raise HTTPException(status_code=422, detail=f"Could not parse 1C amount '{amount_str}': {exc}")

    async def detect_report_type(self, df: pd.DataFrame) -> str:
        normalized_columns = [self._normalize_header_text(str(col)) for col in df.columns]
        column_set = set(normalized_columns)
        header_blob = " ".join(str(col).strip().lower() for col in df.columns)
        scored_matches: list[tuple[int, float, str]] = []
        for report_type, required in REPORT_TYPE_HINTS.items():
            overlap = sum(1 for value in required if value in column_set)
            minimum = REPORT_TYPE_MIN_MATCHES.get(report_type, max(2, min(len(required), 3)))
            if overlap >= minimum:
                scored_matches.append((overlap, overlap / max(len(required), 1), report_type))
        if scored_matches:
            scored_matches.sort(key=lambda item: (item[0], item[1]), reverse=True)
            return scored_matches[0][2]
        keyword_matches: list[tuple[int, str]] = []
        for report_type, keywords in REPORT_KEYWORDS.items():
            hits = sum(1 for keyword in keywords if keyword in header_blob)
            if hits:
                keyword_matches.append((hits, report_type))
        if keyword_matches:
            keyword_matches.sort(key=lambda item: item[0], reverse=True)
            return keyword_matches[0][1]
        return "unknown"

    async def parse_trial_balance(self, df: pd.DataFrame) -> list[dict]:
        rows: list[dict] = []
        for row in self._iter_rows(df):
            account = self._pick(row, "account") or self._pick(row, "счет") or self._pick(row, "счёт")
            if not account:
                continue
            rows.append(
                {
                    "account": str(account).strip(),
                    "opening_balance": str(await self.normalize_amount(self._pick(row, "opening_balance") or self._pick(row, "balance") or 0)),
                    "closing_balance": str(await self.normalize_amount(self._pick(row, "closing_balance") or self._pick(row, "balance") or 0)),
                    "debit": str(await self.normalize_amount(self._pick(row, "debit") or 0)),
                    "credit": str(await self.normalize_amount(self._pick(row, "credit") or 0)),
                    "organization": self._string(self._pick(row, "organization")),
                }
            )
        return rows

    async def parse_cash_flow(self, df: pd.DataFrame) -> list[dict]:
        rows: list[dict] = []
        for row in self._iter_rows(df):
            amount = await self.normalize_amount(self._pick(row, "amount") or self._pick(row, "debit") or self._pick(row, "credit") or 0)
            description = self._string(self._pick(row, "description") or self._pick(row, "cash_flow_item") or self._pick(row, "operation_type"))
            if amount == 0 and not description:
                continue
            operation_text = f"{self._string(self._pick(row, 'operation_type'))} {description}".lower()
            tx_type = "income"
            if amount < 0 or any(token in operation_text for token in EXPENSE_HINTS):
                tx_type = "expense"
            elif any(token in operation_text for token in INCOME_HINTS):
                tx_type = "income"
            rows.append(
                {
                    "date": (await self.normalize_date(self._pick(row, "date"))) or self._utc_today(),
                    "description": description or "1C cash movement",
                    "category": self._string(self._pick(row, "cash_flow_item") or self._pick(row, "category")) or "1C Import",
                    "amount": str(abs(amount)),
                    "type": tx_type,
                    "status": "paid" if tx_type == "expense" else "received",
                    "counterparty": self._string(self._pick(row, "counterparty")),
                    "account": self._string(self._pick(row, "account")),
                    "currency": self._string(self._pick(row, "currency")) or UZBEK_SPECIFIC["default_currency"],
                    "notes": self._string(self._pick(row, "notes")),
                }
            )
        return rows

    async def parse_sales_report(self, df: pd.DataFrame) -> list[dict]:
        rows: list[dict] = []
        for row in self._iter_rows(df):
            document_number = self._string(self._pick(row, "document_number"))
            counterparty = self._string(self._pick(row, "counterparty") or self._pick(row, "client_name"))
            issue_date = (await self.normalize_date(self._pick(row, "date"))) or self._utc_today()
            due_date = await self.normalize_date(self._pick(row, "due_date") or self._pick(row, "date"))
            product_name = self._string(self._pick(row, "product_name"))
            amount = await self.normalize_amount(self._pick(row, "amount") or self._pick(row, "unit_price") or 0)
            quantity = await self.normalize_amount(self._pick(row, "quantity") or 1)
            if not document_number and not counterparty and not due_date and not product_name:
                continue
            if not document_number and not counterparty and product_name and product_name.lower() in {"total", "subtotal", "итого", "итог"}:
                continue
            rows.append(
                {
                    "invoice_number": document_number or f"1C-{len(rows) + 1}",
                    "client_name": counterparty or "1C Customer",
                    "client_email": self._string(self._pick(row, "email")),
                    "amount": str(amount * quantity),
                    "tax": str(await self.normalize_amount(self._pick(row, "vat") or 0)),
                    "status": "pending",
                    "issue_date": issue_date,
                    "due_date": due_date or issue_date,
                    "product_name": product_name,
                    "quantity": str(quantity),
                    "unit_price": str(amount),
                    "notes": self._string(self._pick(row, "notes")),
                }
            )
        return rows

    async def parse_counterparties(self, df: pd.DataFrame) -> list[dict]:
        rows: list[dict] = []
        for row in self._iter_rows(df):
            name = self._string(self._pick(row, "counterparty") or self._pick(row, "name") or self._pick(row, "organization"))
            if not name:
                continue
            rows.append(
                {
                    "name": name,
                    "organization": self._string(self._pick(row, "organization")) or name,
                    "email": self._string(self._pick(row, "email")),
                    "phone": self._string(self._pick(row, "phone")),
                    "currency": self._string(self._pick(row, "currency")) or UZBEK_SPECIFIC["default_currency"],
                    "account": self._string(self._pick(row, "account")),
                }
            )
        return rows

    async def parse_inventory(self, df: pd.DataFrame) -> list[dict]:
        rows: list[dict] = []
        for row in self._iter_rows(df):
            product_name = self._string(self._pick(row, "product_name") or self._pick(row, "name"))
            if not product_name:
                continue
            rows.append(
                {
                    "product_name": product_name,
                    "warehouse": self._string(self._pick(row, "warehouse")) or "Main warehouse",
                    "unit": self._string(self._pick(row, "unit")) or "pcs",
                    "opening_stock": str(await self.normalize_amount(self._pick(row, "opening_stock") or 0)),
                    "closing_stock": str(await self.normalize_amount(self._pick(row, "closing_stock") or self._pick(row, "balance") or 0)),
                    "incoming": str(await self.normalize_amount(self._pick(row, "incoming") or 0)),
                    "outgoing": str(await self.normalize_amount(self._pick(row, "outgoing") or 0)),
                    "sku": self._string(self._pick(row, "sku")),
                }
            )
        return rows

    async def parse_payroll(self, df: pd.DataFrame) -> list[dict]:
        rows: list[dict] = []
        for row in self._iter_rows(df):
            employee_name = self._string(self._pick(row, "employee_name") or self._pick(row, "name"))
            if not employee_name:
                continue
            rows.append(
                {
                    "employee_name": employee_name,
                    "position": self._string(self._pick(row, "position")) or "Employee",
                    "department": self._string(self._pick(row, "department")) or "General",
                    "salary": str(await self.normalize_amount(self._pick(row, "salary") or self._pick(row, "accrued") or 0)),
                    "accrued": str(await self.normalize_amount(self._pick(row, "accrued") or 0)),
                    "deducted": str(await self.normalize_amount(self._pick(row, "deducted") or 0)),
                    "net_pay": str(await self.normalize_amount(self._pick(row, "net_pay") or self._pick(row, "salary") or 0)),
                    "email": self._string(self._pick(row, "email")),
                }
            )
        return rows

    async def parse_file(self, file_path: str | Path, *, report_type_hint: str | None = None) -> ParsedOneCFile:
        path = Path(file_path)
        suffix = path.suffix.lower()
        if suffix == ".mxl":
            raise HTTPException(status_code=422, detail="MXL exports are not parsed directly yet. Convert the file to CSV or XLSX first.")
        if suffix not in {".csv", ".xlsx", ".xml"}:
            raise HTTPException(status_code=422, detail="Unsupported 1C file type. Use .csv, .xlsx, or .xml.")
        if suffix == ".csv":
            encoding = self._detect_csv_encoding(path)
            df = self._read_csv(path, encoding)
        elif suffix == ".xlsx":
            encoding = None
            df = self._read_xlsx(path)
        else:
            encoding = None
            df = self._read_xml(path)
        self._validate_dataframe(df)
        report_type = (report_type_hint or "").strip() or await self.detect_report_type(df)
        if report_type == "unknown":
            raise HTTPException(status_code=422, detail="Could not detect report type. Please specify manually.")
        parsed_rows = await self._dispatch_parse(report_type, df)
        return ParsedOneCFile(report_type=report_type, detected_encoding=encoding, rows=parsed_rows, columns=[str(col) for col in df.columns])

    def _validate_dataframe(self, df: pd.DataFrame) -> None:
        if df.empty:
            raise HTTPException(status_code=422, detail="The uploaded 1C file is empty.")
        if len(df.index) > self.max_rows:
            raise HTTPException(status_code=422, detail=f"The file contains too many rows. Maximum supported rows: {self.max_rows}.")

    def _read_csv(self, path: Path, encoding: str) -> pd.DataFrame:
        last_error: Exception | None = None
        for sep in (None, ";", ",", "\t"):
            try:
                df = pd.read_csv(path, encoding=encoding, sep=sep, engine="python", header=None)
                return self._promote_header_row(df)
            except Exception as exc:
                last_error = exc
                continue
        raise HTTPException(status_code=422, detail=f"Could not read CSV file: {last_error}")

    def _read_xlsx(self, path: Path) -> pd.DataFrame:
        try:
            df = pd.read_excel(path, header=None)
            return self._promote_header_row(df)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not read Excel file: {exc}")

    def _read_xml(self, path: Path) -> pd.DataFrame:
        try:
            root = etree.parse(str(path)).getroot()
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not read XML file: {exc}")
        rows: list[dict[str, str]] = []
        for node in root.xpath("//*[count(*) > 0]"):
            row: dict[str, str] = {}
            for child in node:
                key = re.sub(r"\{.*?\}", "", child.tag).strip()
                value = (child.text or "").strip()
                if key and value:
                    row[key] = value
            if row:
                rows.append(row)
        if not rows:
            raise HTTPException(status_code=422, detail="Could not detect tabular XML rows in the uploaded file.")
        return pd.DataFrame(rows)

    def _promote_header_row(self, df: pd.DataFrame) -> pd.DataFrame:
        trimmed = df.dropna(axis=0, how="all").dropna(axis=1, how="all")
        if trimmed.empty:
            return trimmed

        header_row_index = self._detect_header_row_index(trimmed)
        header_values = [self._header_cell_to_text(value) for value in trimmed.iloc[header_row_index].tolist()]
        body = trimmed.iloc[header_row_index + 1 :].copy()
        body.columns = header_values
        body = body.loc[:, [str(col).strip() for col in body.columns if str(col).strip()]]
        body = body.dropna(axis=0, how="all").reset_index(drop=True)
        return body

    def _detect_header_row_index(self, df: pd.DataFrame) -> int:
        best_index = 0
        best_score = -1
        max_scan = min(len(df.index), 12)
        for idx in range(max_scan):
            raw_values = df.iloc[idx].tolist()
            text_values = [self._header_cell_to_text(value) for value in raw_values]
            non_empty = [value for value in text_values if value]
            if len(non_empty) < 2:
                continue
            normalized = [self._normalize_header_text(value) for value in non_empty]
            normalized_set = set(normalized)
            hint_score = 0
            for report_type, required in REPORT_TYPE_HINTS.items():
                overlap = sum(1 for value in required if value in normalized_set)
                minimum = REPORT_TYPE_MIN_MATCHES.get(report_type, max(2, min(len(required), 3)))
                if overlap >= minimum:
                    hint_score = max(hint_score, overlap * 10)
            alias_score = sum(3 for value in non_empty if self._normalize_header_text(value) != self._header_cell_to_text(value).lower().replace(" ", "_"))
            string_score = sum(1 for value in non_empty if not any(char.isdigit() for char in value))
            score = hint_score + alias_score + string_score
            if score > best_score:
                best_score = score
                best_index = idx
        return best_index

    def _header_cell_to_text(self, value: object) -> str:
        if value is None:
            return ""
        if isinstance(value, float) and pd.isna(value):
            return ""
        return str(value).strip()

    def _detect_csv_encoding(self, path: Path) -> str:
        raw = path.read_bytes()[:200_000]
        detected = chardet.detect(raw)
        encoding = (detected.get("encoding") or "utf-8").lower()
        if encoding in {"windows-1251", "cp1251", "1251"}:
            return "cp1251"
        return encoding or "utf-8"

    async def _dispatch_parse(self, report_type: str, df: pd.DataFrame) -> list[dict]:
        df = await self._normalize_dataframe_headers(df)
        if report_type in {"trial_balance", "account_analysis", "reconciliation"}:
            return await self.parse_trial_balance(df)
        if report_type in {"cash_flow", "account_card"}:
            return await self.parse_cash_flow(df)
        if report_type == "sales":
            return await self.parse_sales_report(df)
        if report_type == "counterparties":
            return await self.parse_counterparties(df)
        if report_type == "inventory":
            return await self.parse_inventory(df)
        if report_type == "payroll":
            return await self.parse_payroll(df)
        raise HTTPException(status_code=422, detail=f"Unsupported report type '{report_type}'.")

    async def _normalize_dataframe_headers(self, df: pd.DataFrame) -> pd.DataFrame:
        renamed = {col: await self.normalize_cyrillic_header(str(col)) for col in df.columns}
        return df.rename(columns=renamed)

    def _iter_rows(self, df: pd.DataFrame):
        for row in df.to_dict(orient="records"):
            if not any(value not in (None, "", float("nan")) for value in row.values()):
                continue
            yield row

    def _pick(self, row: dict, key: str):
        return row.get(key)

    def _string(self, value: object) -> str | None:
        if value is None:
            return None
        if pd.isna(value):
            return None
        text = str(value).strip()
        return text or None


def validate_uploaded_file(file_name: str, content_type: str | None, payload: bytes, *, max_upload_mb: int, max_uncompressed_mb: int = 100) -> None:
    safe_name = (file_name or "").strip().lower()
    if not safe_name:
        raise HTTPException(status_code=400, detail="Uploaded file is missing a filename.")
    if not any(safe_name.endswith(ext) for ext in (".csv", ".xlsx", ".xml", ".mxl")):
        raise HTTPException(status_code=422, detail="Unsupported 1C file format.")
    if safe_name.endswith(".xlsm"):
        raise HTTPException(status_code=422, detail="Macro-enabled Excel files are not allowed.")
    if len(payload) > max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds the {max_upload_mb}MB upload limit.")
    allowed_mime_prefixes = (
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/xml",
        "text/xml",
        "application/octet-stream",
        "text/plain",
    )
    mime = (content_type or "").lower()
    if mime and not any(mime.startswith(prefix) for prefix in allowed_mime_prefixes):
        raise HTTPException(status_code=422, detail=f"Unsupported file MIME type: {content_type}")
    if safe_name.endswith(".xlsx"):
        try:
            with zipfile.ZipFile(BytesIO(payload)) as archive:
                total_uncompressed = sum(info.file_size for info in archive.infolist())
                if total_uncompressed > max_uncompressed_mb * 1024 * 1024:
                    raise HTTPException(status_code=422, detail="The Excel file expands beyond the allowed uncompressed size.")
                if any(info.filename.lower().endswith("vbaProject.bin".lower()) for info in archive.infolist()):
                    raise HTTPException(status_code=422, detail="Macro-enabled Excel content is not allowed.")
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=422, detail=f"Invalid Excel archive: {exc}")
