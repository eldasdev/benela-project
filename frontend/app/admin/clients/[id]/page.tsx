"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BellRing,
  Building2,
  Download,
  FileBadge2,
  FileWarning,
  Loader2,
  PauseCircle,
  RefreshCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import {
  type AdminWorkspaceDetail,
  type AdminWorkspaceDocument,
  type AdminWorkspaceReport,
  formatFileSize,
  formatMoney,
  formatWorkspaceAccessTone,
} from "@/lib/admin-client-workspaces";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

type NotificationType = "info" | "warning" | "success" | "critical";

type WorkspaceForm = {
  business_name: string;
  registration_number: string;
  owner_name: string;
  owner_phone: string;
  country: string;
  city: string;
  address: string;
  industry: string;
  employee_count: string;
  plan_tier: string;
};

type ReplyDraft = {
  title: string;
  message: string;
  type: NotificationType;
};

function readErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "object" && err && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function documentTone(status: string) {
  switch (status) {
    case "approved":
      return { color: "#34d399", bg: "color-mix(in srgb, #34d399 14%, transparent)" };
    case "rejected":
      return { color: "#f87171", bg: "color-mix(in srgb, #f87171 14%, transparent)" };
    default:
      return { color: "#fbbf24", bg: "color-mix(in srgb, #fbbf24 14%, transparent)" };
  }
}

function reportTone(status: string) {
  switch (status) {
    case "resolved":
      return { color: "#34d399", bg: "color-mix(in srgb, #34d399 14%, transparent)" };
    case "dismissed":
      return { color: "#94a3b8", bg: "color-mix(in srgb, #94a3b8 14%, transparent)" };
    case "reviewing":
      return { color: "var(--accent)", bg: "color-mix(in srgb, var(--accent-soft) 22%, transparent)" };
    default:
      return { color: "#f59e0b", bg: "color-mix(in srgb, #f59e0b 14%, transparent)" };
  }
}

function toForm(detail: AdminWorkspaceDetail): WorkspaceForm {
  return {
    business_name: detail.business_name || "",
    registration_number: detail.registration_number || "",
    owner_name: detail.owner_name || "",
    owner_phone: detail.owner_phone || "",
    country: detail.country || "",
    city: detail.city || "",
    address: detail.address || "",
    industry: detail.industry || "",
    employee_count: detail.employee_count ? String(detail.employee_count) : "",
    plan_tier: detail.plan_tier || "starter",
  };
}

export default function AdminClientWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const accountId = Number(params.id);

  const [detail, setDetail] = useState<AdminWorkspaceDetail | null>(null);
  const [form, setForm] = useState<WorkspaceForm | null>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft>({ title: "", message: "", type: "info" });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDetail = useCallback(async () => {
    if (!Number.isFinite(accountId)) {
      setError("Invalid workspace account id.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`${API}/admin/client-workspaces/${accountId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to load client workspace");
      }
      const payload = (await res.json()) as AdminWorkspaceDetail;
      setDetail(payload);
      setForm(toForm(payload));
      setReplyDraft({
        title: `Benela update for ${payload.business_name}`,
        message: "",
        type: "info",
      });
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load client workspace."));
      setDetail(null);
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDetail();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadDetail]);

  const accessTone = useMemo(
    () => (detail ? formatWorkspaceAccessTone(detail.access_status) : formatWorkspaceAccessTone("setup_pending")),
    [detail],
  );

  const saveProfile = async () => {
    if (!detail || !form) return;
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      if (!form.business_name.trim()) throw new Error("Business name is required.");
      if (!form.owner_name.trim()) throw new Error("Owner name is required.");
      const payload = {
        business_name: form.business_name.trim(),
        registration_number: form.registration_number.trim() || null,
        owner_name: form.owner_name.trim(),
        owner_phone: form.owner_phone.trim() || null,
        country: form.country.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        industry: form.industry.trim() || null,
        employee_count: form.employee_count.trim() ? Number(form.employee_count) : null,
        plan_tier: form.plan_tier,
      };
      const res = await authFetch(`${API}/admin/client-workspaces/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update workspace profile");
      }
      const next = (await res.json()) as AdminWorkspaceDetail;
      setDetail(next);
      setForm(toForm(next));
      setNotice("Client workspace updated.");
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update client workspace."));
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSuspension = async () => {
    if (!detail) return;
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      const endpoint = detail.is_suspended ? "unsuspend" : "suspend";
      const res = await authFetch(`${API}/admin/client-workspaces/${detail.id}/${endpoint}`, { method: "PATCH" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update client access");
      }
      const next = (await res.json()) as AdminWorkspaceDetail;
      setDetail(next);
      setForm(toForm(next));
      setNotice(detail.is_suspended ? "Client access restored." : "Client access suspended.");
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update access."));
    } finally {
      setActionLoading(false);
    }
  };

  const deleteWorkspace = async () => {
    if (!detail) return;
    const confirmed = window.confirm(
      `Delete ${detail.business_name}? This removes the workspace account, documents, and client reports.`,
    );
    if (!confirmed) return;
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/client-workspaces/${detail.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to delete workspace");
      }
      router.push("/admin/clients");
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not delete workspace."));
    } finally {
      setActionLoading(false);
    }
  };

  const updateDocumentStatus = async (document: AdminWorkspaceDocument, verificationStatus: "pending" | "approved" | "rejected") => {
    if (!detail) return;
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/client-workspaces/${detail.id}/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification_status: verificationStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update document");
      }
      setNotice(`Document marked as ${verificationStatus}.`);
      await loadDetail();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update document."));
    } finally {
      setActionLoading(false);
    }
  };

  const updateReportStatus = async (report: AdminWorkspaceReport, status: "open" | "reviewing" | "resolved" | "dismissed") => {
    if (!detail) return;
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/client-workspaces/${detail.id}/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update report");
      }
      setNotice(`Report moved to ${status}.`);
      await loadDetail();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update report."));
    } finally {
      setActionLoading(false);
    }
  };

  const sendReply = async () => {
    if (!detail) return;
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      if (!replyDraft.title.trim()) throw new Error("Title is required.");
      if (!replyDraft.message.trim()) throw new Error("Message is required.");
      const res = await authFetch(`${API}/admin/client-workspaces/${detail.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: replyDraft.title.trim(),
          message: replyDraft.message.trim(),
          type: replyDraft.type,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to notify client");
      }
      setReplyDraft((prev) => ({ ...prev, message: "" }));
      setNotice("Targeted notification sent.");
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not send notification."));
    } finally {
      setActionLoading(false);
    }
  };

  const panelBorder = "1px solid color-mix(in srgb, var(--border-default) 84%, transparent)";
  const rowBorder = "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)";
  const panelBg =
    "linear-gradient(146deg, color-mix(in srgb, var(--bg-surface) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-surface) 96%, transparent))";
  const elevatedBg =
    "linear-gradient(152deg, color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-panel) 96%, transparent))";

  if (!Number.isFinite(accountId)) {
    return (
      <div className="admin-page-shell" style={{ maxWidth: "1480px", margin: "0 auto" }}>
        <div style={{ color: "#f87171", fontSize: "13px" }}>Invalid workspace account id.</div>
      </div>
    );
  }

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1480px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <div
        style={{
          background: panelBg,
          border: panelBorder,
          borderRadius: "18px",
          padding: "20px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          flexWrap: "wrap",
          boxShadow: "0 22px 42px rgba(5, 10, 24, 0.14)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
            <Link href="/admin/clients" style={secondaryLinkBtn}>
              <ArrowLeft size={14} />
              Back to clients
            </Link>
            {detail ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: accessTone.text,
                  border: `1px solid ${accessTone.border}`,
                  background: accessTone.bg,
                }}
              >
                {detail.access_label}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: "30px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.05 }}>
            {detail?.business_name || "Client Workspace"}
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-subtle)", marginTop: "8px", lineHeight: 1.65 }}>
            Real workspace account console. Manage onboarding, business data, document verification, feedback, billing state,
            and targeted admin responses from one screen.
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => void loadDetail()} style={secondaryBtn}>
            <RefreshCcw size={14} />
            Refresh
          </button>
          <button type="button" onClick={() => void saveProfile()} style={primaryBtn} disabled={actionLoading || !form}>
            <Save size={14} />
            Save workspace
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "12px",
            border: error
              ? "1px solid color-mix(in srgb, #f87171 40%, transparent)"
              : "1px solid color-mix(in srgb, #34d399 40%, transparent)",
            background: error
              ? "color-mix(in srgb, #f87171 12%, transparent)"
              : "color-mix(in srgb, #34d399 12%, transparent)",
            color: error ? "#f87171" : "#34d399",
            fontSize: "12px",
            fontWeight: 500,
          }}
        >
          {error || notice}
        </div>
      )}

      {loading || !detail || !form ? (
        <div
          style={{
            minHeight: "360px",
            borderRadius: "18px",
            border: panelBorder,
            background: panelBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-subtle)",
            gap: "10px",
          }}
        >
          <Loader2 size={18} className="animate-spin" />
          Loading client workspace…
        </div>
      ) : (
        <>
          <div
            className="admin-client-detail-hero-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}
          >
            {[
              { label: "Current MRR", value: `${formatMoney(detail.current_mrr)}/mo`, tone: "#34d399" },
              { label: "Setup Progress", value: `${Math.round(detail.setup_progress_percent)}%`, tone: "var(--accent)" },
              { label: "Documents", value: String(detail.documents.length), tone: "#60a5fa" },
              { label: "Open Reports", value: String(detail.reports.filter((item) => !["resolved", "dismissed"].includes(item.status)).length), tone: "#f59e0b" },
              { label: "Trial Ends", value: formatDate(detail.trial_ends_at), tone: "#fbbf24" },
              { label: "Joined", value: formatDate(detail.created_at), tone: "#94a3b8" },
            ].map((card) => (
              <div
                key={card.label}
                style={{
                  background: panelBg,
                  border: panelBorder,
                  borderRadius: "14px",
                  padding: "16px 18px",
                  boxShadow: "0 16px 34px rgba(5, 10, 24, 0.12)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginBottom: "8px", fontWeight: 600 }}>{card.label}</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>{card.value}</div>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "2px",
                    background: `linear-gradient(90deg, transparent, ${card.tone}70, transparent)`,
                  }}
                />
              </div>
            ))}
          </div>

          <div
            className="admin-client-detail-layout"
            style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(360px, 0.95fr)", gap: "18px" }}
          >
            <div style={{ display: "grid", gap: "18px" }}>
              <section style={panelStyle(panelBg, panelBorder)}>
                <SectionTitle icon={<Building2 size={14} />} title="Workspace Profile" />
                <div className="admin-workspace-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                  <Field label="Business name">
                    <input value={form.business_name} onChange={(event) => setForm({ ...form, business_name: event.target.value })} style={controlInputStyle} />
                  </Field>
                  <Field label="Registration number">
                    <input value={form.registration_number} onChange={(event) => setForm({ ...form, registration_number: event.target.value })} style={controlInputStyle} />
                  </Field>
                  <Field label="Owner name">
                    <input value={form.owner_name} onChange={(event) => setForm({ ...form, owner_name: event.target.value })} style={controlInputStyle} />
                  </Field>
                  <Field label="Owner phone">
                    <input value={form.owner_phone} onChange={(event) => setForm({ ...form, owner_phone: event.target.value })} style={controlInputStyle} />
                  </Field>
                  <Field label="Country">
                    <input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} style={controlInputStyle} />
                  </Field>
                  <Field label="City">
                    <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} style={controlInputStyle} />
                  </Field>
                  <Field label="Industry">
                    <input value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} style={controlInputStyle} />
                  </Field>
                  <Field label="Employees">
                    <input value={form.employee_count} onChange={(event) => setForm({ ...form, employee_count: event.target.value.replace(/[^\d]/g, "") })} style={controlInputStyle} />
                  </Field>
                  <Field label="Plan tier">
                    <select value={form.plan_tier} onChange={(event) => setForm({ ...form, plan_tier: event.target.value })} style={controlInputStyle}>
                      <option value="starter">starter</option>
                      <option value="pro">pro</option>
                      <option value="enterprise">enterprise</option>
                    </select>
                  </Field>
                  <Field label="Client email">
                    <div style={readonlyFieldStyle}>{detail.user_email || "Missing"}</div>
                  </Field>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Field label="Business address">
                      <textarea
                        value={form.address}
                        onChange={(event) => setForm({ ...form, address: event.target.value })}
                        style={{ ...controlInputStyle, minHeight: "110px", paddingTop: "12px", resize: "vertical" }}
                      />
                    </Field>
                  </div>
                </div>
              </section>

              <section style={panelStyle(panelBg, panelBorder)}>
                <SectionTitle icon={<FileBadge2 size={14} />} title="Business Documents" />
                <div style={{ display: "grid", gap: "10px" }}>
                  {detail.documents.length ? (
                    detail.documents.map((document) => {
                      const tone = documentTone(document.verification_status);
                      return (
                        <div
                          key={document.id}
                          style={{
                            borderRadius: "14px",
                            border: rowBorder,
                            background: elevatedBg,
                            padding: "14px",
                            display: "grid",
                            gap: "12px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{document.file_name}</div>
                              <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "4px" }}>
                                {document.document_type} · {formatFileSize(document.size_bytes)} · {formatDateTime(document.created_at)}
                              </div>
                            </div>
                            <span
                              style={{
                                padding: "6px 10px",
                                borderRadius: "999px",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: tone.color,
                                background: tone.bg,
                                border: `1px solid color-mix(in srgb, ${tone.color} 34%, transparent)`,
                              }}
                            >
                              {document.verification_status}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <a href={document.download_url} target="_blank" rel="noreferrer" style={secondaryLinkBtn}>
                              <Download size={14} />
                              Download
                            </a>
                            <button type="button" onClick={() => void updateDocumentStatus(document, "approved")} style={secondaryBtn} disabled={actionLoading}>
                              <ShieldCheck size={14} />
                              Approve
                            </button>
                            <button type="button" onClick={() => void updateDocumentStatus(document, "rejected")} style={dangerBtn} disabled={actionLoading}>
                              <X size={14} />
                              Reject
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <EmptyPanel label="No business documents uploaded yet." />
                  )}
                </div>
              </section>
            </div>

            <div style={{ display: "grid", gap: "18px" }}>
              <section style={panelStyle(panelBg, panelBorder)}>
                <SectionTitle icon={<ShieldCheck size={14} />} title="Lifecycle Controls" />
                <div style={{ display: "grid", gap: "10px" }}>
                  <SummaryRow label="Workspace ID" value={detail.workspace_id} />
                  <SummaryRow label="Access state" value={detail.access_label} />
                  <SummaryRow label="Legacy billing link" value={detail.linked_client ? `${detail.linked_client.name} (#${detail.linked_client.id})` : "Missing"} />
                  <SummaryRow label="Linked subscription" value={detail.linked_subscription ? `${detail.linked_subscription.plan_tier} · ${detail.linked_subscription.status}` : "Missing"} />
                  <SummaryRow label="Duplicate flag" value={detail.duplicate_of_account_id ? `Duplicate of #${detail.duplicate_of_account_id}` : "Original workspace"} />
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
                  <button type="button" onClick={() => void toggleSuspension()} style={secondaryBtn} disabled={actionLoading}>
                    <PauseCircle size={14} />
                    {detail.is_suspended ? "Restore access" : "Suspend access"}
                  </button>
                  <button type="button" onClick={() => void deleteWorkspace()} style={dangerBtn} disabled={actionLoading}>
                    <Trash2 size={14} />
                    Delete workspace
                  </button>
                </div>
              </section>

              <section style={panelStyle(panelBg, panelBorder)}>
                <SectionTitle icon={<BellRing size={14} />} title="Send Admin Response" />
                <div style={{ display: "grid", gap: "10px" }}>
                  <input
                    value={replyDraft.title}
                    onChange={(event) => setReplyDraft({ ...replyDraft, title: event.target.value })}
                    style={controlInputStyle}
                    placeholder="Notification title"
                  />
                  <select
                    value={replyDraft.type}
                    onChange={(event) => setReplyDraft({ ...replyDraft, type: event.target.value as NotificationType })}
                    style={controlInputStyle}
                  >
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                  <textarea
                    value={replyDraft.message}
                    onChange={(event) => setReplyDraft({ ...replyDraft, message: event.target.value })}
                    style={{ ...controlInputStyle, minHeight: "120px", paddingTop: "12px", resize: "vertical" }}
                    placeholder="Compose a targeted message that will be delivered into the client notification feed."
                  />
                  <button type="button" onClick={() => void sendReply()} style={primaryBtn} disabled={actionLoading}>
                    <Send size={14} />
                    Send targeted notification
                  </button>
                </div>
              </section>

              <section style={panelStyle(panelBg, panelBorder)}>
                <SectionTitle icon={<FileWarning size={14} />} title="Client Reports & Feedback" />
                <div style={{ display: "grid", gap: "10px" }}>
                  {detail.reports.length ? (
                    detail.reports.map((report) => {
                      const tone = reportTone(report.status);
                      return (
                        <div
                          key={report.id}
                          style={{
                            borderRadius: "14px",
                            border: rowBorder,
                            background: elevatedBg,
                            padding: "14px",
                            display: "grid",
                            gap: "10px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{report.title}</div>
                              <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "4px" }}>
                                {report.user_email || report.user_id} · {formatDateTime(report.created_at)}
                              </div>
                            </div>
                            <span
                              style={{
                                padding: "6px 10px",
                                borderRadius: "999px",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: tone.color,
                                background: tone.bg,
                                border: `1px solid color-mix(in srgb, ${tone.color} 34%, transparent)`,
                              }}
                            >
                              {report.status}
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.65 }}>{report.message}</div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => void updateReportStatus(report, "reviewing")} style={secondaryBtn} disabled={actionLoading}>
                              <UserRound size={14} />
                              Reviewing
                            </button>
                            <button type="button" onClick={() => void updateReportStatus(report, "resolved")} style={secondaryBtn} disabled={actionLoading}>
                              <ShieldCheck size={14} />
                              Resolve
                            </button>
                            <button type="button" onClick={() => void updateReportStatus(report, "dismissed")} style={dangerBtn} disabled={actionLoading}>
                              <X size={14} />
                              Dismiss
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <EmptyPanel label="No platform reports have been submitted by this client yet." />
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
      <span style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center" }}>{icon}</span>
      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{title}</h3>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: "6px" }}>
      <span style={{ fontSize: "11px", color: "var(--text-subtle)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        padding: "10px 12px",
        borderRadius: "12px",
        border: "1px solid color-mix(in srgb, var(--border-default) 70%, transparent)",
        background: "linear-gradient(152deg, color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-panel) 96%, transparent))",
      }}
    >
      <span style={{ fontSize: "11px", color: "var(--text-subtle)", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "22px 14px",
        borderRadius: "14px",
        border: "1px dashed color-mix(in srgb, var(--border-default) 80%, transparent)",
        background: "color-mix(in srgb, var(--bg-panel) 82%, transparent)",
        color: "var(--text-subtle)",
        fontSize: "12px",
        textAlign: "center",
      }}
    >
      {label}
    </div>
  );
}

function panelStyle(background: string, border: string) {
  return {
    borderRadius: "18px",
    border,
    background,
    padding: "18px",
    boxShadow: "0 16px 30px rgba(5, 10, 24, 0.12)",
  } as const;
}

const controlInputStyle: CSSProperties = {
  width: "100%",
  minHeight: "48px",
  borderRadius: "14px",
  border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
  background: "linear-gradient(148deg, color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-panel) 96%, transparent))",
  color: "var(--text-primary)",
  fontSize: "13px",
  padding: "0 14px",
  outline: "none",
};

const readonlyFieldStyle: CSSProperties = {
  ...controlInputStyle,
  display: "flex",
  alignItems: "center",
  color: "var(--text-muted)",
};

const primaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  height: "46px",
  padding: "0 16px",
  borderRadius: "14px",
  border: "1px solid color-mix(in srgb, var(--accent) 42%, transparent)",
  background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
  color: "white",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  height: "44px",
  padding: "0 14px",
  borderRadius: "14px",
  border: "1px solid color-mix(in srgb, var(--border-default) 88%, transparent)",
  background: "linear-gradient(150deg, color-mix(in srgb, var(--bg-panel) 90%, var(--accent-soft) 10%), color-mix(in srgb, var(--bg-panel) 97%, transparent))",
  color: "var(--text-primary)",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryLinkBtn: CSSProperties = {
  ...secondaryBtn,
  textDecoration: "none",
};

const dangerBtn: CSSProperties = {
  ...secondaryBtn,
  color: "#f87171",
  border: "1px solid color-mix(in srgb, #f87171 38%, transparent)",
  background: "linear-gradient(150deg, color-mix(in srgb, #f87171 10%, transparent), color-mix(in srgb, var(--bg-panel) 97%, transparent))",
};
