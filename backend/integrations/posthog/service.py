import time
from datetime import datetime, timedelta
from typing import Any

import httpx

from core.config import settings
from database import admin_schemas

_CACHE_TTL_SECONDS = 90
_analytics_cache: dict[int, tuple[float, admin_schemas.AdminPosthogAnalyticsOut]] = {}

_EVENT_LOGIN_SUCCESS = "benela_auth_login_success"
_EVENT_SIGNUP_SUCCESS = "benela_auth_signup_success"
_EVENT_WORKSPACE_BOOTSTRAPPED = "benela_client_workspace_bootstrapped"
_EVENT_BUSINESS_PROFILE_SAVED = "benela_client_business_profile_saved"
_EVENT_PAGE_VIEW = "benela_page_view"
_EVENT_MODULE_VIEW = "benela_module_view"
_EVENT_AI_PROMPT = "benela_ai_prompt_sent"


def _normalize_posthog_api_host(raw_host: str) -> str:
    host = (raw_host or "").strip().rstrip("/")
    if not host:
        return ""
    if host.startswith("https://us.i.posthog.com"):
        return host.replace("https://us.i.posthog.com", "https://us.posthog.com", 1)
    if host.startswith("https://eu.i.posthog.com"):
        return host.replace("https://eu.i.posthog.com", "https://eu.posthog.com", 1)
    return host


def _empty_payload(days: int, *, configured: bool, error: str | None = None) -> admin_schemas.AdminPosthogAnalyticsOut:
    return admin_schemas.AdminPosthogAnalyticsOut(
        enabled=False,
        configured=configured,
        host=_normalize_posthog_api_host(settings.POSTHOG_API_HOST) or None,
        project_id=(settings.POSTHOG_PROJECT_ID or None),
        window_days=days,
        generated_at=datetime.utcnow(),
        error=error,
    )


def _coerce_int(value: Any) -> int:
    if value is None:
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _rows_from_query_response(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw_results = payload.get("results")
    if not isinstance(raw_results, list):
        return []
    if raw_results and isinstance(raw_results[0], dict):
        return [row for row in raw_results if isinstance(row, dict)]
    columns = payload.get("columns")
    if not isinstance(columns, list):
        return []
    rows: list[dict[str, Any]] = []
    for row in raw_results:
        if isinstance(row, list):
            rows.append({str(columns[index]): row[index] for index in range(min(len(columns), len(row)))})
    return rows


class PostHogService:
    def __init__(self) -> None:
        self.api_host = _normalize_posthog_api_host(settings.POSTHOG_API_HOST)
        self.project_id = (settings.POSTHOG_PROJECT_ID or "").strip()
        self.personal_api_key = (settings.POSTHOG_PERSONAL_API_KEY or "").strip()

    @property
    def configured(self) -> bool:
        return bool(self.api_host and self.project_id and self.personal_api_key)

    def fetch_admin_product_analytics(self, days: int = 30) -> admin_schemas.AdminPosthogAnalyticsOut:
        safe_days = max(7, min(days, 180))
        cached = _analytics_cache.get(safe_days)
        now = time.monotonic()
        if cached and now - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]

        if not self.configured:
            payload = _empty_payload(safe_days, configured=False)
            _analytics_cache[safe_days] = (now, payload)
            return payload

        try:
            totals = self._fetch_totals(safe_days)
            daily = self._fetch_daily_activity(safe_days)
            top_pages = self._fetch_breakdown(
                safe_days,
                event_name=_EVENT_PAGE_VIEW,
                property_name="path",
                fallback_label="Unknown path",
                limit=8,
            )
            top_modules = self._fetch_breakdown(
                safe_days,
                event_name=_EVENT_MODULE_VIEW,
                property_name="section",
                fallback_label="Unknown module",
                limit=8,
            )
            role_breakdown = self._fetch_breakdown(
                safe_days,
                event_name=_EVENT_PAGE_VIEW,
                property_name="user_role",
                fallback_label="anonymous",
                limit=6,
            )
        except Exception as exc:
            payload = _empty_payload(safe_days, configured=True, error=f"PostHog query failed: {exc}")
            _analytics_cache[safe_days] = (now, payload)
            return payload

        signups = totals.get("signups", 0)
        workspace_bootstraps = totals.get("workspace_bootstraps", 0)
        business_profiles_saved = totals.get("business_profiles_saved", 0)
        activation_rate = round((business_profiles_saved / signups) * 100, 1) if signups else 0.0
        workspace_ready_rate = round((workspace_bootstraps / signups) * 100, 1) if signups else 0.0

        funnel_steps = [
            ("Signups", signups),
            ("Logins", totals.get("logins", 0)),
            ("Workspace ready", workspace_bootstraps),
            ("Business profile saved", business_profiles_saved),
        ]
        activation_funnel: list[admin_schemas.AdminPosthogFunnelStepOut] = []
        previous_value = 0
        for index, (label, value) in enumerate(funnel_steps):
            percent_of_previous = 100.0 if index == 0 and value > 0 else round((value / previous_value) * 100, 1) if previous_value else 0.0
            percent_of_signups = round((value / signups) * 100, 1) if signups else 0.0
            activation_funnel.append(
                admin_schemas.AdminPosthogFunnelStepOut(
                    step=label,
                    value=value,
                    percent_of_previous=percent_of_previous,
                    percent_of_signups=percent_of_signups,
                )
            )
            previous_value = value

        payload = admin_schemas.AdminPosthogAnalyticsOut(
            enabled=True,
            configured=True,
            host=self.api_host or None,
            project_id=self.project_id or None,
            window_days=safe_days,
            generated_at=datetime.utcnow(),
            summary=admin_schemas.AdminPosthogSummaryOut(
                active_users=totals.get("active_users", 0),
                pageviews=totals.get("pageviews", 0),
                module_views=totals.get("module_views", 0),
                ai_prompts=totals.get("ai_prompts", 0),
                logins=totals.get("logins", 0),
                signups=signups,
                workspace_bootstraps=workspace_bootstraps,
                business_profiles_saved=business_profiles_saved,
                activation_rate_percent=activation_rate,
                workspace_ready_rate_percent=workspace_ready_rate,
            ),
            daily_activity=daily,
            top_pages=top_pages,
            top_modules=top_modules,
            role_breakdown=role_breakdown,
            activation_funnel=activation_funnel,
        )
        _analytics_cache[safe_days] = (now, payload)
        return payload

    def _query_hogql(self, query: str) -> list[dict[str, Any]]:
        if not self.configured:
            return []
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            response = client.post(
                f"{self.api_host}/api/projects/{self.project_id}/query/",
                headers={
                    "Authorization": f"Bearer {self.personal_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "query": {
                        "kind": "HogQLQuery",
                        "query": query,
                    }
                },
            )
        response.raise_for_status()
        payload = response.json()
        return _rows_from_query_response(payload)

    def _fetch_totals(self, days: int) -> dict[str, int]:
        rows = self._query_hogql(
            f"""
            SELECT
              uniqIf(distinct_id, event = '{_EVENT_PAGE_VIEW}') AS active_users,
              countIf(event = '{_EVENT_PAGE_VIEW}') AS pageviews,
              countIf(event = '{_EVENT_MODULE_VIEW}') AS module_views,
              countIf(event = '{_EVENT_AI_PROMPT}') AS ai_prompts,
              countIf(event = '{_EVENT_LOGIN_SUCCESS}') AS logins,
              countIf(event = '{_EVENT_SIGNUP_SUCCESS}') AS signups,
              countIf(event = '{_EVENT_WORKSPACE_BOOTSTRAPPED}') AS workspace_bootstraps,
              countIf(event = '{_EVENT_BUSINESS_PROFILE_SAVED}') AS business_profiles_saved
            FROM events
            WHERE timestamp >= now() - INTERVAL {days} DAY
            """
        )
        row = rows[0] if rows else {}
        return {
            "active_users": _coerce_int(row.get("active_users")),
            "pageviews": _coerce_int(row.get("pageviews")),
            "module_views": _coerce_int(row.get("module_views")),
            "ai_prompts": _coerce_int(row.get("ai_prompts")),
            "logins": _coerce_int(row.get("logins")),
            "signups": _coerce_int(row.get("signups")),
            "workspace_bootstraps": _coerce_int(row.get("workspace_bootstraps")),
            "business_profiles_saved": _coerce_int(row.get("business_profiles_saved")),
        }

    def _fetch_daily_activity(self, days: int) -> list[admin_schemas.AdminPosthogTrendPointOut]:
        rows = self._query_hogql(
            f"""
            SELECT
              toDate(timestamp) AS day,
              uniqIf(distinct_id, event = '{_EVENT_PAGE_VIEW}') AS active_users,
              countIf(event = '{_EVENT_PAGE_VIEW}') AS pageviews,
              countIf(event = '{_EVENT_AI_PROMPT}') AS ai_prompts
            FROM events
            WHERE timestamp >= toStartOfDay(now() - INTERVAL {days - 1} DAY)
              AND event IN ('{_EVENT_PAGE_VIEW}', '{_EVENT_AI_PROMPT}')
            GROUP BY day
            ORDER BY day ASC
            """
        )
        row_map = {
            str(row.get("day")): admin_schemas.AdminPosthogTrendPointOut(
                day=str(row.get("day")),
                active_users=_coerce_int(row.get("active_users")),
                pageviews=_coerce_int(row.get("pageviews")),
                ai_prompts=_coerce_int(row.get("ai_prompts")),
            )
            for row in rows
        }
        series: list[admin_schemas.AdminPosthogTrendPointOut] = []
        start_day = datetime.utcnow().date() - timedelta(days=days - 1)
        for offset in range(days):
            day = (start_day + timedelta(days=offset)).isoformat()
            series.append(
                row_map.get(
                    day,
                    admin_schemas.AdminPosthogTrendPointOut(day=day, active_users=0, pageviews=0, ai_prompts=0),
                )
            )
        return series

    def _fetch_breakdown(
        self,
        days: int,
        *,
        event_name: str,
        property_name: str,
        fallback_label: str,
        limit: int,
    ) -> list[admin_schemas.AdminPosthogBreakdownItemOut]:
        rows = self._query_hogql(
            f"""
            SELECT
              coalesce(nullIf(toString(properties['{property_name}']), ''), '{fallback_label}') AS label,
              count() AS value
            FROM events
            WHERE timestamp >= now() - INTERVAL {days} DAY
              AND event = '{event_name}'
            GROUP BY label
            ORDER BY value DESC
            LIMIT {limit}
            """
        )
        return [
            admin_schemas.AdminPosthogBreakdownItemOut(
                label=str(row.get("label") or fallback_label),
                value=_coerce_int(row.get("value")),
            )
            for row in rows
            if _coerce_int(row.get("value")) > 0
        ]


def get_admin_posthog_analytics(days: int = 30) -> admin_schemas.AdminPosthogAnalyticsOut:
    return PostHogService().fetch_admin_product_analytics(days)
