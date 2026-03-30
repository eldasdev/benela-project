from __future__ import annotations

import unittest
from datetime import UTC, datetime
from unittest.mock import patch

from agents.data_fetcher import (
    get_context_for_section,
    get_onec_anomalies,
    get_onec_cashflow_forecast,
    get_onec_context,
)
from database.models import Invoice, Transaction
from database.onec_models import OneCImportJob, OneCRecord
from tests.test_onec._helpers import SqliteOneCTestHarness


class OneCAIContextTests(unittest.TestCase):
    def setUp(self) -> None:
        self.harness = SqliteOneCTestHarness()
        self.session_patch = patch("agents.data_fetcher.SessionLocal", self.harness.SessionLocal)
        self.session_patch.start()

        with self.harness.SessionLocal() as db:
            db.add(
                Transaction(
                    company_id=1,
                    description="Manual Benela payment",
                    category="Revenue",
                    amount=1000,
                    type="income",
                    status="received",
                )
            )
            db.add(
                Invoice(
                    company_id=1,
                    invoice_number="INV-100",
                    client_name="OOO Atlas",
                    amount=1000,
                    tax=120,
                    status="pending",
                )
            )
            db.add(
                OneCImportJob(
                    company_id=1,
                    filename="cash-flow.csv",
                    storage_path="fixture",
                    mime_type="text/csv",
                    source_hint="file",
                    file_size_bytes=512,
                    report_type="cash_flow",
                    status="completed",
                    imported_by="test-user",
                    completed_at=datetime.now(UTC).replace(tzinfo=None),
                )
            )
            db.flush()
            db.add_all(
                [
                    OneCRecord(
                        import_job_id=1,
                        company_id=1,
                        record_type="transaction",
                        row_status="imported",
                        import_hash="hash-1",
                        raw_data={},
                        normalized_data={
                            "amount": 1500000,
                            "type": "income",
                            "date": datetime.now(UTC).date().isoformat(),
                            "description": "Оплата клиента",
                            "counterparty": "OOO Atlas",
                            "account": "5110",
                            "currency": "UZS",
                        },
                    ),
                    OneCRecord(
                        import_job_id=1,
                        company_id=1,
                        record_type="inventory_item",
                        row_status="ready",
                        import_hash="hash-2",
                        raw_data={},
                        normalized_data={
                            "product_name": "Cotton Yarn",
                            "closing_stock": -2,
                        },
                    ),
                ]
            )
            db.commit()

    def tearDown(self) -> None:
        self.session_patch.stop()
        self.harness.close()

    def test_onec_context_is_included_for_finance(self):
        context = get_context_for_section("finance", company_id=1, include_onec=True)
        self.assertIn("1C INTEGRATION DATA", context)
        self.assertIn("UZS", context)

    def test_onec_context_can_be_disabled(self):
        context = get_context_for_section("finance", company_id=1, include_onec=False)
        self.assertNotIn("1C INTEGRATION DATA", context)

    def test_onec_anomalies_and_forecast_have_business_signals(self):
        anomalies = get_onec_anomalies(1)
        forecast = get_onec_cashflow_forecast(1)
        summary = get_onec_context(1)

        self.assertIn("Negative inventory balances", anomalies)
        self.assertIn("Projected 30-day cash position change", forecast)
        self.assertIn("Imported transaction rows", summary)


if __name__ == "__main__":
    unittest.main()
