"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Building2,
  KeyRound,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { getSupabase } from "@/lib/supabase";
import {
  CLIENT_SECTIONS,
  ClientSection,
  DEFAULT_CLIENT_SETTINGS,
  NotificationSettings,
  readClientSettings,
  saveClientSettings,
} from "@/lib/client-settings";
import { Section } from "@/types";

const SECTION_LABELS: Record<ClientSection, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  finance: "Finance",
  hr: "HR",
  sales: "Sales",
  support: "Support",
  legal: "Legal",
  marketing: "Marketing",
  supply_chain: "Supply Chain",
  procurement: "Procurement",
  insights: "Insights",
  marketplace: "Marketplace",
};

export default function ClientSettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const [workspaceId, setWorkspaceId] = useState(DEFAULT_CLIENT_SETTINGS.workspaceId);
  const [defaultSection, setDefaultSection] = useState<ClientSection>(
    DEFAULT_CLIENT_SETTINGS.defaultSection
  );
  const [notifications, setNotifications] = useState<NotificationSettings>(
    DEFAULT_CLIENT_SETTINGS.notifications
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const init = async () => {
      const sb = getSupabase();
      const { data, error: getUserError } = await sb.auth.getUser();
      if (getUserError || !data.user) {
        router.push("/login");
        return;
      }
      if (!active) return;

      setEmail(data.user.email ?? "");
      const metadata = (data.user.user_metadata || {}) as Record<string, unknown>;
      setFullName(typeof metadata.full_name === "string" ? metadata.full_name : "");
      setJobTitle(typeof metadata.job_title === "string" ? metadata.job_title : "");

      const stored = readClientSettings();
      setWorkspaceId(stored.workspaceId);
      setDefaultSection(stored.defaultSection);
      setNotifications(stored.notifications);

      setLoading(false);
    };

    void init();
    return () => {
      active = false;
    };
  }, [router]);

  const setMessage = (nextNotice = "", nextError = "") => {
    setNotice(nextNotice);
    setError(nextError);
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setMessage();
    try {
      const sb = getSupabase();
      const { data } = await sb.auth.getUser();
      const existingMetadata = (data.user?.user_metadata || {}) as Record<string, unknown>;

      const { error: updateError } = await sb.auth.updateUser({
        data: {
          ...existingMetadata,
          full_name: fullName.trim(),
          job_title: jobTitle.trim(),
        },
      });
      if (updateError) throw updateError;
      setMessage("Profile saved successfully.");
    } catch (e: unknown) {
      setMessage("", readErrorMessage(e, "Could not update profile."));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePreferences = async () => {
    setSavingPrefs(true);
    setMessage();
    try {
      const normalizedWorkspace = workspaceId.trim();
      if (!normalizedWorkspace) {
        throw new Error("Workspace ID cannot be empty.");
      }
      saveClientSettings({
        workspaceId: normalizedWorkspace,
        defaultSection,
        notifications,
      });
      setWorkspaceId(normalizedWorkspace);
      setMessage("Client settings saved. Dashboard modules now use this workspace.");
    } catch (e: unknown) {
      setMessage("", readErrorMessage(e, "Could not save client settings."));
    } finally {
      setSavingPrefs(false);
    }
  };

  const updatePassword = async () => {
    setSavingPassword(true);
    setMessage();
    try {
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }
      const { error: updateError } = await getSupabase().auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully.");
    } catch (e: unknown) {
      setMessage("", readErrorMessage(e, "Could not update password."));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSectionChange = (section: Section) => {
    if (section === "settings") return;
    const target =
      section === "dashboard" ? "/dashboard" : `/dashboard?section=${encodeURIComponent(section)}`;
    router.push(target);
  };

  const handleLogout = async () => {
    await getSupabase().auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div style={centerStyle}>
        <div style={spinnerStyle} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="platform-glass-app" style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-canvas)" }}>
      <Sidebar onSectionChange={handleSectionChange} onLogout={handleLogout} />
      <main style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "14px",
              marginBottom: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                Client Settings
              </h1>
              <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
                Manage your account, workspace context, notifications, and security.
              </p>
            </div>
            <button onClick={() => router.push("/dashboard")} style={secondaryBtn}>
              <ArrowLeft size={13} />
              Back to Dashboard
            </button>
          </header>

          {(error || notice) && (
            <div
              style={{
                marginBottom: "14px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: error
                  ? "1px solid var(--danger-soft-border)"
                  : "1px solid var(--success-soft-border)",
                background: error ? "var(--danger-soft-bg)" : "var(--success-soft-bg)",
                color: error ? "var(--danger)" : "var(--success)",
                fontSize: "12px",
              }}
            >
              {error || notice}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "16px",
            }}
          >
            <section style={panelStyle}>
              <div style={panelHeader}>
                <UserRound size={14} />
                Account Profile
              </div>
              <div style={panelBody}>
                <Field label="Full Name">
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={inputStyle}
                    placeholder="Your full name"
                  />
                </Field>
                <Field label="Job Title">
                  <input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    style={inputStyle}
                    placeholder="Operations Lead"
                  />
                </Field>
                <Field label="Email">
                  <input value={email} disabled style={{ ...inputStyle, color: "var(--text-muted)" }} />
                </Field>
                <button onClick={saveProfile} style={primaryBtn} disabled={savingProfile}>
                  <Save size={13} />
                  {savingProfile ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelHeader}>
                <Building2 size={14} />
                Workspace Context
              </div>
              <div style={panelBody}>
                <Field label="Workspace ID">
                  <input
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    style={inputStyle}
                    placeholder="default-workspace"
                  />
                </Field>
                <Field label="Default Dashboard Module">
                  <select
                    value={defaultSection}
                    onChange={(e) => setDefaultSection(e.target.value as ClientSection)}
                    style={inputStyle}
                  >
                    {CLIENT_SECTIONS.map((section) => (
                      <option key={section} value={section}>
                        {SECTION_LABELS[section]}
                      </option>
                    ))}
                  </select>
                </Field>
                <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  This workspace ID is used by dashboard and marketplace API calls.
                </p>
                <button onClick={savePreferences} style={primaryBtn} disabled={savingPrefs}>
                  <Save size={13} />
                  {savingPrefs ? "Saving..." : "Save Workspace Preferences"}
                </button>
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelHeader}>
                <Bell size={14} />
                Notification Preferences
              </div>
              <div style={panelBody}>
                <ToggleRow
                  label="Product updates"
                  description="Release notes and feature announcements."
                  checked={notifications.product_updates}
                  onChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, product_updates: checked }))
                  }
                />
                <ToggleRow
                  label="Weekly digest"
                  description="Weekly summary of module activity."
                  checked={notifications.weekly_digest}
                  onChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, weekly_digest: checked }))
                  }
                />
                <ToggleRow
                  label="Security alerts"
                  description="Sign-in and account security events."
                  checked={notifications.security_alerts}
                  onChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, security_alerts: checked }))
                  }
                />
                <ToggleRow
                  label="Billing alerts"
                  description="Invoices, payment issues, and renewal notices."
                  checked={notifications.billing_alerts}
                  onChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, billing_alerts: checked }))
                  }
                />
                <button onClick={savePreferences} style={primaryBtn} disabled={savingPrefs}>
                  <Save size={13} />
                  {savingPrefs ? "Saving..." : "Save Notifications"}
                </button>
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelHeader}>
                <ShieldCheck size={14} />
                Security
              </div>
              <div style={panelBody}>
                <Field label="New Password">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={inputStyle}
                    placeholder="Minimum 8 characters"
                  />
                </Field>
                <Field label="Confirm Password">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={inputStyle}
                    placeholder="Re-enter password"
                  />
                </Field>
                <button onClick={updatePassword} style={primaryBtn} disabled={savingPassword}>
                  <KeyRound size={13} />
                  {savingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
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
    <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
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
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: "100%",
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
        borderRadius: "10px",
        padding: "10px 12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <div style={{ textAlign: "left" }}>
        <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{description}</div>
      </div>
      <div
        style={{
          width: "38px",
          height: "21px",
          borderRadius: "999px",
          border: checked
            ? "1px solid color-mix(in srgb, var(--accent) 45%, var(--border-soft))"
            : "1px solid var(--border-soft)",
          background: checked ? "var(--accent-soft)" : "var(--bg-elevated)",
          position: "relative",
          flexShrink: 0,
          transition: "all 0.2s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "19px" : "2px",
            width: "15px",
            height: "15px",
            borderRadius: "50%",
            background: checked ? "var(--accent)" : "var(--text-muted)",
            transition: "left 0.2s ease",
          }}
        />
      </div>
    </button>
  );
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const centerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "var(--bg-canvas)",
};

const spinnerStyle: React.CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  border: "2px solid var(--border-default)",
  borderTopColor: "var(--accent)",
  animation: "spin 0.8s linear infinite",
};

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--border-default)",
  borderRadius: "14px",
  background: "var(--bg-surface)",
  overflow: "hidden",
};

const panelHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px 14px",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-primary)",
  borderBottom: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
};

const panelBody: React.CSSProperties = {
  padding: "14px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "9px",
  border: "1px solid var(--border-soft)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: "13px",
  padding: "9px 10px",
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  height: "34px",
  padding: "0 12px",
  borderRadius: "9px",
  border: "1px solid color-mix(in srgb, var(--accent) 42%, var(--border-default))",
  background: "var(--accent)",
  color: "white",
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  width: "fit-content",
};

const secondaryBtn: React.CSSProperties = {
  height: "34px",
  padding: "0 12px",
  borderRadius: "9px",
  border: "1px solid var(--border-soft)",
  background: "var(--bg-elevated)",
  color: "var(--text-muted)",
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
};
