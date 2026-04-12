"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  DollarSign,
  Eye,
  Facebook,
  Loader2,
  MousePointerClick,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  TrendingUp,
  Unlink,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  FACEBOOK_DATE_PRESETS,
  FACEBOOK_OBJECTIVES,
  activateFacebookCampaign,
  completeFacebookOAuth,
  createFacebookCampaign,
  deleteFacebookCampaign,
  disconnectFacebook,
  getFacebookAuthUrl,
  getFacebookConnection,
  getFacebookInsights,
  listFacebookAdAccounts,
  listFacebookCampaigns,
  pauseFacebookCampaign,
  selectFacebookAdAccount,
  syncFacebookToChannels,
  updateFacebookCampaign,
  type FacebookAdAccount,
  type FacebookCampaign,
  type FacebookCampaignCreatePayload,
  type FacebookCampaignUpdatePayload,
  type FacebookConnection,
  type FacebookInsightsKPIs,
} from "@/lib/facebook-ads";

// ─── Styles ─────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--bg-panel)",
  border: "1px solid var(--border-default)",
  borderRadius: "14px",
  padding: "18px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "9px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-soft)",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--text-subtle)",
  marginBottom: "6px",
  display: "block",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: "10px",
  background: "linear-gradient(135deg, #1877f2, #4267B2)",
  color: "#fff",
  border: "none",
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "9px",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-soft)",
  fontWeight: 500,
  fontSize: "12px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
};

const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  color: "var(--danger)",
  borderColor: "color-mix(in srgb, var(--danger) 24%, transparent)",
};

// ─── Helpers ────────────────────────────────────────────────

function fmtCurrency(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `$${(value || 0).toFixed(2)}`;
  }
}

function fmtNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value || 0));
}

function fmtPct(value: number): string {
  return `${(value || 0).toFixed(2)}%`;
}

// ─── Sub-components ─────────────────────────────────────────

type ToastState = { kind: "success" | "error"; message: string } | null;

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        zIndex: 200,
        padding: "12px 18px",
        borderRadius: "10px",
        background: toast.kind === "success"
          ? "color-mix(in srgb, var(--success) 14%, var(--bg-panel))"
          : "color-mix(in srgb, var(--danger) 14%, var(--bg-panel))",
        border: `1px solid ${toast.kind === "success" ? "var(--success)" : "var(--danger)"}`,
        color: "var(--text-primary)",
        fontSize: "13px",
        maxWidth: "380px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      }}
    >
      {toast.kind === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      <span>{toast.message}</span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof DollarSign;
  accent?: string;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "11px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {label}
        </span>
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            background: accent || "color-mix(in srgb, var(--accent) 14%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent)",
          }}
        >
          <Icon size={14} />
        </div>
      </div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{sub}</div> : null}
    </div>
  );
}

// ─── Campaign editor modal ──────────────────────────────────

type EditorState = {
  mode: "create" | "edit";
  id?: string;
  name: string;
  objective: string;
  status: string;
  daily_budget: string;
};

function CampaignEditor({
  state,
  busy,
  onClose,
  onSubmit,
}: {
  state: EditorState;
  busy: boolean;
  onClose: () => void;
  onSubmit: (next: EditorState) => void;
}) {
  const [form, setForm] = useState(state);
  useEffect(() => setForm(state), [state]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-backdrop)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 110,
        padding: "20px",
      }}
    >
      <div
        style={{
          ...cardStyle,
          width: "100%",
          maxWidth: "520px",
          padding: "22px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
            {form.mode === "create" ? "New Facebook campaign" : "Edit campaign"}
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-subtle)", cursor: "pointer" }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          <div>
            <label style={labelStyle}>Campaign name</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Spring sale – awareness"
            />
          </div>
          <div>
            <label style={labelStyle}>Objective</label>
            <select
              style={inputStyle}
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              disabled={form.mode === "edit"}
            >
              {FACEBOOK_OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Daily budget (USD)</label>
              <input
                style={inputStyle}
                type="number"
                min={1}
                step={1}
                value={form.daily_budget}
                onChange={(e) => setForm({ ...form, daily_budget: e.target.value })}
                placeholder="25"
              />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="PAUSED">Paused</option>
                <option value="ACTIVE">Active</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "22px" }}>
          <button onClick={onClose} style={btnSecondary} disabled={busy}>
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}
          >
            {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            {form.mode === "create" ? "Create campaign" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────

export default function FacebookAdsPanel() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [connection, setConnection] = useState<FacebookConnection | null>(null);
  const [adAccounts, setAdAccounts] = useState<FacebookAdAccount[]>([]);
  const [kpis, setKpis] = useState<FacebookInsightsKPIs | null>(null);
  const [campaigns, setCampaigns] = useState<FacebookCampaign[]>([]);
  const [datePreset, setDatePreset] = useState<string>("last_30d");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const isConnected = connection?.status === "active";
  const hasAccountSelected = Boolean(isConnected && connection?.selected_ad_account_id);

  const currency = connection?.currency || "USD";

  // Initial load
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getFacebookConnection();
        if (!active) return;
        setConfigured(res.configured);
        setConnection(res.connection);
      } catch (err) {
        if (!active) return;
        setToast({ kind: "error", message: err instanceof Error ? err.message : "Load failed" });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadTick]);

  // Load ad accounts when connected but no account selected
  useEffect(() => {
    if (!isConnected || hasAccountSelected) return;
    let active = true;
    (async () => {
      try {
        const accs = await listFacebookAdAccounts();
        if (active) setAdAccounts(accs);
      } catch (err) {
        if (active) setToast({ kind: "error", message: err instanceof Error ? err.message : "Failed to load ad accounts" });
      }
    })();
    return () => {
      active = false;
    };
  }, [isConnected, hasAccountSelected, reloadTick]);

  // Load insights + campaigns when connected with account
  useEffect(() => {
    if (!hasAccountSelected) return;
    let active = true;
    (async () => {
      try {
        const [kpiRes, campaignRes] = await Promise.all([
          getFacebookInsights(datePreset),
          listFacebookCampaigns(datePreset),
        ]);
        if (!active) return;
        setKpis(kpiRes);
        setCampaigns(campaignRes);
      } catch (err) {
        if (active) setToast({ kind: "error", message: err instanceof Error ? err.message : "Failed to load insights" });
      }
    })();
    return () => {
      active = false;
    };
  }, [hasAccountSelected, datePreset, reloadTick]);

  // ─── Actions ──────────────────────────────────────

  const refresh = useCallback(() => setReloadTick((t) => t + 1), []);

  const handleConnect = useCallback(async () => {
    try {
      setBusyAction("connect");
      const { url, state } = await getFacebookAuthUrl();
      const popup = window.open(url, "fb_oauth", "width=640,height=760,scrollbars=yes");
      if (!popup) {
        setToast({ kind: "error", message: "Popup blocked. Please allow popups for this site." });
        setBusyAction(null);
        return;
      }
      const listener = async (event: MessageEvent) => {
        if (event.data?.type !== "facebook_oauth_code") return;
        window.removeEventListener("message", listener);
        try {
          if (event.data.error) throw new Error(event.data.error);
          if (!event.data.code) throw new Error("No authorization code received");
          await completeFacebookOAuth(event.data.code, event.data.state || state);
          setToast({ kind: "success", message: "Facebook account connected!" });
          refresh();
        } catch (err) {
          setToast({ kind: "error", message: err instanceof Error ? err.message : "Connection failed" });
        } finally {
          setBusyAction(null);
        }
      };
      window.addEventListener("message", listener);
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Connect failed" });
      setBusyAction(null);
    }
  }, [refresh]);

  const handleDisconnect = useCallback(async () => {
    if (!confirm("Disconnect Facebook Ads? You'll need to reconnect to pull data again.")) return;
    try {
      setBusyAction("disconnect");
      await disconnectFacebook();
      setConnection(null);
      setAdAccounts([]);
      setKpis(null);
      setCampaigns([]);
      setToast({ kind: "success", message: "Disconnected from Facebook Ads." });
      refresh();
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Disconnect failed" });
    } finally {
      setBusyAction(null);
    }
  }, [refresh]);

  const handleSelectAccount = useCallback(
    async (accountId: string) => {
      try {
        setBusyAction("select-account");
        const next = await selectFacebookAdAccount(accountId);
        setConnection(next);
        setToast({ kind: "success", message: `Selected ${next.selected_ad_account_name || accountId}` });
      } catch (err) {
        setToast({ kind: "error", message: err instanceof Error ? err.message : "Selection failed" });
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  const handleToggleCampaign = useCallback(
    async (campaign: FacebookCampaign) => {
      const isActive = (campaign.status || "").toUpperCase() === "ACTIVE";
      try {
        setBusyAction(`toggle-${campaign.id}`);
        const updated = isActive
          ? await pauseFacebookCampaign(campaign.id)
          : await activateFacebookCampaign(campaign.id);
        setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? { ...c, ...updated } : c)));
        setToast({ kind: "success", message: `${isActive ? "Paused" : "Activated"} ${campaign.name || campaign.id}` });
      } catch (err) {
        setToast({ kind: "error", message: err instanceof Error ? err.message : "Toggle failed" });
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  const handleDeleteCampaign = useCallback(async (campaign: FacebookCampaign) => {
    if (!confirm(`Delete campaign "${campaign.name || campaign.id}"? This cannot be undone.`)) return;
    try {
      setBusyAction(`delete-${campaign.id}`);
      await deleteFacebookCampaign(campaign.id);
      setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
      setToast({ kind: "success", message: "Campaign deleted." });
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Delete failed" });
    } finally {
      setBusyAction(null);
    }
  }, []);

  const handleSubmitEditor = useCallback(
    async (next: EditorState) => {
      try {
        setBusyAction("editor");
        if (next.mode === "create") {
          const payload: FacebookCampaignCreatePayload = {
            name: next.name,
            objective: next.objective,
            status: next.status,
            daily_budget: next.daily_budget ? Number(next.daily_budget) : undefined,
          };
          const created = await createFacebookCampaign(payload);
          setCampaigns((prev) => [created, ...prev]);
          setToast({ kind: "success", message: "Campaign created." });
        } else if (next.id) {
          const payload: FacebookCampaignUpdatePayload = {
            name: next.name,
            status: next.status,
            daily_budget: next.daily_budget ? Number(next.daily_budget) : undefined,
          };
          const updated = await updateFacebookCampaign(next.id, payload);
          setCampaigns((prev) => prev.map((c) => (c.id === next.id ? { ...c, ...updated } : c)));
          setToast({ kind: "success", message: "Campaign updated." });
        }
        setEditor(null);
      } catch (err) {
        setToast({ kind: "error", message: err instanceof Error ? err.message : "Save failed" });
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  const handleSyncToChannels = useCallback(async () => {
    try {
      setBusyAction("sync");
      await syncFacebookToChannels(datePreset);
      setToast({ kind: "success", message: "Facebook data synced to Channel Analytics." });
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setBusyAction(null);
    }
  }, [datePreset]);

  // ─── Render states ──────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px", color: "var(--text-subtle)" }}>
        <Loader2 size={24} className="spin" />
      </div>
    );
  }

  if (!configured) {
    return (
      <div style={{ ...cardStyle, textAlign: "center", padding: "40px" }}>
        <AlertTriangle size={32} style={{ color: "var(--warning)", margin: "0 auto 14px" }} />
        <h3 style={{ margin: "0 0 8px", fontSize: "17px", fontWeight: 700 }}>Facebook integration not configured</h3>
        <p style={{ margin: 0, color: "var(--text-subtle)", fontSize: "13px" }}>
          Ask your administrator to set <code>FACEBOOK_APP_ID</code>, <code>FACEBOOK_APP_SECRET</code>, and{" "}
          <code>INTEGRATION_ENCRYPTION_KEY</code> in the backend environment.
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <>
        <div style={{ ...cardStyle, padding: "36px", textAlign: "center" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #1877f2, #4267B2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 18px",
            }}
          >
            <Facebook size={32} color="#fff" />
          </div>
          <h3 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: 700 }}>Connect your Facebook Ads account</h3>
          <p style={{ margin: "0 auto 22px", color: "var(--text-subtle)", fontSize: "13px", maxWidth: "460px" }}>
            Pull live campaign data, measure spend & ROAS, and manage ads directly from your Benela dashboard.
            Your access token is encrypted and stored securely.
          </p>
          <button
            onClick={handleConnect}
            style={{ ...btnPrimary, padding: "12px 24px", fontSize: "14px", opacity: busyAction === "connect" ? 0.7 : 1 }}
            disabled={busyAction === "connect"}
          >
            {busyAction === "connect" ? <Loader2 size={16} className="spin" /> : <Facebook size={16} />}
            Connect Facebook
          </button>
          {connection?.last_sync_error ? (
            <p style={{ marginTop: "14px", color: "var(--danger)", fontSize: "12px" }}>{connection.last_sync_error}</p>
          ) : null}
        </div>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <style>{`.spin { animation: fbspin 0.9s linear infinite; } @keyframes fbspin { to { transform: rotate(360deg); } }`}</style>
      </>
    );
  }

  if (!hasAccountSelected) {
    return (
      <>
        <div style={{ ...cardStyle, padding: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "11px",
                background: "linear-gradient(135deg, #1877f2, #4267B2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Facebook size={22} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: "0 0 2px", fontSize: "17px", fontWeight: 700 }}>Choose an ad account</h3>
              <p style={{ margin: 0, color: "var(--text-subtle)", fontSize: "12px" }}>
                Connected as {connection?.fb_user_name || "Facebook user"}. Pick an ad account to pull data from.
              </p>
            </div>
            <button onClick={handleDisconnect} style={{ ...btnDanger, marginLeft: "auto" }}>
              <Unlink size={13} /> Disconnect
            </button>
          </div>
          {adAccounts.length === 0 ? (
            <p style={{ color: "var(--text-subtle)", fontSize: "13px", textAlign: "center", padding: "20px" }}>
              No ad accounts found on this Facebook profile.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {adAccounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => handleSelectAccount(acc.id)}
                  disabled={busyAction === "select-account"}
                  style={{
                    ...cardStyle,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "2px" }}>{acc.name || acc.id}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                      {acc.currency || "USD"} · {acc.timezone_name || "—"} · spent {acc.amount_spent || "0"}
                    </div>
                  </div>
                  <TrendingUp size={16} style={{ color: "var(--accent)" }} />
                </button>
              ))}
            </div>
          )}
        </div>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <style>{`.spin { animation: fbspin 0.9s linear infinite; } @keyframes fbspin { to { transform: rotate(360deg); } }`}</style>
      </>
    );
  }

  // ─── Connected + account selected: Dashboard ──────

  return (
    <>
      {/* Header bar */}
      <div
        style={{
          ...cardStyle,
          padding: "16px 20px",
          marginBottom: "18px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #1877f2, #4267B2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Facebook size={19} color="#fff" />
        </div>
        <div style={{ minWidth: "160px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700 }}>{connection?.selected_ad_account_name || "Ad account"}</div>
          <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
            {connection?.fb_user_name} · {currency}
          </div>
        </div>

        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value)}
          style={{ ...inputStyle, width: "auto", minWidth: "150px", marginLeft: "auto" }}
        >
          {FACEBOOK_DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <button onClick={refresh} style={btnSecondary}>
          <RefreshCw size={13} />
          Refresh
        </button>
        <button
          onClick={handleSyncToChannels}
          style={{ ...btnSecondary, opacity: busyAction === "sync" ? 0.6 : 1 }}
          disabled={busyAction === "sync"}
        >
          {busyAction === "sync" ? <Loader2 size={13} className="spin" /> : <Zap size={13} />}
          Sync to analytics
        </button>
        <button onClick={handleDisconnect} style={btnDanger}>
          <Unlink size={13} /> Disconnect
        </button>
      </div>

      {/* KPI grid */}
      {kpis ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
            marginBottom: "18px",
          }}
        >
          <KpiCard label="Spend" value={fmtCurrency(kpis.spend, currency)} sub={`${fmtCurrency(kpis.daily_avg_spend, currency)}/day avg`} icon={DollarSign} />
          <KpiCard label="Impressions" value={fmtNumber(kpis.impressions)} sub={`Reach ${fmtNumber(kpis.reach)}`} icon={Eye} />
          <KpiCard label="Clicks" value={fmtNumber(kpis.clicks)} sub={`CTR ${fmtPct(kpis.ctr)}`} icon={MousePointerClick} />
          <KpiCard label="CPC" value={fmtCurrency(kpis.cpc, currency)} sub={`CPM ${fmtCurrency(kpis.cpm, currency)}`} icon={Target} />
          <KpiCard label="Conversions" value={fmtNumber(kpis.conversions)} sub={`CPA ${fmtCurrency(kpis.cost_per_conversion, currency)}`} icon={Users} />
          <KpiCard label="ROAS" value={`${(kpis.roas || 0).toFixed(2)}x`} sub={`Revenue ${fmtCurrency(kpis.conversion_value, currency)}`} icon={TrendingUp} />
          <KpiCard label="Projected / month" value={fmtCurrency(kpis.projected_monthly_spend, currency)} sub="Based on daily avg" icon={BarChart3} />
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: "32px", textAlign: "center", color: "var(--text-subtle)" }}>
          <Loader2 size={20} className="spin" style={{ marginBottom: "8px" }} />
          <div>Loading insights…</div>
        </div>
      )}

      {/* Campaigns */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: "0 0 2px", fontSize: "16px", fontWeight: 700 }}>Campaigns</h3>
            <p style={{ margin: 0, color: "var(--text-subtle)", fontSize: "12px" }}>
              {campaigns.length} {campaigns.length === 1 ? "campaign" : "campaigns"} · manage directly from Benela
            </p>
          </div>
          <button
            onClick={() =>
              setEditor({
                mode: "create",
                name: "",
                objective: "OUTCOME_TRAFFIC",
                status: "PAUSED",
                daily_budget: "",
              })
            }
            style={btnPrimary}
          >
            <Plus size={14} /> New campaign
          </button>
        </div>

        {campaigns.length === 0 ? (
          <p style={{ color: "var(--text-subtle)", fontSize: "13px", textAlign: "center", padding: "24px" }}>
            No campaigns found in this ad account for the selected date range.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "760px" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-subtle)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border-soft)" }}>Status</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border-soft)" }}>Name</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border-soft)" }}>Objective</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border-soft)", textAlign: "right" }}>Daily budget</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border-soft)", textAlign: "right" }}>Spend</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border-soft)", textAlign: "right" }}>Clicks</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border-soft)", textAlign: "right" }}>CTR</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border-soft)", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const active = (c.status || "").toUpperCase() === "ACTIVE";
                  const ins = c.insights;
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <td style={{ padding: "12px 8px" }}>
                        <button
                          onClick={() => handleToggleCampaign(c)}
                          disabled={busyAction === `toggle-${c.id}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 10px",
                            borderRadius: "999px",
                            border: "1px solid",
                            borderColor: active ? "var(--success)" : "var(--border-soft)",
                            color: active ? "var(--success)" : "var(--text-subtle)",
                            background: active
                              ? "color-mix(in srgb, var(--success) 14%, transparent)"
                              : "var(--bg-elevated)",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {active ? <Play size={11} /> : <Pause size={11} />}
                          {c.status || "?"}
                        </button>
                      </td>
                      <td style={{ padding: "12px 8px", fontWeight: 600 }}>{c.name || c.id}</td>
                      <td style={{ padding: "12px 8px", color: "var(--text-subtle)", fontSize: "12px" }}>{c.objective || "—"}</td>
                      <td style={{ padding: "12px 8px", textAlign: "right" }}>
                        {c.daily_budget ? fmtCurrency(Number(c.daily_budget), currency) : "—"}
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "right" }}>
                        {ins ? fmtCurrency(ins.spend, currency) : "—"}
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "right" }}>{ins ? fmtNumber(ins.clicks) : "—"}</td>
                      <td style={{ padding: "12px 8px", textAlign: "right" }}>{ins ? fmtPct(ins.ctr) : "—"}</td>
                      <td style={{ padding: "12px 8px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button
                            onClick={() =>
                              setEditor({
                                mode: "edit",
                                id: c.id,
                                name: c.name || "",
                                objective: c.objective || "OUTCOME_TRAFFIC",
                                status: c.status || "PAUSED",
                                daily_budget: c.daily_budget || "",
                              })
                            }
                            style={{ ...btnSecondary, padding: "6px 10px" }}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteCampaign(c)}
                            style={{ ...btnDanger, padding: "6px 10px" }}
                            disabled={busyAction === `delete-${c.id}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor ? (
        <CampaignEditor
          state={editor}
          busy={busyAction === "editor"}
          onClose={() => setEditor(null)}
          onSubmit={handleSubmitEditor}
        />
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <style>{`.spin { animation: fbspin 0.9s linear infinite; } @keyframes fbspin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
