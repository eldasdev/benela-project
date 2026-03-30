from __future__ import annotations

from datetime import date

import httpx
from fastapi import HTTPException

from core.config import settings
from database.onec_models import OneCConnection
from integrations.onec.security import decrypt_secret


class OneCHTTPClient:
    def __init__(self, connection: OneCConnection):
        self.connection = connection
        self.base_url = (connection.api_base_url or "").rstrip("/")
        self.username = decrypt_secret(connection.api_username) if connection.api_username else None
        self.password = decrypt_secret(connection.api_password) if connection.api_password else None
        self.timeout = httpx.Timeout(settings.ONEC_SYNC_TIMEOUT_SECONDS)

    async def _get(self, path: str, params: dict | None = None):
        if not self.base_url:
            raise HTTPException(status_code=422, detail="1C HTTP base URL is not configured.")
        async with httpx.AsyncClient(timeout=self.timeout, auth=(self.username or "", self.password or ""), verify=True) as client:
            response = await client.get(f"{self.base_url}{path}", params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=422, detail=f"1C HTTP service returned {response.status_code}: {response.text[:300]}")
        return response.json()

    async def ping(self) -> bool:
        payload = await self._get("/hs/benela/v1/ping")
        return bool(payload.get("ok") or payload.get("status") in {"ok", "success"} or payload is True)

    async def get_realtime_balance(self, account_code: str | None = None) -> dict:
        params = {"account_code": account_code} if account_code else None
        return await self._get("/hs/benela/v1/balance", params=params)

    async def get_recent_transactions(self, hours_back: int = 24) -> list[dict]:
        payload = await self._get("/hs/benela/v1/transactions", params={"hours_back": max(1, hours_back)})
        return payload if isinstance(payload, list) else payload.get("data", [])

    async def get_inventory_snapshot(self) -> list[dict]:
        payload = await self._get("/hs/benela/v1/inventory")
        return payload if isinstance(payload, list) else payload.get("data", [])

    async def get_counterparties(self) -> list[dict]:
        payload = await self._get("/hs/benela/v1/counterparties")
        return payload if isinstance(payload, list) else payload.get("data", [])

    async def get_employees(self) -> list[dict]:
        payload = await self._get("/hs/benela/v1/employees")
        return payload if isinstance(payload, list) else payload.get("data", [])

    async def get_payroll(self, month: date) -> list[dict]:
        payload = await self._get(f"/hs/benela/v1/payroll/{month.isoformat()}")
        return payload if isinstance(payload, list) else payload.get("data", [])

    async def get_sales_docs(self, date_from: date, date_to: date) -> list[dict]:
        payload = await self._get("/hs/benela/v1/documents/sales", params={"date_from": date_from.isoformat(), "date_to": date_to.isoformat()})
        return payload if isinstance(payload, list) else payload.get("data", [])
