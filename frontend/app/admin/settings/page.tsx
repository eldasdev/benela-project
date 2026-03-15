"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, Copy, Lock, RefreshCcw, Save, Shield } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { formatDateTime, readErrorMessage } from "@/lib/admin-utils";
import {
  AdminEmptyState,
  AdminMetricCard,
  AdminMetricGrid,
  AdminPageHero,
  AdminPill,
  AdminSectionCard,
  adminButtonStyle,
  adminInputStyle,
} from "@/components/admin/ui";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

type Settings = {
  id: number;
  platform_name: string;
  support_email?: string | null;
  status_page_url?: string | null;
  default_currency: string;
  default_trial_days: number;
  default_tax_rate: number;
  invoice_prefix: string;
  maintenance_mode: boolean;
  allow_new_signups: boolean;
  enforce_admin_mfa: boolean;
  session_timeout_minutes: number;
  trusted_ip_ranges?: string | null;
  allow_marketplace: boolean;
  allow_plugin_purchases: boolean;
  webhook_signing_secret?: string | null;
  platform_api_key?: string | null;
  updated_at: string;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/admin/settings`);
      const data = res.ok ? ((await res.json()) as Settings) : null;
      setSettings(data);
      setError("");
    } catch (e) {
      console.error("Failed to load settings", e);
      setError("Could not load platform settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadSettings]);

  const updateField = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_name: settings.platform_name,
          support_email: settings.support_email || null,
          status_page_url: settings.status_page_url || null,
          default_currency: settings.default_currency,
          default_trial_days: Number(settings.default_trial_days),
          default_tax_rate: Number(settings.default_tax_rate),
          invoice_prefix: settings.invoice_prefix,
          maintenance_mode: settings.maintenance_mode,
          allow_new_signups: settings.allow_new_signups,
          enforce_admin_mfa: settings.enforce_admin_mfa,
          session_timeout_minutes: Number(settings.session_timeout_minutes),
          trusted_ip_ranges: settings.trusted_ip_ranges || null,
          allow_marketplace: settings.allow_marketplace,
          allow_plugin_purchases: settings.allow_plugin_purchases,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Failed to save settings");
      }
      const data = (await res.json()) as Settings;
      setSettings(data);
      setNotice("Settings saved successfully.");
    } catch (e: unknown) {
      setError(readErrorMessage(e, "Failed to save settings."));
    } finally {
      setSaving(false);
    }
  };

  const postAction = async (path: string, body?: Record<string, unknown>) => {
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Action failed");
      }
      return await res.json();
    } catch (e: unknown) {
      setError(readErrorMessage(e, "Action failed."));
      return null;
    }
  };

  const toggleMaintenance = async (enabled: boolean) => {
    const data = await postAction("/admin/settings/maintenance", { enabled });
    if (data) {
      setSettings(data as Settings);
      setNotice(enabled ? "Maintenance mode enabled." : "Maintenance mode disabled.");
    }
  };

  const runEmergencyLockdown = async () => {
    const confirmMsg =
      "This will enable maintenance mode, disable new signups, and block plugin purchases. Continue?";
    if (!window.confirm(confirmMsg)) return;
    const data = await postAction("/admin/settings/emergency-lockdown");
    if (data) {
      setSettings(data as Settings);
      setNotice("Emergency lockdown applied.");
    }
  };

  const rotateApiKey = async () => {
    const data = await postAction("/admin/settings/rotate-api-key");
    if (data?.platform_api_key) {
      updateField("platform_api_key", data.platform_api_key as string);
      setNotice("Platform API key rotated.");
    }
  };

  const rotateWebhookSecret = async () => {
    const data = await postAction("/admin/settings/rotate-webhook-secret");
    if (data?.webhook_signing_secret) {
      updateField("webhook_signing_secret", data.webhook_signing_secret as string);
      setNotice("Webhook signing secret rotated.");
    }
  };

  const copyValue = async (value?: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
    } catch {
      setError("Unable to copy.");
    }
  };

  const posture = useMemo(() => {
    if (!settings) return { tone: "neutral" as const, label: "Loading" };
    if (settings.maintenance_mode) return { tone: "danger" as const, label: "Maintenance" };
    if (!settings.allow_new_signups || !settings.allow_plugin_purchases) return { tone: "warning" as const, label: "Restricted" };
    return { tone: "success" as const, label: "Open" };
  }, [settings]);

  if (loading) {
    return (
      <div style={centerStyle}>
        <div style={spinnerStyle} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="admin-page-shell" style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <AdminEmptyState title="Settings unavailable" description="Platform settings could not be loaded from the backend." action={<button type="button" style={adminButtonStyle("secondary")} onClick={() => void loadSettings()}><RefreshCcw size={16} /> Retry</button>} />
      </div>
    );
  }

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1460px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <AdminPageHero
        eyebrow="Platform Controls"
        title="Settings"
        subtitle="Global defaults, security posture, operational controls, and platform-wide secrets. This page should be the only place where super-admin platform policy changes are made."
        actions={
          <>
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => void loadSettings()}>
              <RefreshCcw size={16} /> Refresh
            </button>
            <button type="button" style={adminButtonStyle("primary")} onClick={saveSettings} disabled={saving}>
              <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      />

      {(error || notice) && (
        <div
          className="admin-ui-surface"
          style={{
            padding: "12px 14px",
            borderColor: error
              ? "color-mix(in srgb, var(--danger) 32%, transparent)"
              : "color-mix(in srgb, var(--accent) 28%, transparent)",
            background: error
              ? "color-mix(in srgb, var(--danger) 10%, transparent)"
              : "color-mix(in srgb, var(--accent-soft) 68%, transparent)",
            color: error ? "var(--danger)" : "var(--text-primary)",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {error || notice}
        </div>
      )}

      <AdminMetricGrid>
        <AdminMetricCard label="Security posture" value={posture.label} detail={settings.enforce_admin_mfa ? "Admin MFA enforced" : "Admin MFA optional"} tone={posture.tone} />
        <AdminMetricCard label="Trial default" value={`${settings.default_trial_days} days`} detail={`${settings.default_currency} billing base`} tone="accent" />
        <AdminMetricCard label="Tax default" value={`${settings.default_tax_rate}%`} detail={`Invoice prefix ${settings.invoice_prefix}`} tone="accent" />
        <AdminMetricCard label="Marketplace" value={settings.allow_marketplace ? "Enabled" : "Disabled"} detail={settings.allow_plugin_purchases ? "Purchases allowed" : "Purchases blocked"} tone={settings.allow_marketplace ? "success" : "warning"} />
        <AdminMetricCard label="Last updated" value={formatDateTime(settings.updated_at)} detail={settings.support_email || "No support email configured"} tone="neutral" />
      </AdminMetricGrid>

      <div className="admin-settings-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.95fr", gap: "18px" }}>
        <div style={{ display: "grid", gap: "18px" }}>
          <AdminSectionCard title="Platform identity" description="Core public-facing identity and operational contact details.">
            <div style={twoColStyle}>
              <Field label="Platform name">
                <input value={settings.platform_name} onChange={(e) => updateField("platform_name", e.target.value)} style={adminInputStyle()} />
              </Field>
              <Field label="Support email">
                <input type="email" value={settings.support_email || ""} onChange={(e) => updateField("support_email", e.target.value)} style={adminInputStyle()} placeholder="support@benela.dev" />
              </Field>
            </div>
            <Field label="Status page URL">
              <input value={settings.status_page_url || ""} onChange={(e) => updateField("status_page_url", e.target.value)} style={adminInputStyle()} placeholder="https://status.benela.dev" />
            </Field>
          </AdminSectionCard>

          <AdminSectionCard title="Billing defaults" description="Default commercial values applied when a workspace enters the platform billing flow.">
            <div style={threeColStyle}>
              <Field label="Currency">
                <input value={settings.default_currency} onChange={(e) => updateField("default_currency", e.target.value.toUpperCase())} style={adminInputStyle()} />
              </Field>
              <Field label="Default trial (days)">
                <input type="number" min={0} max={365} value={settings.default_trial_days} onChange={(e) => updateField("default_trial_days", Number(e.target.value))} style={adminInputStyle()} />
              </Field>
              <Field label="Tax rate (%)">
                <input type="number" min={0} max={100} step={0.1} value={settings.default_tax_rate} onChange={(e) => updateField("default_tax_rate", Number(e.target.value))} style={adminInputStyle()} />
              </Field>
            </div>
            <Field label="Invoice prefix">
              <input value={settings.invoice_prefix} onChange={(e) => updateField("invoice_prefix", e.target.value.toUpperCase())} style={adminInputStyle()} placeholder="BNL" />
            </Field>
          </AdminSectionCard>

          <AdminSectionCard title="Security and access" description="Session policy, network trust configuration, and admin access hardening.">
            <div style={twoColStyle}>
              <ToggleTile
                label="Enforce admin MFA"
                description="Require multi-factor authentication for all owner and super-admin identities."
                checked={settings.enforce_admin_mfa}
                onChange={(value) => updateField("enforce_admin_mfa", value)}
              />
              <Field label="Session timeout (minutes)">
                <input type="number" min={5} max={1440} value={settings.session_timeout_minutes} onChange={(e) => updateField("session_timeout_minutes", Number(e.target.value))} style={adminInputStyle()} />
              </Field>
            </div>
            <Field label="Trusted IP ranges (CIDR, comma-separated)">
              <textarea value={settings.trusted_ip_ranges || ""} onChange={(e) => updateField("trusted_ip_ranges", e.target.value)} style={{ ...adminInputStyle({ minHeight: "96px", padding: "12px 14px", resize: "vertical" }) }} placeholder="203.0.113.0/24, 198.51.100.10/32" />
            </Field>
          </AdminSectionCard>
        </div>

        <div style={{ display: "grid", gap: "18px", alignContent: "start" }}>
          <AdminSectionCard title="Platform controls" description="Switches that directly affect growth, commerce, and operational availability.">
            <div style={{ display: "grid", gap: "10px" }}>
              <ToggleTile label="Maintenance mode" description="Temporarily shift the platform into restricted operations." checked={settings.maintenance_mode} onChange={(value) => void toggleMaintenance(value)} />
              <ToggleTile label="Allow new signups" description="Permit new organizations to register and enter onboarding." checked={settings.allow_new_signups} onChange={(value) => updateField("allow_new_signups", value)} />
              <ToggleTile label="Enable marketplace" description="Expose marketplace browsing and plugin visibility to tenants." checked={settings.allow_marketplace} onChange={(value) => updateField("allow_marketplace", value)} />
              <ToggleTile label="Allow plugin purchases" description="Allow tenants to complete plugin purchase flows." checked={settings.allow_plugin_purchases} onChange={(value) => updateField("allow_plugin_purchases", value)} />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Secrets and keys" description="Rotate sensitive platform keys from one controlled surface.">
            <div style={{ display: "grid", gap: "12px" }}>
              <SecretRow label="Platform API key" value={settings.platform_api_key} onCopy={() => void copyValue(settings.platform_api_key)} onRotate={() => void rotateApiKey()} />
              <SecretRow label="Webhook signing secret" value={settings.webhook_signing_secret} onCopy={() => void copyValue(settings.webhook_signing_secret)} onRotate={() => void rotateWebhookSecret()} />
            </div>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.7 }}>
              Rotating a key invalidates previous integrations immediately. Coordinate downstream clients before rotation.
            </p>
          </AdminSectionCard>

          <AdminSectionCard
            title="Danger zone"
            description="Operational emergency controls. Use deliberately and document every change."
            actions={<AdminPill label={settings.maintenance_mode ? "Maintenance on" : "Live mode"} tone={settings.maintenance_mode ? "danger" : "success"} />}
          >
            <div style={{ display: "grid", gap: "10px" }}>
              <button type="button" style={adminButtonStyle("danger", { width: "100%" })} onClick={() => void toggleMaintenance(!settings.maintenance_mode)}>
                <Lock size={16} /> {settings.maintenance_mode ? "Disable Maintenance Mode" : "Enable Maintenance Mode"}
              </button>
              <button type="button" style={adminButtonStyle("danger", { width: "100%" })} onClick={() => void runEmergencyLockdown()}>
                <Shield size={16} /> Emergency Lockdown
              </button>
            </div>
            <div className="admin-ui-surface" style={{ padding: "12px 14px", background: "color-mix(in srgb, var(--danger) 6%, var(--bg-panel) 94%)", borderColor: "color-mix(in srgb, var(--danger) 24%, transparent)" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "start" }}>
                <AlertTriangle size={16} color="var(--danger)" style={{ marginTop: "2px", flexShrink: 0 }} />
                <div style={{ fontSize: "12px", lineHeight: 1.7, color: "var(--text-subtle)" }}>
                  Emergency lockdown enables maintenance mode, disables new signups, and blocks plugin purchases in one action.
                </div>
              </div>
            </div>
          </AdminSectionCard>
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .admin-settings-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: "8px" }}>
      <span style={{ fontSize: "12px", color: "var(--text-subtle)", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function ToggleTile({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="admin-ui-surface" style={{ padding: "14px", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center" }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.6 }}>{description}</div>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: "50px",
          height: "28px",
          borderRadius: "999px",
          border: "1px solid color-mix(in srgb, var(--border-default) 76%, transparent)",
          background: checked
            ? "color-mix(in srgb, var(--accent) 20%, var(--bg-panel) 80%)"
            : "color-mix(in srgb, var(--bg-panel) 90%, transparent)",
          position: "relative",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "3px",
            left: checked ? "24px" : "3px",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            background: checked ? "var(--accent)" : "var(--text-quiet)",
            transition: "left 0.16s ease",
            boxShadow: "0 6px 12px rgba(0,0,0,0.16)",
          }}
        />
      </button>
    </div>
  );
}

function SecretRow({
  label,
  value,
  onRotate,
  onCopy,
}: {
  label: string;
  value?: string | null;
  onRotate: () => void;
  onCopy: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <span style={{ fontSize: "12px", color: "var(--text-subtle)", fontWeight: 600 }}>{label}</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "8px" }}>
        <input readOnly value={value || ""} style={{ ...adminInputStyle({ fontFamily: "monospace", color: "var(--text-primary)" }) }} />
        <button type="button" onClick={onCopy} style={adminButtonStyle("secondary", { minHeight: "44px", padding: "0 12px" })}>
          <Copy size={14} /> Copy
        </button>
        <button type="button" onClick={onRotate} style={adminButtonStyle("secondary", { minHeight: "44px", padding: "0 12px" })}>
          <RefreshCcw size={14} /> Rotate
        </button>
      </div>
    </div>
  );
}

const twoColStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "14px",
};

const threeColStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "14px",
};

const centerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "70vh",
};

const spinnerStyle: CSSProperties = {
  width: "30px",
  height: "30px",
  borderRadius: "50%",
  border: "2px solid color-mix(in srgb, var(--border-default) 86%, transparent)",
  borderTopColor: "var(--accent)",
  animation: "spin 0.8s linear infinite",
};
