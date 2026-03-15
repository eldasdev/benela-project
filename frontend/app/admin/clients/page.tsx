"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  Building2,
  CircleAlert,
  Download,
  Eye,
  FileBadge2,
  FileWarning,
  Loader2,
  Mail,
  PauseCircle,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import {
  type AdminWorkspaceDetail,
  type AdminWorkspaceDocument,
  type AdminWorkspaceReport,
  type AdminWorkspaceRow,
  formatFileSize,
  formatMoney,
  formatWorkspaceAccessTone,
} from "@/lib/admin-client-workspaces";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

type NotificationType = "info" | "warning" | "success" | "critical";

type ReplyDraft = {
  title: string;
  message: string;
  type: NotificationType;
};

const EMPTY_REPLY: ReplyDraft = {
  title: "",
  message: "",
  type: "info",
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

export default function AdminClientsPage() {
  const [rows, setRows] = useState<AdminWorkspaceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "setup_pending" | "payment_required" | "suspended">("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [preview, setPreview] = useState<AdminWorkspaceDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft>(EMPTY_REPLY);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`${API}/admin/client-workspaces?limit=300`);
      if (!res.ok) throw new Error("Failed to load client workspaces");
      const payload = (await res.json()) as AdminWorkspaceRow[];
      setRows(Array.isArray(payload) ? payload : []);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load client workspaces."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async (accountId: number) => {
    setPreviewId(accountId);
    setPreviewLoading(true);
    setReplyDraft(EMPTY_REPLY);
    try {
      const res = await authFetch(`${API}/admin/client-workspaces/${accountId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to load client workspace");
      }
      const payload = (await res.json()) as AdminWorkspaceDetail;
      setPreview(payload);
      setReplyDraft({
        title: `Benela update for ${payload.business_name}`,
        message: "",
        type: "info",
      });
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load workspace detail."));
      setPreview(null);
      setPreviewId(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRows();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.access_status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [
        row.business_name,
        row.business_slug,
        row.workspace_id,
        row.owner_name || "",
        row.user_email || "",
        row.country || "",
        row.city || "",
        row.industry || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, query, statusFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((item) => item.access_status === "active").length;
    const pending = rows.filter((item) => item.access_status === "setup_pending").length;
    const paymentRequired = rows.filter((item) => item.access_status === "payment_required").length;
    const suspended = rows.filter((item) => item.access_status === "suspended").length;
    const openReports = rows.reduce((sum, item) => sum + item.open_reports_count, 0);
    const portfolioMrr = rows.reduce((sum, item) => sum + item.current_mrr, 0);
    return { total, active, pending, paymentRequired, suspended, openReports, portfolioMrr };
  }, [rows]);

  const refreshPreview = async () => {
    if (!previewId) return;
    await loadPreview(previewId);
    await loadRows();
  };

  const updateDocumentStatus = async (document: AdminWorkspaceDocument, verificationStatus: "pending" | "approved" | "rejected") => {
    if (!preview) return;
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/client-workspaces/${preview.id}/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification_status: verificationStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update document status");
      }
      setNotice(`Document marked as ${verificationStatus}.`);
      await refreshPreview();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update document."));
    } finally {
      setActionLoading(false);
    }
  };

  const updateReportStatus = async (report: AdminWorkspaceReport, status: "open" | "reviewing" | "resolved" | "dismissed") => {
    if (!preview) return;
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/client-workspaces/${preview.id}/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update report status");
      }
      setNotice(`Report moved to ${status}.`);
      await refreshPreview();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update report."));
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSuspension = async (row: AdminWorkspaceRow | AdminWorkspaceDetail) => {
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      const endpoint = row.is_suspended ? "unsuspend" : "suspend";
      const res = await authFetch(`${API}/admin/client-workspaces/${row.id}/${endpoint}`, { method: "PATCH" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update client access");
      }
      setNotice(row.is_suspended ? "Client access restored." : "Client access suspended.");
      await refreshPreview();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update workspace status."));
    } finally {
      setActionLoading(false);
    }
  };

  const deleteWorkspace = async (row: AdminWorkspaceRow | AdminWorkspaceDetail) => {
    const confirmed = window.confirm(
      `Delete ${row.business_name}? This removes the workspace account, uploaded business documents, and client reports.`,
    );
    if (!confirmed) return;
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/client-workspaces/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to delete client workspace");
      }
      setNotice("Client workspace deleted.");
      setPreview(null);
      setPreviewId(null);
      await loadRows();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not delete client workspace."));
    } finally {
      setActionLoading(false);
    }
  };

  const sendReply = async () => {
    if (!preview) return;
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      if (!replyDraft.title.trim()) throw new Error("Title is required.");
      if (!replyDraft.message.trim()) throw new Error("Message is required.");
      const res = await authFetch(`${API}/admin/client-workspaces/${preview.id}/notify`, {
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
      setNotice("Targeted notification sent to the client workspace.");
      setReplyDraft((prev) => ({ ...prev, message: "" }));
      await loadRows();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not send notification."));
    } finally {
      setActionLoading(false);
    }
  };

  const panelBorder = "1px solid color-mix(in srgb, var(--border-default) 84%, transparent)";
  const rowBorder = "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)";
  const panelBg =
    "linear-gradient(144deg, color-mix(in srgb, var(--bg-surface) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-surface) 96%, transparent))";
  const elevatedBg =
    "linear-gradient(150deg, color-mix(in srgb, var(--bg-panel) 86%, var(--accent-soft) 14%), color-mix(in srgb, var(--bg-panel) 95%, transparent))";

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1500px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <div
        style={{
          background: panelBg,
          border: panelBorder,
          borderRadius: "16px",
          padding: "20px 22px",
          display: "flex",
          gap: "14px",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          boxShadow: "0 22px 42px rgba(5, 10, 24, 0.14)",
        }}
      >
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                borderRadius: "999px",
                border: panelBorder,
                background: "color-mix(in srgb, var(--accent-soft) 22%, transparent)",
                color: "var(--accent)",
                fontSize: "11px",
                fontWeight: 700,
                padding: "6px 10px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <Building2 size={12} />
              Client Command
            </span>
          </div>
          <h1 style={{ fontSize: "28px", lineHeight: 1.05, margin: 0, color: "var(--text-primary)", fontWeight: 700 }}>
            Clients
          </h1>
          <p style={{ margin: "8px 0 0", color: "var(--text-subtle)", fontSize: "13px", maxWidth: "760px", lineHeight: 1.65 }}>
            Operate on real workspace accounts, not seeded tenant placeholders. Review onboarding state, verify business
            documents, handle client feedback, suspend access, and send targeted responses from one admin surface.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => void loadRows()} style={secondaryBtn}>
            <RefreshCcw size={14} />
            Refresh
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

      <div
        className="admin-clients-metrics"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
        }}
      >
        {[
          { label: "Workspace Accounts", value: stats.total, tone: "var(--accent)" },
          { label: "Active Access", value: stats.active, tone: "#34d399" },
          { label: "Setup Pending", value: stats.pending, tone: "var(--accent)" },
          { label: "Payment Required", value: stats.paymentRequired, tone: "#f59e0b" },
          { label: "Suspended", value: stats.suspended, tone: "#f87171" },
          { label: "Open Reports", value: stats.openReports, tone: "#60a5fa" },
          { label: "Portfolio MRR", value: formatMoney(stats.portfolioMrr), tone: "#34d399" },
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
            <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginBottom: "8px", fontWeight: 600 }}>
              {card.label}
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)" }}>{card.value}</div>
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
        style={{
          background: panelBg,
          border: panelBorder,
          borderRadius: "18px",
          overflow: "hidden",
          boxShadow: "0 22px 42px rgba(5, 10, 24, 0.14)",
        }}
      >
        <div
          className="admin-clients-toolbar"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.8fr) minmax(180px, 220px)",
            gap: "10px",
            padding: "16px",
            borderBottom: rowBorder,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: elevatedBg,
              border: panelBorder,
              borderRadius: "14px",
              padding: "0 14px",
            }}
          >
            <Sparkles size={14} color="var(--accent)" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by business, workspace, owner, email, country, city, or industry..."
              style={inputStyle}
            />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} style={selectStyle}>
            <option value="all">All lifecycle states</option>
            <option value="active">Active</option>
            <option value="setup_pending">Setup pending</option>
            <option value="payment_required">Payment required</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <div style={{ padding: "8px 16px 16px" }}>
          <div
            className="admin-workspace-header-row"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(260px, 1.3fr) minmax(220px, 1fr) minmax(190px, 0.9fr) minmax(160px, 0.8fr) 132px",
              gap: "14px",
              padding: "10px 12px",
              color: "var(--text-subtle)",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            <span>Company</span>
            <span>Setup & Issues</span>
            <span>Plan & Trial</span>
            <span>Status</span>
            <span style={{ textAlign: "right" }}>Actions</span>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            {filteredRows.map((row) => {
              const accessTone = formatWorkspaceAccessTone(row.access_status);
              return (
                <div
                  key={row.id}
                  className="admin-workspace-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(260px, 1.3fr) minmax(220px, 1fr) minmax(190px, 0.9fr) minmax(160px, 0.8fr) 132px",
                    gap: "14px",
                    padding: "16px 14px",
                    borderRadius: "16px",
                    border: rowBorder,
                    background: elevatedBg,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                      <div
                        style={{
                          width: "42px",
                          height: "42px",
                          borderRadius: "14px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "color-mix(in srgb, var(--accent-soft) 24%, transparent)",
                          border: panelBorder,
                          color: "var(--accent)",
                          flexShrink: 0,
                        }}
                      >
                        <Building2 size={18} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
                          {row.business_name}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "3px" }}>
                          {row.business_slug} · {row.workspace_id}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <UserRound size={12} color="var(--text-subtle)" />
                        {row.owner_name || "Owner not provided"}
                        <span style={{ color: "var(--text-subtle)" }}>·</span>
                        <span style={{ color: "var(--text-subtle)" }}>{row.user_email || "No email"}</span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Mail size={12} color="var(--text-subtle)" />
                        {row.country || "Country missing"}
                        {row.city ? ` · ${row.city}` : ""}
                        {row.industry ? ` · ${row.industry}` : ""}
                      </span>
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "10px" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>Setup completion</span>
                      <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 700 }}>
                        {Math.round(row.setup_progress_percent)}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: "8px",
                        width: "100%",
                        borderRadius: "999px",
                        background: "color-mix(in srgb, var(--bg-panel) 84%, transparent)",
                        overflow: "hidden",
                        marginBottom: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(6, Math.min(100, row.setup_progress_percent))}%`,
                          height: "100%",
                          borderRadius: "inherit",
                          background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <span style={metricPillStyle}>
                        <FileBadge2 size={12} />
                        {row.documents_uploaded_count} docs
                      </span>
                      <span style={metricPillStyle}>
                        <FileWarning size={12} />
                        {row.open_reports_count} open reports
                      </span>
                      <span style={metricPillStyle}>
                        <BellRing size={12} />
                        {row.payment_required ? "Needs payment" : "Billing clear"}
                      </span>
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px" }}>Plan</div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", textTransform: "capitalize" }}>
                      {row.plan_tier}
                    </div>
                    <div style={{ fontSize: "12px", color: "#34d399", marginTop: "4px", fontWeight: 600 }}>
                      {formatMoney(row.current_mrr)}/mo
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "10px" }}>
                      Joined {formatDate(row.created_at)}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "4px" }}>
                      Trial {row.trial_seconds_remaining > 0 ? `${Math.round(100 - row.trial_progress_percent)}% left` : "not active"}
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
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
                        marginBottom: "12px",
                      }}
                    >
                      {row.access_label}
                    </span>
                    <div style={{ display: "grid", gap: "8px", fontSize: "11px", color: "var(--text-muted)" }}>
                      <span>{row.onboarding_completed ? "Onboarding complete" : "Onboarding incomplete"}</span>
                      <span>{row.duplicate_of_account_id ? `Duplicate of #${row.duplicate_of_account_id}` : "Original workspace"}</span>
                      <span>{row.employee_count ? `${row.employee_count} employees` : "Employee count missing"}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
                    <button type="button" onClick={() => void loadPreview(row.id)} style={iconBtn} title="Preview client workspace">
                      <Eye size={14} />
                    </button>
                    <Link href={`/admin/clients/${row.id}`} style={iconLinkBtn} title="Open full client console">
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </div>
              );
            })}

            {!filteredRows.length && !loading && (
              <div
                style={{
                  padding: "44px 18px",
                  textAlign: "center",
                  borderRadius: "16px",
                  border: rowBorder,
                  background: elevatedBg,
                }}
              >
                <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>No client workspaces found</div>
                <p style={{ margin: "8px auto 0", fontSize: "13px", color: "var(--text-subtle)", maxWidth: "580px", lineHeight: 1.65 }}>
                  This page now reads real client workspace accounts created by onboarding and bootstrap flows.
                  If you expect a client here, check whether they completed authentication and business setup.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {previewId ? (
        <WorkspacePreviewModal
          detail={preview}
          loading={previewLoading}
          onClose={() => {
            setPreviewId(null);
            setPreview(null);
            setReplyDraft(EMPTY_REPLY);
          }}
          onRefresh={() => void refreshPreview()}
          onToggleSuspension={toggleSuspension}
          onDeleteWorkspace={deleteWorkspace}
          onUpdateDocumentStatus={updateDocumentStatus}
          onUpdateReportStatus={updateReportStatus}
          onReplyDraftChange={setReplyDraft}
          onSendReply={() => void sendReply()}
          replyDraft={replyDraft}
          actionLoading={actionLoading}
        />
      ) : null}
    </div>
  );
}

function WorkspacePreviewModal({
  detail,
  loading,
  onClose,
  onRefresh,
  onToggleSuspension,
  onDeleteWorkspace,
  onUpdateDocumentStatus,
  onUpdateReportStatus,
  replyDraft,
  onReplyDraftChange,
  onSendReply,
  actionLoading,
}: {
  detail: AdminWorkspaceDetail | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onToggleSuspension: (detail: AdminWorkspaceDetail) => Promise<void>;
  onDeleteWorkspace: (detail: AdminWorkspaceDetail) => Promise<void>;
  onUpdateDocumentStatus: (document: AdminWorkspaceDocument, status: "pending" | "approved" | "rejected") => Promise<void>;
  onUpdateReportStatus: (report: AdminWorkspaceReport, status: "open" | "reviewing" | "resolved" | "dismissed") => Promise<void>;
  replyDraft: ReplyDraft;
  onReplyDraftChange: (draft: ReplyDraft) => void;
  onSendReply: () => void;
  actionLoading: boolean;
}) {
  const panelBorder = "1px solid color-mix(in srgb, var(--border-default) 84%, transparent)";
  const rowBorder = "1px solid color-mix(in srgb, var(--border-default) 70%, transparent)";
  const panelBg =
    "linear-gradient(150deg, color-mix(in srgb, var(--bg-surface) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-surface) 96%, transparent))";
  const elevatedBg =
    "linear-gradient(152deg, color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-panel) 96%, transparent))";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 140,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(2, 8, 23, 0.62)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "24px",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(1180px, 100%)",
          maxHeight: "88vh",
          overflow: "hidden",
          borderRadius: "26px",
          border: panelBorder,
          background: panelBg,
          boxShadow: "0 32px 72px rgba(0, 0, 0, 0.32)",
          display: "grid",
          gridTemplateRows: "auto 1fr",
        }}
      >
        <div
          style={{
            padding: "18px 20px",
            borderBottom: rowBorder,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "999px",
                  border: panelBorder,
                  background: "color-mix(in srgb, var(--accent-soft) 18%, transparent)",
                  color: "var(--accent)",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "6px 10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                <ShieldCheck size={12} />
                Client Operations
              </span>
              {detail ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    borderRadius: "999px",
                    padding: "6px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: formatWorkspaceAccessTone(detail.access_status).text,
                    border: `1px solid ${formatWorkspaceAccessTone(detail.access_status).border}`,
                    background: formatWorkspaceAccessTone(detail.access_status).bg,
                  }}
                >
                  {detail.access_label}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)" }}>
              {detail?.business_name || "Loading client workspace..."}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "6px" }}>
              {detail ? `${detail.business_slug} · ${detail.workspace_id}` : "Fetching live client data"}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={onRefresh} style={secondaryBtn}>
              <RefreshCcw size={14} />
              Refresh
            </button>
            {detail ? (
              <Link href={`/admin/clients/${detail.id}`} style={secondaryLinkBtn}>
                <ArrowUpRight size={14} />
                Full console
              </Link>
            ) : null}
            <button type="button" onClick={onClose} style={iconBtn} title="Close preview">
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "20px" }}>
          {loading || !detail ? (
            <div style={{ minHeight: "340px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-subtle)", gap: "10px" }}>
              <Loader2 size={18} className="animate-spin" />
              Loading client workspace…
            </div>
          ) : (
            <div className="admin-workspace-modal-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, 0.85fr)", gap: "18px" }}>
              <div style={{ display: "grid", gap: "18px" }}>
                <section style={modalSectionStyle(panelBg, panelBorder)}>
                  <SectionTitle icon={<Building2 size={14} />} title="Business Snapshot" />
                  <div className="admin-workspace-meta-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                    <InfoField label="Owner" value={detail.owner_name || "Missing"} />
                    <InfoField label="Email" value={detail.user_email || "Missing"} />
                    <InfoField label="Country / City" value={[detail.country, detail.city].filter(Boolean).join(" · ") || "Missing"} />
                    <InfoField label="Industry" value={detail.industry || "Missing"} />
                    <InfoField label="Registration #" value={detail.registration_number || "Missing"} />
                    <InfoField label="Employees" value={detail.employee_count ? String(detail.employee_count) : "Missing"} />
                    <InfoField label="Plan tier" value={detail.plan_tier} />
                    <InfoField label="Current MRR" value={`${formatMoney(detail.current_mrr)}/mo`} />
                  </div>
                  <div
                    style={{
                      marginTop: "14px",
                      padding: "14px",
                      borderRadius: "14px",
                      border: rowBorder,
                      background: elevatedBg,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <div>
                        <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "4px" }}>Setup progress</div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
                          {Math.round(detail.setup_progress_percent)}%
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-subtle)", textAlign: "right" }}>
                        {detail.onboarding_completed ? "Onboarding complete" : "Onboarding incomplete"}
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: "12px",
                        height: "10px",
                        borderRadius: "999px",
                        background: "color-mix(in srgb, var(--bg-panel) 86%, transparent)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(5, Math.min(100, detail.setup_progress_percent))}%`,
                          borderRadius: "inherit",
                          background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
                        }}
                      />
                    </div>
                    {detail.missing_setup_fields.length ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
                        {detail.missing_setup_fields.map((item) => (
                          <span key={item} style={warningPillStyle}>
                            <CircleAlert size={11} />
                            {item.replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section style={modalSectionStyle(panelBg, panelBorder)}>
                  <SectionTitle icon={<FileBadge2 size={14} />} title="Business Documents" />
                  <div style={{ display: "grid", gap: "10px" }}>
                    {detail.documents.length ? (
                      detail.documents.map((document) => {
                        const tone = documentTone(document.verification_status);
                        return (
                          <div
                            key={document.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(0, 1fr) auto",
                              gap: "10px",
                              padding: "14px",
                              borderRadius: "14px",
                              border: rowBorder,
                              background: elevatedBg,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{document.file_name}</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "6px", fontSize: "11px", color: "var(--text-subtle)" }}>
                                <span>{document.document_type}</span>
                                <span>{formatFileSize(document.size_bytes)}</span>
                                <span>{formatDateTime(document.created_at)}</span>
                              </div>
                            </div>
                            <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
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
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <a href={document.download_url} target="_blank" rel="noreferrer" style={iconLinkBtn} title="Download document">
                                  <Download size={14} />
                                </a>
                                <button type="button" onClick={() => void onUpdateDocumentStatus(document, "approved")} style={iconBtn} title="Approve document">
                                  <ShieldCheck size={14} />
                                </button>
                                <button type="button" onClick={() => void onUpdateDocumentStatus(document, "rejected")} style={{ ...iconBtn, color: "#f87171" }} title="Reject document">
                                  <X size={14} />
                                </button>
                              </div>
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
                <section style={modalSectionStyle(panelBg, panelBorder)}>
                  <SectionTitle icon={<ShieldCheck size={14} />} title="Lifecycle Controls" />
                  <div style={{ display: "grid", gap: "10px" }}>
                    <SummaryRow label="Joined" value={formatDate(detail.created_at)} />
                    <SummaryRow label="Trial ends" value={formatDate(detail.trial_ends_at)} />
                    <SummaryRow label="Reports open" value={String(detail.open_reports_count)} />
                    <SummaryRow label="Linked legacy client" value={detail.linked_client ? `${detail.linked_client.name} (#${detail.linked_client.id})` : "Not linked"} />
                    <SummaryRow label="Linked subscription" value={detail.linked_subscription ? `${detail.linked_subscription.plan_tier} · ${detail.linked_subscription.status}` : "Not linked"} />
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
                    <button type="button" onClick={() => void onToggleSuspension(detail)} style={secondaryBtn} disabled={actionLoading}>
                      <PauseCircle size={14} />
                      {detail.is_suspended ? "Restore access" : "Suspend access"}
                    </button>
                    <button type="button" onClick={() => void onDeleteWorkspace(detail)} style={dangerBtn} disabled={actionLoading}>
                      <Trash2 size={14} />
                      Delete workspace
                    </button>
                  </div>
                </section>

                <section style={modalSectionStyle(panelBg, panelBorder)}>
                  <SectionTitle icon={<BellRing size={14} />} title="Respond to Client" />
                  <div style={{ display: "grid", gap: "10px" }}>
                    <input
                      value={replyDraft.title}
                      onChange={(event) => onReplyDraftChange({ ...replyDraft, title: event.target.value })}
                      placeholder="Notification title"
                      style={controlInputStyle}
                    />
                    <select
                      value={replyDraft.type}
                      onChange={(event) => onReplyDraftChange({ ...replyDraft, type: event.target.value as NotificationType })}
                      style={controlInputStyle}
                    >
                      <option value="info">Info</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                    <textarea
                      value={replyDraft.message}
                      onChange={(event) => onReplyDraftChange({ ...replyDraft, message: event.target.value })}
                      placeholder="Write the admin response or action request that should appear in the client notifications feed."
                      style={{ ...controlInputStyle, minHeight: "120px", paddingTop: "12px", resize: "vertical" }}
                    />
                    <button type="button" onClick={onSendReply} style={primaryBtn} disabled={actionLoading}>
                      <Send size={14} />
                      Send targeted notification
                    </button>
                  </div>
                </section>

                <section style={modalSectionStyle(panelBg, panelBorder)}>
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
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.65 }}>
                              {report.message}
                            </div>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button type="button" onClick={() => void onUpdateReportStatus(report, "reviewing")} style={iconBtn} title="Mark reviewing">
                                <Eye size={14} />
                              </button>
                              <button type="button" onClick={() => void onUpdateReportStatus(report, "resolved")} style={iconBtn} title="Resolve report">
                                <ShieldCheck size={14} />
                              </button>
                              <button type="button" onClick={() => void onUpdateReportStatus(report, "dismissed")} style={{ ...iconBtn, color: "#f87171" }} title="Dismiss report">
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <EmptyPanel label="No client platform reports have been submitted." />
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
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

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: "12px",
        border: "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)",
        background: "linear-gradient(150deg, color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-panel) 96%, transparent))",
        padding: "12px",
      }}
    >
      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-subtle)", marginBottom: "6px", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.45 }}>{value}</div>
    </div>
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
        background: "linear-gradient(150deg, color-mix(in srgb, var(--bg-panel) 86%, var(--accent-soft) 14%), color-mix(in srgb, var(--bg-panel) 96%, transparent))",
      }}
    >
      <span style={{ fontSize: "11px", color: "var(--text-subtle)", fontWeight: 600 }}>{label}</span>
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

function modalSectionStyle(background: string, border: string) {
  return {
    borderRadius: "18px",
    border,
    background,
    padding: "16px",
    boxShadow: "0 16px 30px rgba(5, 10, 24, 0.12)",
  } as const;
}

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "none",
  background: "transparent",
  outline: "none",
  color: "var(--text-primary)",
  fontSize: "13px",
  height: "46px",
};

const selectStyle: CSSProperties = {
  width: "100%",
  borderRadius: "14px",
  border: "1px solid color-mix(in srgb, var(--border-default) 84%, transparent)",
  background: "linear-gradient(144deg, color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-panel) 96%, transparent))",
  color: "var(--text-primary)",
  fontSize: "13px",
  padding: "0 14px",
  height: "48px",
  outline: "none",
};

const controlInputStyle: CSSProperties = {
  width: "100%",
  borderRadius: "14px",
  border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
  background: "linear-gradient(148deg, color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-panel) 96%, transparent))",
  color: "var(--text-primary)",
  fontSize: "13px",
  padding: "0 14px",
  minHeight: "48px",
  outline: "none",
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

const iconBtn: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  border: "1px solid color-mix(in srgb, var(--border-default) 84%, transparent)",
  background: "linear-gradient(150deg, color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-panel) 96%, transparent))",
  color: "var(--text-primary)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};

const iconLinkBtn: CSSProperties = {
  ...iconBtn,
  textDecoration: "none",
};

const metricPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 10px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--bg-panel) 88%, transparent)",
  border: "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)",
  color: "var(--text-muted)",
  fontSize: "11px",
  fontWeight: 600,
};

const warningPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 10px",
  borderRadius: "999px",
  background: "color-mix(in srgb, #f59e0b 14%, transparent)",
  border: "1px solid color-mix(in srgb, #f59e0b 34%, transparent)",
  color: "#f59e0b",
  fontSize: "11px",
  fontWeight: 700,
};
