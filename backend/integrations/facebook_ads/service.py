"""High-level Facebook Ads service layer.

Responsibilities:
- Resolve a caller (owner or team member) to their ``client_org_id``
- Load / persist the org's ``FacebookAdsConnection`` record
- Encrypt access tokens before storage and decrypt on demand
- Orchestrate OAuth code → long-lived token exchange
- Fetch insights with a short-lived cache (ttl configurable)
- Compute KPI aggregates (spend, CTR, CPC, CPM, ROAS, projected monthly)
- Sync Facebook Ads data into the existing ``marketing_channel_metrics`` table
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from core.config import settings
from database.models import (
    ClientWorkspaceAccount,
    FacebookAdsConnection,
    FacebookAdsInsightCache,
    FacebookConnectionStatus,
    MarketingChannelMetric,
    TeamMember,
    TeamMemberStatus,
)
from integrations.facebook_ads.client import (
    FacebookConfigurationError,
    FacebookGraphClient,
    FacebookTokenExpiredError,
)
from integrations.facebook_ads.security import decrypt_secret, encrypt_secret

_FACEBOOK_CHANNEL_NAME = "Facebook Ads"


# ─────────────────────────────────────────────────────────────
# Org / connection resolution
# ─────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def resolve_client_org_id(db: Session, user_id: str) -> int:
    """Return the ``client_org_id`` for the current user.

    Owners have a ``ClientWorkspaceAccount`` linked to an org. Team members
    have a ``TeamMember`` row with ``status == active`` linked to an org.
    """
    account = (
        db.query(ClientWorkspaceAccount)
        .filter(ClientWorkspaceAccount.user_id == user_id)
        .first()
    )
    if account and account.client_org_id:
        return account.client_org_id

    member = (
        db.query(TeamMember)
        .filter(
            TeamMember.user_id == user_id,
            TeamMember.status == TeamMemberStatus.active,
        )
        .first()
    )
    if member and member.client_org_id:
        return member.client_org_id

    raise HTTPException(
        status_code=403,
        detail="You must belong to a workspace to use the Facebook Ads integration.",
    )


def is_owner(db: Session, user_id: str) -> bool:
    account = (
        db.query(ClientWorkspaceAccount)
        .filter(ClientWorkspaceAccount.user_id == user_id)
        .first()
    )
    return bool(account and account.client_org_id)


def require_configured() -> None:
    """Raise 503 if Facebook credentials are not configured."""
    if not (settings.FACEBOOK_APP_ID or "").strip() or not (settings.FACEBOOK_APP_SECRET or "").strip():
        raise FacebookConfigurationError()
    if not (settings.INTEGRATION_ENCRYPTION_KEY or "").strip():
        raise HTTPException(
            status_code=503,
            detail="INTEGRATION_ENCRYPTION_KEY is not configured; cannot store integration credentials securely.",
        )


def get_connection(db: Session, client_org_id: int) -> FacebookAdsConnection | None:
    return (
        db.query(FacebookAdsConnection)
        .filter(FacebookAdsConnection.client_org_id == client_org_id)
        .first()
    )


def get_active_connection_or_404(db: Session, client_org_id: int) -> FacebookAdsConnection:
    connection = get_connection(db, client_org_id)
    if not connection:
        raise HTTPException(
            status_code=404,
            detail="No Facebook Ads connection found. Connect your account first.",
        )
    if connection.status != FacebookConnectionStatus.active:
        raise HTTPException(
            status_code=409,
            detail=f"Facebook Ads connection is {connection.status.value}. Please reconnect.",
        )
    return connection


def load_graph_client(db: Session, connection: FacebookAdsConnection) -> FacebookGraphClient:
    token = decrypt_secret(connection.access_token_encrypted)
    if not token:
        connection.status = FacebookConnectionStatus.expired
        db.commit()
        raise FacebookTokenExpiredError()
    return FacebookGraphClient(token)


def mark_token_expired(db: Session, connection: FacebookAdsConnection, reason: str | None = None) -> None:
    connection.status = FacebookConnectionStatus.expired
    if reason:
        connection.last_sync_error = reason[:2000]
    db.commit()


# ─────────────────────────────────────────────────────────────
# OAuth flow
# ─────────────────────────────────────────────────────────────


def build_oauth_url(state: str) -> str:
    require_configured()
    return FacebookGraphClient.build_oauth_url(state)


async def connect_account(
    db: Session,
    *,
    client_org_id: int,
    connected_by_user_id: str,
    code: str,
) -> FacebookAdsConnection:
    require_configured()

    short = await FacebookGraphClient.exchange_code(code)
    short_token = short.get("access_token")
    if not short_token:
        raise HTTPException(status_code=400, detail="Facebook did not return an access token.")

    long = await FacebookGraphClient.exchange_for_long_lived(short_token)
    long_token = long.get("access_token") or short_token
    expires_in = int(long.get("expires_in") or 0)

    client = FacebookGraphClient(long_token)
    me = await client.get_me()

    connection = get_connection(db, client_org_id)
    if not connection:
        connection = FacebookAdsConnection(
            client_org_id=client_org_id,
            connected_by_user_id=connected_by_user_id,
        )
        db.add(connection)

    connection.connected_by_user_id = connected_by_user_id
    connection.fb_user_id = str(me.get("id") or "")
    connection.fb_user_name = str(me.get("name") or "")[:200]
    connection.access_token_encrypted = encrypt_secret(long_token)
    connection.token_type = "bearer"
    connection.token_expires_at = (
        _utcnow() + timedelta(seconds=expires_in) if expires_in else None
    )
    connection.status = FacebookConnectionStatus.active
    connection.connected_at = _utcnow()
    connection.last_sync_error = None
    db.commit()
    db.refresh(connection)
    return connection


def disconnect(db: Session, connection: FacebookAdsConnection) -> None:
    connection.access_token_encrypted = None
    connection.status = FacebookConnectionStatus.revoked
    connection.selected_ad_account_id = None
    connection.selected_ad_account_name = None
    db.commit()


# ─────────────────────────────────────────────────────────────
# Insights cache
# ─────────────────────────────────────────────────────────────


def _cache_key(
    connection_id: int,
    entity_type: str,
    entity_id: str,
    date_preset: str,
) -> dict[str, Any]:
    return {
        "connection_id": connection_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "date_preset": date_preset,
    }


def _cache_ttl_seconds() -> int:
    return max(60, int(getattr(settings, "FACEBOOK_INSIGHT_CACHE_TTL_SECONDS", 900)))


def _load_cached(
    db: Session,
    *,
    connection_id: int,
    entity_type: str,
    entity_id: str,
    date_preset: str,
) -> list[dict] | None:
    row = (
        db.query(FacebookAdsInsightCache)
        .filter_by(**_cache_key(connection_id, entity_type, entity_id, date_preset))
        .first()
    )
    if not row:
        return None
    if (_utcnow() - row.fetched_at).total_seconds() > _cache_ttl_seconds():
        return None
    try:
        payload = row.payload_json
        if isinstance(payload, str):
            payload = json.loads(payload)
        return payload.get("data") if isinstance(payload, dict) else payload
    except Exception:  # noqa: BLE001
        return None


def _store_cached(
    db: Session,
    *,
    connection_id: int,
    entity_type: str,
    entity_id: str,
    date_preset: str,
    data: list[dict],
) -> None:
    row = (
        db.query(FacebookAdsInsightCache)
        .filter_by(**_cache_key(connection_id, entity_type, entity_id, date_preset))
        .first()
    )
    payload = {"data": data}
    if row:
        row.payload_json = payload
        row.fetched_at = _utcnow()
    else:
        db.add(
            FacebookAdsInsightCache(
                connection_id=connection_id,
                entity_type=entity_type,
                entity_id=entity_id,
                date_preset=date_preset,
                payload_json=payload,
                fetched_at=_utcnow(),
            )
        )
    db.commit()


async def fetch_insights(
    db: Session,
    connection: FacebookAdsConnection,
    *,
    entity_type: str,
    entity_id: str,
    date_preset: str = "last_30d",
    force: bool = False,
) -> list[dict]:
    if not force:
        cached = _load_cached(
            db,
            connection_id=connection.id,
            entity_type=entity_type,
            entity_id=entity_id,
            date_preset=date_preset,
        )
        if cached is not None:
            return cached

    client = load_graph_client(db, connection)
    try:
        data = await client.get_insights(entity_id, date_preset=date_preset)
    except FacebookTokenExpiredError:
        mark_token_expired(db, connection, reason="Token expired during insights fetch")
        raise

    _store_cached(
        db,
        connection_id=connection.id,
        entity_type=entity_type,
        entity_id=entity_id,
        date_preset=date_preset,
        data=data,
    )
    return data


# ─────────────────────────────────────────────────────────────
# KPI computation
# ─────────────────────────────────────────────────────────────


def _sum_actions(actions: list[dict] | None, action_types: tuple[str, ...]) -> float:
    if not actions:
        return 0.0
    total = 0.0
    for action in actions:
        if not isinstance(action, dict):
            continue
        if action.get("action_type") in action_types:
            try:
                total += float(action.get("value") or 0)
            except (TypeError, ValueError):
                continue
    return total


def compute_kpis(rows: list[dict], date_preset: str = "last_30d") -> dict[str, Any]:
    """Aggregate Facebook insight rows into KPI dict suitable for UI."""
    spend = 0.0
    impressions = 0
    clicks = 0
    reach = 0
    conversions = 0.0
    conversion_value = 0.0
    date_start = None
    date_stop = None

    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            spend += float(row.get("spend") or 0)
        except (TypeError, ValueError):
            pass
        try:
            impressions += int(float(row.get("impressions") or 0))
        except (TypeError, ValueError):
            pass
        try:
            clicks += int(float(row.get("clicks") or 0))
        except (TypeError, ValueError):
            pass
        try:
            reach += int(float(row.get("reach") or 0))
        except (TypeError, ValueError):
            pass
        conversions += _sum_actions(
            row.get("actions"),
            ("purchase", "offsite_conversion.fb_pixel_purchase", "lead", "complete_registration"),
        )
        conversion_value += _sum_actions(
            row.get("action_values"),
            ("purchase", "offsite_conversion.fb_pixel_purchase"),
        )
        if not date_start:
            date_start = row.get("date_start")
        date_stop = row.get("date_stop") or date_stop

    ctr = (clicks / impressions * 100) if impressions else 0.0
    cpc = (spend / clicks) if clicks else 0.0
    cpm = (spend / impressions * 1000) if impressions else 0.0
    cost_per_conversion = (spend / conversions) if conversions else 0.0
    roas = (conversion_value / spend) if spend else 0.0

    days_by_preset = {
        "today": 1,
        "yesterday": 1,
        "last_3d": 3,
        "last_7d": 7,
        "last_14d": 14,
        "last_28d": 28,
        "last_30d": 30,
        "last_90d": 90,
        "this_month": 30,
        "last_month": 30,
    }
    days = max(1, days_by_preset.get(date_preset, 30))
    daily_avg_spend = spend / days
    projected_monthly_spend = daily_avg_spend * 30

    return {
        "spend": round(spend, 2),
        "impressions": impressions,
        "clicks": clicks,
        "reach": reach,
        "conversions": round(conversions, 2),
        "conversion_value": round(conversion_value, 2),
        "ctr": round(ctr, 2),
        "cpc": round(cpc, 2),
        "cpm": round(cpm, 2),
        "cost_per_conversion": round(cost_per_conversion, 2),
        "roas": round(roas, 2),
        "daily_avg_spend": round(daily_avg_spend, 2),
        "projected_monthly_spend": round(projected_monthly_spend, 2),
        "date_start": date_start,
        "date_stop": date_stop,
        "date_preset": date_preset,
    }


# ─────────────────────────────────────────────────────────────
# Channel metrics sync
# ─────────────────────────────────────────────────────────────


def sync_to_channel_metrics(
    db: Session,
    connection: FacebookAdsConnection,
    kpis: dict[str, Any],
    *,
    period_label: str | None = None,
) -> MarketingChannelMetric:
    """Upsert a row in marketing_channel_metrics reflecting Facebook data.

    Uses channel='Facebook Ads' + period_label as the logical key.
    """
    label = period_label or kpis.get("date_preset") or "last_30d"
    row = (
        db.query(MarketingChannelMetric)
        .filter(
            MarketingChannelMetric.channel == _FACEBOOK_CHANNEL_NAME,
            MarketingChannelMetric.period_label == label,
        )
        .first()
    )
    if not row:
        row = MarketingChannelMetric(
            channel=_FACEBOOK_CHANNEL_NAME,
            period_label=label,
        )
        db.add(row)

    row.spend = float(kpis.get("spend") or 0)
    row.revenue = float(kpis.get("conversion_value") or 0)
    row.impressions = int(kpis.get("impressions") or 0)
    row.clicks = int(kpis.get("clicks") or 0)
    row.conversions = int(kpis.get("conversions") or 0)
    row.leads = int(kpis.get("conversions") or 0)
    row.customers = int(kpis.get("conversions") or 0)
    db.commit()
    db.refresh(row)

    connection.last_sync_at = _utcnow()
    connection.last_sync_error = None
    db.commit()
    return row


# ─────────────────────────────────────────────────────────────
# Serialization
# ─────────────────────────────────────────────────────────────


def serialize_connection(connection: FacebookAdsConnection | None) -> dict[str, Any] | None:
    if not connection:
        return None
    return {
        "id": connection.id,
        "client_org_id": connection.client_org_id,
        "connected_by_user_id": connection.connected_by_user_id,
        "fb_user_id": connection.fb_user_id,
        "fb_user_name": connection.fb_user_name,
        "selected_ad_account_id": connection.selected_ad_account_id,
        "selected_ad_account_name": connection.selected_ad_account_name,
        "currency": connection.currency,
        "timezone_name": connection.timezone_name,
        "status": connection.status.value if hasattr(connection.status, "value") else str(connection.status),
        "token_expires_at": connection.token_expires_at.isoformat() if connection.token_expires_at else None,
        "connected_at": connection.connected_at.isoformat() if connection.connected_at else None,
        "last_sync_at": connection.last_sync_at.isoformat() if connection.last_sync_at else None,
        "last_sync_error": connection.last_sync_error,
    }
