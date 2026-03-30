from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.onec import router as onec_router
from database.connection import get_db
from database.models import Transaction
from integrations.onec import service as onec_service
from tests.test_onec._helpers import SqliteOneCTestHarness, fake_account


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class OneCApiUploadFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.harness = SqliteOneCTestHarness()
        self.app = FastAPI()
        self.app.include_router(onec_router)
        self.app.dependency_overrides[get_db] = self.harness.get_db
        onec_service.ONEC_STORAGE_ROOT = self.harness.storage_root

        self.resolve_company_patch = patch("api.onec.resolve_company_account", return_value=fake_account())
        self.processor_session_patch = patch("integrations.onec.processor.SessionLocal", self.harness.SessionLocal)
        self.resolve_company_patch.start()
        self.processor_session_patch.start()
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.resolve_company_patch.stop()
        self.processor_session_patch.stop()
        self.harness.close()

    def test_upload_parse_and_confirm_flow(self):
        fixture = FIXTURES / "sample_cash_flow.csv"
        with fixture.open("rb") as handle:
            response = self.client.post(
                "/onec/import/upload",
                files={"file": (fixture.name, handle.read(), "text/csv")},
            )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "pending")
        job_id = payload["job_id"]

        jobs_response = self.client.get("/onec/import/jobs")
        self.assertEqual(jobs_response.status_code, 200, jobs_response.text)
        jobs = jobs_response.json()
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["status"], "completed")

        records_response = self.client.get(f"/onec/import/jobs/{job_id}/records")
        self.assertEqual(records_response.status_code, 200, records_response.text)
        records_payload = records_response.json()
        self.assertEqual(records_payload["total"], 2)

        confirm_response = self.client.post(f"/onec/import/jobs/{job_id}/confirm")
        self.assertEqual(confirm_response.status_code, 200, confirm_response.text)
        confirm_payload = confirm_response.json()
        self.assertEqual(confirm_payload["status"], "success")
        self.assertEqual(confirm_payload["imported"], 2)

        with self.harness.SessionLocal() as db:
            imported_count = db.query(Transaction).count()
        self.assertEqual(imported_count, 2)


if __name__ == "__main__":
    unittest.main()
