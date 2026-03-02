"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, AlertTriangle, RefreshCcw, Shield, Lock } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
      const res = await fetch(`${API}/admin/settings`);
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
    const t = setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => clearTimeout(t);
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
      const res = await fetch(`${API}/admin/settings`, {
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
      const res = await fetch(`${API}${path}`, {
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
      updateField("platform_api_key", data.platform_api_key);
      setNotice("Platform API key rotated.");
    }
  };

  const rotateWebhookSecret = async () => {
    const data = await postAction("/admin/settings/rotate-webhook-secret");
    if (data?.webhook_signing_secret) {
      updateField("webhook_signing_secret", data.webhook_signing_secret);
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

  if (loading || !settings) {
    return (
      <div style={centerStyle}>
        <div style={spinnerStyle} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      <div
        style={{
          marginBottom: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Platform Settings
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
            Configure global policies, defaults, security, and operational controls.
          </p>
        </div>
        <button onClick={saveSettings} disabled={saving} style={primaryBtn}>
          <Save size={13} />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {(error || notice) && (
        <div
          style={{
            marginBottom: "14px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: error ? "1px solid rgba(248,113,113,0.25)" : "1px solid rgba(52,211,153,0.25)",
            background: error ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)",
            color: error ? "#f87171" : "#34d399",
            fontSize: "12px",
          }}
        >
          {error || notice}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <section style={panelStyle}>
            <div style={panelHeader}>Platform Identity</div>
            <div style={panelBody}>
              <div style={gridTwo}>
                <Field label="Platform Name">
                  <input
                    value={settings.platform_name}
                    onChange={(e) => updateField("platform_name", e.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Support Email">
                  <input
                    type="email"
                    value={settings.support_email || ""}
                    onChange={(e) => updateField("support_email", e.target.value)}
                    style={inputStyle}
                    placeholder="support@benela.dev"
                  />
                </Field>
              </div>
              <Field label="Status Page URL">
                <input
                  value={settings.status_page_url || ""}
                  onChange={(e) => updateField("status_page_url", e.target.value)}
                  style={inputStyle}
                  placeholder="https://status.benela.dev"
                />
              </Field>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={panelHeader}>Billing Defaults</div>
            <div style={panelBody}>
              <div style={gridThree}>
                <Field label="Currency">
                  <input
                    value={settings.default_currency}
                    onChange={(e) => updateField("default_currency", e.target.value.toUpperCase())}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Default Trial (days)">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={settings.default_trial_days}
                    onChange={(e) => updateField("default_trial_days", Number(e.target.value))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Tax Rate (%)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={settings.default_tax_rate}
                    onChange={(e) => updateField("default_tax_rate", Number(e.target.value))}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <Field label="Invoice Prefix">
                <input
                  value={settings.invoice_prefix}
                  onChange={(e) => updateField("invoice_prefix", e.target.value.toUpperCase())}
                  style={inputStyle}
                  placeholder="BNL"
                />
              </Field>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={panelHeader}>Security & Access</div>
            <div style={panelBody}>
              <div style={gridTwo}>
                <ToggleRow
                  label="Enforce Admin MFA"
                  description="Require multi-factor authentication for all owner/admin accounts."
                  checked={settings.enforce_admin_mfa}
                  onChange={(v) => updateField("enforce_admin_mfa", v)}
                />
                <Field label="Session Timeout (minutes)">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={settings.session_timeout_minutes}
                    onChange={(e) => updateField("session_timeout_minutes", Number(e.target.value))}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <Field label="Trusted IP Ranges (CIDR, comma-separated)">
                <textarea
                  value={settings.trusted_ip_ranges || ""}
                  onChange={(e) => updateField("trusted_ip_ranges", e.target.value)}
                  style={{ ...inputStyle, minHeight: "68px", resize: "vertical", padding: "8px 10px" }}
                  placeholder="203.0.113.0/24, 198.51.100.10/32"
                />
              </Field>
            </div>
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <section style={panelStyle}>
            <div style={panelHeader}>Platform Controls</div>
            <div style={panelBody}>
              <ToggleRow
                label="Maintenance Mode"
                description="Temporarily put platform into maintenance (read-only style operations)."
                checked={settings.maintenance_mode}
                onChange={(v) => updateField("maintenance_mode", v)}
              />
              <ToggleRow
                label="Allow New Signups"
                description="Permit new organizations to create accounts."
                checked={settings.allow_new_signups}
                onChange={(v) => updateField("allow_new_signups", v)}
              />
              <ToggleRow
                label="Enable Marketplace"
                description="Show marketplace module to tenants."
                checked={settings.allow_marketplace}
                onChange={(v) => updateField("allow_marketplace", v)}
              />
              <ToggleRow
                label="Allow Plugin Purchases"
                description="Permit tenants to purchase marketplace plugins."
                checked={settings.allow_plugin_purchases}
                onChange={(v) => updateField("allow_plugin_purchases", v)}
              />
            </div>
          </section>

          <section style={panelStyle}>
            <div style={panelHeader}>Secrets & Keys</div>
            <div style={panelBody}>
              <SecretRow
                label="Platform API Key"
                value={settings.platform_api_key}
                onCopy={() => copyValue(settings.platform_api_key)}
                onRotate={rotateApiKey}
              />
              <SecretRow
                label="Webhook Signing Secret"
                value={settings.webhook_signing_secret}
                onCopy={() => copyValue(settings.webhook_signing_secret)}
                onRotate={rotateWebhookSecret}
              />
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", marginBottom: 0 }}>
                Rotating secrets invalidates old clients immediately. Update integrations after rotation.
              </p>
            </div>
          </section>

          <section style={{ ...panelStyle, borderColor: "rgba(239,68,68,0.25)" }}>
            <div style={{ ...panelHeader, color: "#ef4444" }}>
              <AlertTriangle size={14} />
              Danger Zone
            </div>
            <div style={panelBody}>
              <button
                onClick={() => toggleMaintenance(!settings.maintenance_mode)}
                style={dangerBtn}
              >
                <Lock size={13} />
                {settings.maintenance_mode ? "Disable Maintenance Mode" : "Enable Maintenance Mode"}
              </button>
              <button onClick={runEmergencyLockdown} style={dangerBtn}>
                <Shield size={13} />
                Emergency Lockdown
              </button>
              <p style={{ fontSize: "11px", color: "#7d7d88", margin: 0 }}>
                Emergency lockdown enables maintenance mode and blocks new signups/purchases.
              </p>
            </div>
          </section>

          <div
            style={{
              padding: "10px 12px",
              borderRadius: "10px",
              background: "var(--bg-surface)",
              border: "1px solid #20202a",
              fontSize: "11px",
              color: "var(--text-muted)",
            }}
          >
            Last updated: {new Date(settings.updated_at).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px", display: "block" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleRow({
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "9px 10px",
        borderRadius: "9px",
        border: "1px solid #232332",
        background: "#10101a",
        marginBottom: "8px",
      }}
    >
      <div>
        <div style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: "44px",
          height: "24px",
          borderRadius: "999px",
          border: "1px solid #2d2d3c",
          background: checked ? "rgba(52,211,153,0.22)" : "#161622",
          position: "relative",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "22px" : "2px",
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: checked ? "#34d399" : "var(--text-muted)",
            transition: "left 0.2s ease",
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
    <div style={{ marginBottom: "10px" }}>
      <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px", display: "block" }}>
        {label}
      </label>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          readOnly
          value={value || ""}
          style={{ ...inputStyle, fontFamily: "monospace", color: "#bbb", flex: 1 }}
        />
        <button type="button" onClick={onCopy} style={miniBtn}>
          Copy
        </button>
        <button type="button" onClick={onRotate} style={miniBtn}>
          <RefreshCcw size={12} />
        </button>
      </div>
    </div>
  );
}

const centerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "80vh",
};

const spinnerStyle: React.CSSProperties = {
  width: "30px",
  height: "30px",
  borderRadius: "50%",
  border: "2px solid #1e1e2a",
  borderTopColor: "#ef4444",
  animation: "spin 0.8s linear infinite",
};

const panelStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid #1e1e2a",
  borderRadius: "12px",
  overflow: "hidden",
};

const panelHeader: React.CSSProperties = {
  height: "42px",
  padding: "0 14px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  borderBottom: "1px solid #1e1e2a",
  fontSize: "13px",
  fontWeight: 600,
  color: "#e0e0e6",
  background: "var(--bg-panel)",
};

const panelBody: React.CSSProperties = {
  padding: "14px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "32px",
  borderRadius: "8px",
  border: "1px solid #2a2a36",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  outline: "none",
  padding: "0 10px",
  fontSize: "12px",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  height: "34px",
  borderRadius: "8px",
  border: "none",
  padding: "0 14px",
  background: "linear-gradient(135deg, #ef4444, #b91c1c)",
  color: "white",
  fontSize: "12px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  height: "32px",
  borderRadius: "8px",
  border: "1px solid #2a2a36",
  background: "var(--bg-elevated)",
  color: "#bbb",
  padding: "0 10px",
  fontSize: "11px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  width: "100%",
  height: "34px",
  borderRadius: "8px",
  border: "1px solid rgba(239,68,68,0.35)",
  background: "rgba(239,68,68,0.08)",
  color: "#ef4444",
  fontSize: "12px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  marginBottom: "8px",
  cursor: "pointer",
};

const gridTwo: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
  marginBottom: "10px",
};

const gridThree: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "10px",
  marginBottom: "10px",
};

function readErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}
