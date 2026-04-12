"""Facebook Ads Manager integration router.

Mounted at ``/marketing/facebook`` under the ``require_module_access`` dep
so that only callers with ``marketing`` module access can reach it.
"""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from core.auth import get_request_user
from database.connection import get_db
from database.models import FacebookConnectionStatus
from database.schemas import (
    FacebookAdAccountOut,
    FacebookAuthUrlOut,
    FacebookCampaignCreateIn,
    FacebookCampaignOut,
    FacebookCampaignUpdateIn,
    FacebookConnectionOut,
    FacebookInsightsKPIsOut,
    FacebookOAuthCallbackIn,
    FacebookSelectAdAccountIn,
    FacebookSyncResponseOut,
)
from integrations.facebook_ads import service as fb_service
from integrations.facebook_ads.client import (
    FacebookConfigurationError,
    FacebookTokenExpiredError,
)

router = APIRouter(prefix="/marketing/facebook", tags=["marketing-facebook"])


# ── Helpers ──────────────────────────────────────────


def _require_org(request: Request, db: Session) -> tuple[str, int]:
    user = get_request_user(request)
    org_id = fb_service.resolve_client_org_id(db, user.user_id)
    return user.user_id, org_id


def _ensure_connection(db: Session, org_id: int):
    connection = fb_service.get_active_connection_or_404(db, org_id)
    return connection


def _ensure_ad_account(connection) -> str:
    if not connection.selected_ad_account_id:
        raise HTTPException(
            status_code=409,
            detail="No ad account selected. Pick one from the account picker first.",
        )
    return connection.selected_ad_account_id


def _serialize_campaign(raw: dict[str, Any], insights_kpis: dict | None = None) -> dict:
    data = {k: raw.get(k) for k in (
        "id", "name", "objective", "status", "effective_status",
        "daily_budget", "lifetime_budget", "budget_remaining",
        "start_time", "stop_time", "created_time", "updated_time",
    )}
    # Facebook returns budgets as cents; convert to human readable string in major units.
    for key in ("daily_budget", "lifetime_budget", "budget_remaining"):
        val = data.get(key)
        if val is not None:
            try:
                data[key] = f"{int(val) / 100:.2f}"
            except (TypeError, ValueError):
                pass
    if insights_kpis is not None:
        data["insights"] = insights_kpis
    return data


# ── OAuth endpoints ──────────────────────────────────


@router.get("/auth-url", response_model=FacebookAuthUrlOut)
def get_auth_url(request: Request, db: Session = Depends(get_db)):
    """Return a Facebook OAuth dialog URL for the connect flow."""
    fb_service.require_configured()
    _user_id, _org_id = _require_org(request, db)
    state = secrets.token_urlsafe(24)
    url = fb_service.build_oauth_url(state)
    return FacebookAuthUrlOut(url=url, state=state)


@router.post("/callback", response_model=FacebookConnectionOut)
async def oauth_callback(
    body: FacebookOAuthCallbackIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Exchange an OAuth code for a long-lived token and persist the connection."""
    user_id, org_id = _require_org(request, db)
    if not fb_service.is_owner(db, user_id):
        raise HTTPException(
            status_code=403,
            detail="Only workspace owners can connect the Facebook Ads integration.",
        )
    connection = await fb_service.connect_account(
        db,
        client_org_id=org_id,
        connected_by_user_id=user_id,
        code=body.code,
    )
    return FacebookConnectionOut(**fb_service.serialize_connection(connection))


# ── Connection management ────────────────────────────


@router.get("/connection")
def get_connection(request: Request, db: Session = Depends(get_db)):
    _user_id, org_id = _require_org(request, db)
    try:
        fb_service.require_configured()
    except HTTPException as exc:
        return {"configured": False, "connection": None, "message": exc.detail}
    connection = fb_service.get_connection(db, org_id)
    return {
        "configured": True,
        "connection": fb_service.serialize_connection(connection),
    }


@router.delete("/connection")
def disconnect_connection(request: Request, db: Session = Depends(get_db)):
    user_id, org_id = _require_org(request, db)
    if not fb_service.is_owner(db, user_id):
        raise HTTPException(
            status_code=403,
            detail="Only workspace owners can disconnect the Facebook Ads integration.",
        )
    connection = fb_service.get_connection(db, org_id)
    if not connection:
        return {"disconnected": True}
    fb_service.disconnect(db, connection)
    return {"disconnected": True}


# ── Ad account selection ─────────────────────────────


@router.get("/ad-accounts", response_model=list[FacebookAdAccountOut])
async def list_ad_accounts(request: Request, db: Session = Depends(get_db)):
    _user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    client = fb_service.load_graph_client(db, connection)
    try:
        accounts = await client.list_ad_accounts()
    except FacebookTokenExpiredError:
        fb_service.mark_token_expired(db, connection, reason="Token expired while listing ad accounts")
        raise
    return [
        FacebookAdAccountOut(
            id=str(acc.get("id") or ""),
            account_id=str(acc.get("account_id")) if acc.get("account_id") is not None else None,
            name=acc.get("name"),
            currency=acc.get("currency"),
            timezone_name=acc.get("timezone_name"),
            account_status=acc.get("account_status"),
            amount_spent=str(acc.get("amount_spent")) if acc.get("amount_spent") is not None else None,
            balance=str(acc.get("balance")) if acc.get("balance") is not None else None,
        )
        for acc in accounts
    ]


@router.post("/ad-accounts/select", response_model=FacebookConnectionOut)
async def select_ad_account(
    body: FacebookSelectAdAccountIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    client = fb_service.load_graph_client(db, connection)
    try:
        account = await client.get_ad_account(body.ad_account_id)
    except FacebookTokenExpiredError:
        fb_service.mark_token_expired(db, connection, reason="Token expired while fetching ad account")
        raise
    connection.selected_ad_account_id = body.ad_account_id
    connection.selected_ad_account_name = (account.get("name") or "")[:200] or None
    connection.currency = account.get("currency")
    connection.timezone_name = account.get("timezone_name")
    db.commit()
    db.refresh(connection)
    return FacebookConnectionOut(**fb_service.serialize_connection(connection))


# ── Insights / analytics ─────────────────────────────


@router.get("/insights", response_model=FacebookInsightsKPIsOut)
async def get_insights(
    request: Request,
    date_preset: str = Query("last_30d"),
    force: bool = Query(False),
    db: Session = Depends(get_db),
):
    _user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    account_id = _ensure_ad_account(connection)
    rows = await fb_service.fetch_insights(
        db,
        connection,
        entity_type="account",
        entity_id=account_id,
        date_preset=date_preset,
        force=force,
    )
    kpis = fb_service.compute_kpis(rows, date_preset=date_preset)
    return FacebookInsightsKPIsOut(**kpis)


@router.get("/campaigns", response_model=list[FacebookCampaignOut])
async def list_campaigns(
    request: Request,
    date_preset: str = Query("last_30d"),
    db: Session = Depends(get_db),
):
    _user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    account_id = _ensure_ad_account(connection)
    client = fb_service.load_graph_client(db, connection)
    try:
        raw_campaigns = await client.list_campaigns(account_id)
    except FacebookTokenExpiredError:
        fb_service.mark_token_expired(db, connection, reason="Token expired while listing campaigns")
        raise

    output: list[FacebookCampaignOut] = []
    for campaign in raw_campaigns:
        campaign_id = campaign.get("id")
        kpis_obj = None
        if campaign_id:
            try:
                rows = await fb_service.fetch_insights(
                    db,
                    connection,
                    entity_type="campaign",
                    entity_id=campaign_id,
                    date_preset=date_preset,
                )
                kpis_obj = fb_service.compute_kpis(rows, date_preset=date_preset)
            except HTTPException:
                kpis_obj = None
        output.append(FacebookCampaignOut(**_serialize_campaign(campaign, kpis_obj)))
    return output


@router.get("/campaigns/{campaign_id}/insights", response_model=FacebookInsightsKPIsOut)
async def get_campaign_insights(
    campaign_id: str,
    request: Request,
    date_preset: str = Query("last_30d"),
    db: Session = Depends(get_db),
):
    _user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    rows = await fb_service.fetch_insights(
        db,
        connection,
        entity_type="campaign",
        entity_id=campaign_id,
        date_preset=date_preset,
    )
    return FacebookInsightsKPIsOut(**fb_service.compute_kpis(rows, date_preset=date_preset))


# ── Campaign management (write) ──────────────────────


@router.post("/campaigns", response_model=FacebookCampaignOut)
async def create_campaign(
    body: FacebookCampaignCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    _user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    account_id = _ensure_ad_account(connection)
    client = fb_service.load_graph_client(db, connection)
    try:
        result = await client.create_campaign(account_id, body.model_dump(exclude_none=True))
    except FacebookTokenExpiredError:
        fb_service.mark_token_expired(db, connection, reason="Token expired while creating campaign")
        raise
    new_id = result.get("id")
    if new_id:
        full = await client.get_campaign(new_id)
        return FacebookCampaignOut(**_serialize_campaign(full))
    return FacebookCampaignOut(id=str(result))


@router.patch("/campaigns/{campaign_id}", response_model=FacebookCampaignOut)
async def update_campaign(
    campaign_id: str,
    body: FacebookCampaignUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    _user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    client = fb_service.load_graph_client(db, connection)
    try:
        await client.update_campaign(campaign_id, body.model_dump(exclude_none=True))
        full = await client.get_campaign(campaign_id)
    except FacebookTokenExpiredError:
        fb_service.mark_token_expired(db, connection, reason="Token expired while updating campaign")
        raise
    return FacebookCampaignOut(**_serialize_campaign(full))


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    _user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    client = fb_service.load_graph_client(db, connection)
    try:
        result = await client.delete_campaign(campaign_id)
    except FacebookTokenExpiredError:
        fb_service.mark_token_expired(db, connection, reason="Token expired while deleting campaign")
        raise
    return {"deleted": True, "result": result}


@router.post("/campaigns/{campaign_id}/pause", response_model=FacebookCampaignOut)
async def pause_campaign(
    campaign_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    _user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    client = fb_service.load_graph_client(db, connection)
    try:
        await client.pause_campaign(campaign_id)
        full = await client.get_campaign(campaign_id)
    except FacebookTokenExpiredError:
        fb_service.mark_token_expired(db, connection, reason="Token expired while pausing campaign")
        raise
    return FacebookCampaignOut(**_serialize_campaign(full))


@router.post("/campaigns/{campaign_id}/activate", response_model=FacebookCampaignOut)
async def activate_campaign(
    campaign_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    _user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    client = fb_service.load_graph_client(db, connection)
    try:
        await client.activate_campaign(campaign_id)
        full = await client.get_campaign(campaign_id)
    except FacebookTokenExpiredError:
        fb_service.mark_token_expired(db, connection, reason="Token expired while activating campaign")
        raise
    return FacebookCampaignOut(**_serialize_campaign(full))


# ── Sync to channel metrics ──────────────────────────


@router.post("/sync-to-channels", response_model=FacebookSyncResponseOut)
async def sync_to_channels(
    request: Request,
    date_preset: str = Query("last_30d"),
    db: Session = Depends(get_db),
):
    _user_id, org_id = _require_org(request, db)
    connection = _ensure_connection(db, org_id)
    account_id = _ensure_ad_account(connection)
    rows = await fb_service.fetch_insights(
        db,
        connection,
        entity_type="account",
        entity_id=account_id,
        date_preset=date_preset,
        force=True,
    )
    kpis = fb_service.compute_kpis(rows, date_preset=date_preset)
    fb_service.sync_to_channel_metrics(db, connection, kpis, period_label=date_preset)
    return FacebookSyncResponseOut(
        synced=True,
        channel="Facebook Ads",
        period_label=date_preset,
        kpis=FacebookInsightsKPIsOut(**kpis),
    )
