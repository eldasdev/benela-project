import { authFetch } from "@/lib/auth-fetch";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
const BASE = `${API}/marketing/facebook`;

// ─── Types ─────────────────────────────────────────────────────

export type FacebookConnectionStatus = "active" | "expired" | "revoked" | "error";

export interface FacebookConnection {
  id: number;
  client_org_id: number;
  connected_by_user_id: string;
  fb_user_id: string | null;
  fb_user_name: string | null;
  selected_ad_account_id: string | null;
  selected_ad_account_name: string | null;
  currency: string | null;
  timezone_name: string | null;
  status: FacebookConnectionStatus;
  token_expires_at: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
}

export interface FacebookConnectionResponse {
  configured: boolean;
  connection: FacebookConnection | null;
  message?: string;
}

export interface FacebookAuthUrl {
  url: string;
  state: string;
}

export interface FacebookAdAccount {
  id: string;
  account_id: string | null;
  name: string | null;
  currency: string | null;
  timezone_name: string | null;
  account_status: number | null;
  amount_spent: string | null;
  balance: string | null;
}

export interface FacebookInsightsKPIs {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  conversion_value: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cost_per_conversion: number;
  roas: number;
  daily_avg_spend: number;
  projected_monthly_spend: number;
  date_start: string | null;
  date_stop: string | null;
  date_preset: string | null;
}

export interface FacebookCampaign {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
  budget_remaining: string | null;
  start_time: string | null;
  stop_time: string | null;
  created_time: string | null;
  updated_time: string | null;
  insights?: FacebookInsightsKPIs | null;
}

export interface FacebookCampaignCreatePayload {
  name: string;
  objective?: string;
  status?: string;
  daily_budget?: number;
  lifetime_budget?: number;
  special_ad_categories?: string;
}

export interface FacebookCampaignUpdatePayload {
  name?: string;
  status?: string;
  daily_budget?: number;
  lifetime_budget?: number;
}

export interface FacebookSyncResponse {
  synced: boolean;
  channel: string;
  period_label: string;
  kpis: FacebookInsightsKPIs;
}

export const FACEBOOK_DATE_PRESETS: Array<{ value: string; label: string }> = [
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_14d", label: "Last 14 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
];

export const FACEBOOK_OBJECTIVES: Array<{ value: string; label: string }> = [
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_APP_PROMOTION", label: "App promotion" },
  { value: "OUTCOME_SALES", label: "Sales" },
];

// ─── Helpers ───────────────────────────────────────────────────

async function handle<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: fallback }));
    throw new Error(err?.detail || fallback);
  }
  return res.json();
}

// ─── API functions ─────────────────────────────────────────────

export async function getFacebookConnection(): Promise<FacebookConnectionResponse> {
  const res = await authFetch(`${BASE}/connection`);
  return handle<FacebookConnectionResponse>(res, "Failed to load Facebook connection");
}

export async function getFacebookAuthUrl(): Promise<FacebookAuthUrl> {
  const res = await authFetch(`${BASE}/auth-url`);
  return handle<FacebookAuthUrl>(res, "Failed to get Facebook auth URL");
}

export async function completeFacebookOAuth(code: string, state?: string): Promise<FacebookConnection> {
  const res = await authFetch(`${BASE}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  });
  return handle<FacebookConnection>(res, "Failed to complete Facebook OAuth");
}

export async function disconnectFacebook(): Promise<void> {
  const res = await authFetch(`${BASE}/connection`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to disconnect" }));
    throw new Error(err.detail || "Failed to disconnect");
  }
}

export async function listFacebookAdAccounts(): Promise<FacebookAdAccount[]> {
  const res = await authFetch(`${BASE}/ad-accounts`);
  return handle<FacebookAdAccount[]>(res, "Failed to list ad accounts");
}

export async function selectFacebookAdAccount(adAccountId: string): Promise<FacebookConnection> {
  const res = await authFetch(`${BASE}/ad-accounts/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ad_account_id: adAccountId }),
  });
  return handle<FacebookConnection>(res, "Failed to select ad account");
}

export async function getFacebookInsights(datePreset: string = "last_30d", force = false): Promise<FacebookInsightsKPIs> {
  const params = new URLSearchParams({ date_preset: datePreset });
  if (force) params.set("force", "true");
  const res = await authFetch(`${BASE}/insights?${params.toString()}`);
  return handle<FacebookInsightsKPIs>(res, "Failed to load insights");
}

export async function listFacebookCampaigns(datePreset: string = "last_30d"): Promise<FacebookCampaign[]> {
  const res = await authFetch(`${BASE}/campaigns?date_preset=${encodeURIComponent(datePreset)}`);
  return handle<FacebookCampaign[]>(res, "Failed to list campaigns");
}

export async function createFacebookCampaign(payload: FacebookCampaignCreatePayload): Promise<FacebookCampaign> {
  const res = await authFetch(`${BASE}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<FacebookCampaign>(res, "Failed to create campaign");
}

export async function updateFacebookCampaign(id: string, payload: FacebookCampaignUpdatePayload): Promise<FacebookCampaign> {
  const res = await authFetch(`${BASE}/campaigns/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<FacebookCampaign>(res, "Failed to update campaign");
}

export async function deleteFacebookCampaign(id: string): Promise<void> {
  const res = await authFetch(`${BASE}/campaigns/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to delete campaign" }));
    throw new Error(err.detail || "Failed to delete campaign");
  }
}

export async function pauseFacebookCampaign(id: string): Promise<FacebookCampaign> {
  const res = await authFetch(`${BASE}/campaigns/${id}/pause`, { method: "POST" });
  return handle<FacebookCampaign>(res, "Failed to pause campaign");
}

export async function activateFacebookCampaign(id: string): Promise<FacebookCampaign> {
  const res = await authFetch(`${BASE}/campaigns/${id}/activate`, { method: "POST" });
  return handle<FacebookCampaign>(res, "Failed to activate campaign");
}

export async function syncFacebookToChannels(datePreset: string = "last_30d"): Promise<FacebookSyncResponse> {
  const res = await authFetch(`${BASE}/sync-to-channels?date_preset=${encodeURIComponent(datePreset)}`, {
    method: "POST",
  });
  return handle<FacebookSyncResponse>(res, "Failed to sync to channel analytics");
}
