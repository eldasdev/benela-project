"""Async Facebook Graph API client for Marketing API operations.

Wraps the essential endpoints required by Benela's Marketing module:
- OAuth token exchange (short-lived → long-lived)
- Ad account discovery and selection
- Campaign read + write (pause/activate/create/update/delete)
- Ad set / ad listing
- Insights (spend, impressions, clicks, conversions) with configurable date presets

All methods raise ``HTTPException`` with cleaned-up error messages on
non-2xx responses so API callers can propagate them directly to clients.
"""

from __future__ import annotations

from typing import Any, Iterable

import httpx
from fastapi import HTTPException

from core.config import settings

_DEFAULT_CAMPAIGN_FIELDS = [
    "id",
    "name",
    "objective",
    "status",
    "effective_status",
    "daily_budget",
    "lifetime_budget",
    "budget_remaining",
    "start_time",
    "stop_time",
    "created_time",
    "updated_time",
    "special_ad_categories",
]

_DEFAULT_INSIGHT_FIELDS = [
    "spend",
    "impressions",
    "reach",
    "clicks",
    "cpc",
    "cpm",
    "ctr",
    "actions",
    "action_values",
    "date_start",
    "date_stop",
]

_WRITABLE_CAMPAIGN_STATUSES = {"ACTIVE", "PAUSED", "ARCHIVED", "DELETED"}


def _graph_base_url() -> str:
    return f"https://graph.facebook.com/{settings.FACEBOOK_API_VERSION}"


def _extract_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except Exception:  # noqa: BLE001
        return response.text[:300] or "Facebook Graph API error"
    err = payload.get("error") or {}
    message = err.get("message") or "Facebook Graph API error"
    code = err.get("code")
    subcode = err.get("error_subcode")
    trace = err.get("fbtrace_id")
    parts = [message]
    if code:
        parts.append(f"code={code}")
    if subcode:
        parts.append(f"subcode={subcode}")
    if trace:
        parts.append(f"trace={trace}")
    return " | ".join(str(p) for p in parts)


class FacebookConfigurationError(HTTPException):
    def __init__(self) -> None:
        super().__init__(
            status_code=503,
            detail="Facebook integration is not configured. Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.",
        )


class FacebookTokenExpiredError(HTTPException):
    def __init__(self) -> None:
        super().__init__(
            status_code=409,
            detail="Facebook access token is expired or invalid. Please reconnect the integration.",
        )


def _require_app_credentials() -> tuple[str, str]:
    app_id = (settings.FACEBOOK_APP_ID or "").strip()
    app_secret = (settings.FACEBOOK_APP_SECRET or "").strip()
    if not app_id or not app_secret:
        raise FacebookConfigurationError()
    return app_id, app_secret


class FacebookGraphClient:
    """Thin async wrapper around the Facebook Graph API."""

    def __init__(self, access_token: str, api_version: str | None = None) -> None:
        self.access_token = (access_token or "").strip()
        if not self.access_token:
            raise FacebookTokenExpiredError()
        self.api_version = api_version or settings.FACEBOOK_API_VERSION
        self.base_url = f"https://graph.facebook.com/{self.api_version}"
        self.timeout = httpx.Timeout(30.0)

    # ---------- request primitives ----------

    def _inject_token(self, params: dict | None) -> dict:
        out = dict(params or {})
        out.setdefault("access_token", self.access_token)
        return out

    async def _get(self, path: str, params: dict | None = None) -> Any:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}{path}", params=self._inject_token(params))
        if response.status_code == 401 or response.status_code == 403:
            raise FacebookTokenExpiredError()
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=_extract_error(response))
        return response.json()

    async def _post(self, path: str, data: dict | None = None) -> Any:
        payload = self._inject_token(data)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.base_url}{path}", data=payload)
        if response.status_code == 401 or response.status_code == 403:
            raise FacebookTokenExpiredError()
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=_extract_error(response))
        return response.json()

    async def _delete(self, path: str) -> Any:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.delete(f"{self.base_url}{path}", params=self._inject_token(None))
        if response.status_code == 401 or response.status_code == 403:
            raise FacebookTokenExpiredError()
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=_extract_error(response))
        try:
            return response.json()
        except Exception:  # noqa: BLE001
            return {"success": True}

    # ---------- OAuth helpers (static) ----------

    @staticmethod
    async def exchange_code(code: str, redirect_uri: str | None = None) -> dict:
        app_id, app_secret = _require_app_credentials()
        redirect = (redirect_uri or settings.FACEBOOK_OAUTH_REDIRECT_URI).strip()
        params = {
            "client_id": app_id,
            "client_secret": app_secret,
            "redirect_uri": redirect,
            "code": code,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{_graph_base_url()}/oauth/access_token", params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=400, detail=_extract_error(response))
        return response.json()

    @staticmethod
    async def exchange_for_long_lived(short_token: str) -> dict:
        app_id, app_secret = _require_app_credentials()
        params = {
            "grant_type": "fb_exchange_token",
            "client_id": app_id,
            "client_secret": app_secret,
            "fb_exchange_token": short_token,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{_graph_base_url()}/oauth/access_token", params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=400, detail=_extract_error(response))
        return response.json()

    @staticmethod
    async def debug_token(token: str) -> dict:
        app_id, app_secret = _require_app_credentials()
        params = {
            "input_token": token,
            "access_token": f"{app_id}|{app_secret}",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{_graph_base_url()}/debug_token", params=params)
        if response.status_code >= 400:
            raise HTTPException(status_code=400, detail=_extract_error(response))
        payload = response.json()
        return payload.get("data") or payload

    @staticmethod
    def build_oauth_url(state: str, scopes: Iterable[str] | None = None) -> str:
        app_id, _ = _require_app_credentials()
        scope_list = list(scopes or ["ads_read", "ads_management", "business_management"])
        redirect = settings.FACEBOOK_OAUTH_REDIRECT_URI
        query = httpx.QueryParams(
            {
                "client_id": app_id,
                "redirect_uri": redirect,
                "state": state,
                "scope": ",".join(scope_list),
                "response_type": "code",
                "auth_type": "rerequest",
            }
        )
        return f"https://www.facebook.com/{settings.FACEBOOK_API_VERSION}/dialog/oauth?{query}"

    # ---------- Read operations ----------

    async def get_me(self) -> dict:
        return await self._get("/me", params={"fields": "id,name,email"})

    async def list_ad_accounts(self) -> list[dict]:
        payload = await self._get(
            "/me/adaccounts",
            params={
                "fields": "id,account_id,name,currency,account_status,timezone_name,amount_spent,balance",
                "limit": 100,
            },
        )
        return payload.get("data", []) if isinstance(payload, dict) else []

    async def get_ad_account(self, ad_account_id: str) -> dict:
        return await self._get(
            f"/{ad_account_id}",
            params={
                "fields": "id,account_id,name,currency,account_status,timezone_name,amount_spent,balance,business",
            },
        )

    async def list_campaigns(
        self,
        ad_account_id: str,
        *,
        fields: list[str] | None = None,
        limit: int = 100,
    ) -> list[dict]:
        payload = await self._get(
            f"/{ad_account_id}/campaigns",
            params={
                "fields": ",".join(fields or _DEFAULT_CAMPAIGN_FIELDS),
                "limit": limit,
            },
        )
        return payload.get("data", []) if isinstance(payload, dict) else []

    async def get_campaign(self, campaign_id: str) -> dict:
        return await self._get(
            f"/{campaign_id}",
            params={"fields": ",".join(_DEFAULT_CAMPAIGN_FIELDS)},
        )

    async def list_adsets(self, campaign_id: str, limit: int = 50) -> list[dict]:
        payload = await self._get(
            f"/{campaign_id}/adsets",
            params={
                "fields": "id,name,status,daily_budget,lifetime_budget,optimization_goal,billing_event,start_time,end_time",
                "limit": limit,
            },
        )
        return payload.get("data", []) if isinstance(payload, dict) else []

    async def list_ads(self, adset_id: str, limit: int = 50) -> list[dict]:
        payload = await self._get(
            f"/{adset_id}/ads",
            params={
                "fields": "id,name,status,effective_status,creative,preview_shareable_link",
                "limit": limit,
            },
        )
        return payload.get("data", []) if isinstance(payload, dict) else []

    async def get_insights(
        self,
        entity_id: str,
        *,
        date_preset: str = "last_30d",
        time_increment: int | None = None,
        fields: list[str] | None = None,
    ) -> list[dict]:
        params: dict[str, Any] = {
            "fields": ",".join(fields or _DEFAULT_INSIGHT_FIELDS),
            "date_preset": date_preset,
            "limit": 500,
        }
        if time_increment is not None:
            params["time_increment"] = time_increment
        payload = await self._get(f"/{entity_id}/insights", params=params)
        return payload.get("data", []) if isinstance(payload, dict) else []

    # ---------- Write operations ----------

    async def pause_campaign(self, campaign_id: str) -> dict:
        return await self._post(f"/{campaign_id}", data={"status": "PAUSED"})

    async def activate_campaign(self, campaign_id: str) -> dict:
        return await self._post(f"/{campaign_id}", data={"status": "ACTIVE"})

    async def update_campaign(self, campaign_id: str, data: dict) -> dict:
        payload: dict[str, Any] = {}
        if "name" in data and data["name"]:
            payload["name"] = str(data["name"]).strip()
        if "daily_budget" in data and data["daily_budget"] is not None:
            payload["daily_budget"] = int(round(float(data["daily_budget"]) * 100))
        if "lifetime_budget" in data and data["lifetime_budget"] is not None:
            payload["lifetime_budget"] = int(round(float(data["lifetime_budget"]) * 100))
        if "status" in data and data["status"]:
            status = str(data["status"]).upper()
            if status not in _WRITABLE_CAMPAIGN_STATUSES:
                raise HTTPException(status_code=400, detail=f"Unsupported campaign status '{status}'.")
            payload["status"] = status
        if not payload:
            raise HTTPException(status_code=400, detail="No updatable campaign fields provided.")
        return await self._post(f"/{campaign_id}", data=payload)

    async def create_campaign(self, ad_account_id: str, data: dict) -> dict:
        name = str(data.get("name") or "").strip()
        objective = str(data.get("objective") or "OUTCOME_TRAFFIC").strip().upper()
        status = str(data.get("status") or "PAUSED").upper()
        if not name:
            raise HTTPException(status_code=400, detail="Campaign name is required.")
        if status not in _WRITABLE_CAMPAIGN_STATUSES:
            raise HTTPException(status_code=400, detail=f"Unsupported campaign status '{status}'.")
        payload: dict[str, Any] = {
            "name": name,
            "objective": objective,
            "status": status,
            "special_ad_categories": data.get("special_ad_categories") or "[]",
        }
        if data.get("daily_budget") is not None:
            payload["daily_budget"] = int(round(float(data["daily_budget"]) * 100))
        if data.get("lifetime_budget") is not None:
            payload["lifetime_budget"] = int(round(float(data["lifetime_budget"]) * 100))
        return await self._post(f"/{ad_account_id}/campaigns", data=payload)

    async def delete_campaign(self, campaign_id: str) -> dict:
        return await self._delete(f"/{campaign_id}")
