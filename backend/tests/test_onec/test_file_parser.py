from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory

import pandas as pd
from fastapi import HTTPException

from integrations.onec.file_parser import OneCFileParser, validate_uploaded_file


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class OneCFileParserTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.parser = OneCFileParser()

    async def test_parses_cash_flow_csv_fixture(self):
        parsed = await self.parser.parse_file(FIXTURES / "sample_cash_flow.csv")
        self.assertEqual(parsed.report_type, "cash_flow")
        self.assertEqual(parsed.detected_encoding, "utf-8")
        self.assertEqual(len(parsed.rows), 2)
        self.assertEqual(parsed.rows[0]["counterparty"], "OOO Atlas")
        self.assertEqual(parsed.rows[0]["currency"], "UZS")

    async def test_parses_inventory_xml_fixture(self):
        parsed = await self.parser.parse_file(FIXTURES / "sample_inventory.xml")
        self.assertEqual(parsed.report_type, "inventory")
        self.assertEqual(len(parsed.rows), 2)
        self.assertEqual(parsed.rows[0]["warehouse"], "Омбор 1")
        self.assertEqual(parsed.rows[1]["closing_stock"], "65")

    async def test_detects_windows_1251_csv(self):
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "cash-flow-cp1251.csv"
            payload = (
                "Дата;Сумма;Контрагент;Назначение платежа\n"
                "15.03.2025;1 234 567,89;OOO Atlas;Оплата по договору\n"
            ).encode("cp1251")
            path.write_bytes(payload)
            parsed = await self.parser.parse_file(path, report_type_hint="cash_flow")
        self.assertEqual(parsed.detected_encoding, "cp1251")
        self.assertEqual(parsed.rows[0]["description"], "Оплата по договору")

    async def test_normalizes_uzbek_date_and_amount_formats(self):
        amount = await self.parser.normalize_amount("1 234 567,89")
        parsed_date = await self.parser.normalize_date("15.03.2025")
        self.assertEqual(amount, Decimal("1234567.89"))
        self.assertEqual(parsed_date, date(2025, 3, 15))

    async def test_rejects_macro_enabled_uploads(self):
        with self.assertRaises(HTTPException) as ctx:
            validate_uploaded_file(
                file_name="report.xlsm",
                content_type="application/vnd.ms-excel.sheet.macroEnabled.12",
                payload=b"fake-macro",
                max_upload_mb=50,
            )
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_detects_sales_xlsx_without_explicit_amount_column(self):
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "sample-sales.xlsx"
            pd.DataFrame(
                [
                    ["Sample Company Sales", None, None, None, None],
                    [None, None, None, None, None],
                    ["Date", "Invoice", "Customer", "Product", "Sales Amount"],
                    ["2026-03-15", "REAL-001", "Textile Group", "Fabric Roll", "7 800 000,00"],
                ]
            ).to_excel(path, index=False, header=False)
            parsed = await self.parser.parse_file(path)
        self.assertEqual(parsed.report_type, "sales")
        self.assertEqual(parsed.rows[0]["invoice_number"], "REAL-001")
        self.assertEqual(parsed.rows[0]["client_name"], "Textile Group")


if __name__ == "__main__":
    unittest.main()
