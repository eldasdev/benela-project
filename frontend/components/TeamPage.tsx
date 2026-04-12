"use client";

import { useEffect, useState } from "react";
import { Mail, Pencil, Plus, RefreshCw, Trash2, UserPlus, Users, X } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  fetchTeamMembers,
  inviteTeamMember,
  updateTeamMember,
  removeTeamMember,
  resendInvite,
  type TeamMember,
  type TeamListResponse,
} from "@/lib/team";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "9px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-soft)",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
} as const;

const labelStyle = {
  fontSize: "11px",
  color: "var(--text-subtle)",
  marginBottom: "6px",
  display: "block",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontFamily: "monospace",
} as const;

const AVAILABLE_MODULES = [
  { id: "dashboard", label: "Dashboard", alwaysOn: true },
  { id: "projects", label: "Projects" },
  { id: "finance", label: "Finance" },
  { id: "hr", label: "HR" },
  { id: "sales", label: "Sales" },
  { id: "support", label: "Support" },
  { id: "legal", label: "Legal" },
  { id: "marketing", label: "Marketing" },
  { id: "supply_chain", label: "Supply Chain" },
  { id: "procurement", label: "Procurement" },
  { id: "insights", label: "Insights" },
] as const;

const STATUS_COLOR: Record<string, string> = {
  invited: "#fbbf24",
  active: "#34d399",
  suspended: "#f87171",
  removed: "#6b7280",
};

type Modal = null | "invite" | "edit";

const emptyInvite = {
  email: "",
  full_name: "",
  position_title: "",
  allowed_modules: ["dashboard"] as string[],
};

export default function TeamPage() {
  const isMobile = useIsMobile(900);
  const [data, setData] = useState<TeamListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState(emptyInvite);
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTeamMembers();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openInvite = () => {
    setForm(emptyInvite);
    setSaveError(null);
    setModal("invite");
  };

  const openEdit = (member: TeamMember) => {
    setEditTarget(member);
    setForm({
      email: member.email,
      full_name: member.full_name,
      position_title: member.position_title || "",
      allowed_modules: member.allowed_modules.length ? member.allowed_modules : ["dashboard"],
    });
    setSaveError(null);
    setModal("edit");
  };

  const toggleModule = (moduleId: string) => {
    setForm((prev) => {
      const has = prev.allowed_modules.includes(moduleId);
      if (has) {
        return { ...prev, allowed_modules: prev.allowed_modules.filter((m) => m !== moduleId) };
      }
      return { ...prev, allowed_modules: [...prev.allowed_modules, moduleId] };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (modal === "invite") {
        await inviteTeamMember({
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          position_title: form.position_title.trim() || undefined,
          allowed_modules: form.allowed_modules,
        });
      } else if (modal === "edit" && editTarget) {
        await updateTeamMember(editTarget.id, {
          full_name: form.full_name.trim(),
          position_title: form.position_title.trim() || undefined,
          allowed_modules: form.allowed_modules,
        });
      }
      setModal(null);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    if (!confirm(`Remove ${member.full_name} from the team?`)) return;
    try {
      await removeTeamMember(member.id);
      await load();
    } catch {
      // ignore
    }
  };

  const handleResend = async (member: TeamMember) => {
    try {
      await resendInvite(member.id);
      alert("Invite email resent.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resend");
    }
  };

  const members = data?.members ?? [];

  return (
    <div style={{ padding: isMobile ? "12px" : "24px", maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Users size={18} /> Team Members
          </h2>
          {data && (
            <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
              {data.seats_used} / {data.seats_limit} seats used
            </p>
          )}
        </div>
        <button
          onClick={openInvite}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 16px", borderRadius: "9px", background: "var(--accent)", border: "none", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
        >
          <UserPlus size={14} /> Invite Member
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "10px", border: "1px solid color-mix(in srgb, var(--danger) 40%, var(--border-default) 60%)", background: "color-mix(in srgb, var(--danger) 8%, var(--bg-surface) 92%)", color: "var(--danger)", fontSize: "13px" }}>
          {error}
        </div>
      )}

      {/* Members Table */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
        {members.length === 0 && !loading ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
            No team members yet. Invite someone to get started.
          </div>
        ) : isMobile ? (
          <div style={{ display: "grid", gap: "10px", padding: "12px" }}>
            {members.map((m) => (
              <div key={m.id} style={{ border: "1px solid var(--border-default)", borderRadius: "12px", background: "color-mix(in srgb, var(--bg-panel) 90%, var(--bg-surface) 10%)", padding: "12px", display: "grid", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{m.full_name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "2px", wordBreak: "break-word" }}>{m.email}</div>
                  </div>
                  <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "7px", background: `${STATUS_COLOR[m.status] || "#6b7280"}12`, color: STATUS_COLOR[m.status] || "#6b7280", display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}>
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[m.status] || "#6b7280" }} />
                    {m.status}
                  </span>
                </div>
                {m.position_title && <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Position: {m.position_title}</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {m.allowed_modules.filter((mod) => mod !== "dashboard").map((mod) => (
                    <span key={mod} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "5px", background: "var(--bg-elevated)", color: "var(--text-subtle)", border: "1px solid var(--border-soft)" }}>
                      {mod.replace("_", " ")}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                  {m.status === "invited" && (
                    <button onClick={() => handleResend(m)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Resend invite">
                      <Mail size={12} color="var(--text-muted)" />
                    </button>
                  )}
                  <button onClick={() => openEdit(m)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Pencil size={12} color="var(--text-muted)" />
                  </button>
                  <button onClick={() => handleRemove(m)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={12} color="var(--danger)" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.3fr 1fr 1.5fr 0.7fr 100px", padding: "10px 20px", background: "var(--bg-panel)", borderBottom: "1px solid var(--border-soft)" }}>
              {["Name", "Email", "Position", "Modules", "Status", ""].map((h) => (
                <span key={h} style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{h}</span>
              ))}
            </div>
            {members.map((m, i) => (
              <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.3fr 1fr 1.5fr 0.7fr 100px", padding: "13px 20px", borderBottom: i < members.length - 1 ? "1px solid var(--table-row-divider)" : "none", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{m.full_name}</span>
                <span style={{ fontSize: "13px", color: "var(--text-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</span>
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{m.position_title || "—"}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {m.allowed_modules.filter((mod) => mod !== "dashboard").map((mod) => (
                    <span key={mod} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "5px", background: "var(--bg-elevated)", color: "var(--text-subtle)", border: "1px solid var(--border-soft)" }}>
                      {mod.replace("_", " ")}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[m.status] || "#6b7280"}12`, color: STATUS_COLOR[m.status] || "#6b7280", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[m.status] || "#6b7280" }} />
                  {m.status}
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {m.status === "invited" && (
                    <button onClick={() => handleResend(m)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Resend invite">
                      <Mail size={11} color="var(--text-muted)" />
                    </button>
                  )}
                  <button onClick={() => openEdit(m)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Pencil size={11} color="var(--text-muted)" />
                  </button>
                  <button onClick={() => handleRemove(m)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={11} color="var(--danger)" />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Invite / Edit Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-backdrop)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "10px" : "18px" }} onClick={() => setModal(null)}>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: isMobile ? "16px 14px" : "28px", width: isMobile ? "100%" : "520px", maxWidth: "92vw", maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                {modal === "invite" ? "Invite Team Member" : "Edit Team Member"}
              </h2>
              <button onClick={() => setModal(null)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={13} color="var(--text-muted)" />
              </button>
            </div>

            {saveError && (
              <div style={{ marginBottom: "14px", padding: "10px 12px", borderRadius: "9px", border: "1px solid color-mix(in srgb, var(--danger) 40%, var(--border-default) 60%)", background: "color-mix(in srgb, var(--danger) 8%, var(--bg-surface) 92%)", color: "var(--danger)", fontSize: "12px" }}>
                {saveError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    style={{ ...inputStyle, opacity: modal === "edit" ? 0.6 : 1 }}
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="member@company.com"
                    disabled={modal === "edit"}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Full name</label>
                  <input style={inputStyle} value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} placeholder="Aziz Karimov" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Position title</label>
                <input style={inputStyle} value={form.position_title} onChange={(e) => setForm((p) => ({ ...p, position_title: e.target.value }))} placeholder="e.g. Accountant, HR Manager, Sales Lead" />
              </div>

              {/* Module Access Checkboxes */}
              <div>
                <label style={labelStyle}>Module access</label>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: "8px", marginTop: "4px" }}>
                  {AVAILABLE_MODULES.map((mod) => {
                    const checked = form.allowed_modules.includes(mod.id);
                    const disabled = "alwaysOn" in mod && mod.alwaysOn;
                    return (
                      <label
                        key={mod.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: `1px solid ${checked ? "var(--accent)" : "var(--border-soft)"}`,
                          background: checked ? "color-mix(in srgb, var(--accent) 8%, var(--bg-surface) 92%)" : "var(--bg-elevated)",
                          cursor: disabled ? "default" : "pointer",
                          opacity: disabled ? 0.6 : 1,
                          fontSize: "12px",
                          color: checked ? "var(--text-primary)" : "var(--text-subtle)",
                          fontWeight: checked ? 500 : 400,
                          transition: "all 0.15s",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => !disabled && toggleModule(mod.id)}
                          style={{ accentColor: "var(--accent)", cursor: disabled ? "default" : "pointer" }}
                        />
                        {mod.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "flex-end", flexDirection: isMobile ? "column-reverse" : "row" }}>
              <button onClick={() => setModal(null)} style={{ padding: "9px 18px", borderRadius: "9px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-muted)", fontSize: "13px", cursor: "pointer", width: isMobile ? "100%" : "auto" }}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.email.trim() || !form.full_name.trim()}
                style={{ padding: "9px 20px", borderRadius: "9px", background: "var(--accent)", border: "none", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer", opacity: saving || !form.email.trim() || !form.full_name.trim() ? 0.6 : 1, width: isMobile ? "100%" : "auto" }}
              >
                {saving ? "Saving..." : modal === "invite" ? "Send Invite" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
