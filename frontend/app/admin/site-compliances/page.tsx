"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCcw, Reply, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import { formatDateTime, readErrorMessage } from "@/lib/admin-utils";
import {
  AdminActionMenu,
  AdminDataTable,
  AdminDrawer,
  AdminEmptyState,
  AdminFilterBar,
  AdminMetricCard,
  AdminMetricGrid,
  AdminPageHero,
  AdminPill,
  AdminSectionCard,
  AdminTableHead,
  AdminTableRow,
  adminButtonStyle,
  adminInputStyle,
} from "@/components/admin/ui";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

type ComplianceStatus = "open" | "reviewing" | "resolved" | "dismissed";
type NotificationType = "info" | "warning" | "success" | "critical";

type SiteComplianceRow = {
  id: number;
  account_id?: number | null;
  workspace_id?: string | null;
  business_name: string;
  business_slug?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  user_email?: string | null;
  title: string;
  message: string;
  status: ComplianceStatus | string;
  created_at: string;
  resolved_at?: string | null;
  age_hours: number;
  plan_tier?: string | null;
  access_status?: string | null;
  documents_uploaded_count: number;
  setup_progress_percent: number;
};

type SiteComplianceDetail = SiteComplianceRow & {
  country?: string | null;
  city?: string | null;
  onboarding_completed: boolean;
  payment_required: boolean;
  open_reports_count: number;
};

type SiteComplianceSummary = {
  total: number;
  open: number;
  reviewing: number;
  resolved: number;
  dismissed: number;
  aging_over_24h: number;
  aging_over_72h: number;
};

type ReplyState = {
  title: string;
  message: string;
  type: NotificationType;
  mark_status: ComplianceStatus;
};

const EMPTY_REPLY: ReplyState = {
  title: "",
  message: "",
  type: "info",
  mark_status: "reviewing",
};

function statusTone(status: string): "accent" | "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "resolved":
      return "success";
    case "reviewing":
      return "accent";
    case "dismissed":
      return "neutral";
    default:
      return "warning";
  }
}

function notificationTone(type: NotificationType): "accent" | "success" | "warning" | "danger" | "neutral" {
  switch (type) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "critical":
      return "danger";
    default:
      return "accent";
  }
}

export default function AdminSiteCompliancesPage() {
  const [summary, setSummary] = useState<SiteComplianceSummary | null>(null);
  const [rows, setRows] = useState<SiteComplianceRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedRow, setSelectedRow] = useState<SiteComplianceDetail | null>(null);
  const [reply, setReply] = useState<ReplyState>(EMPTY_REPLY);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      params.set("limit", "300");
      const [summaryRes, rowsRes] = await Promise.all([
        authFetch(`${API}/admin/site-compliances/summary`),
        authFetch(`${API}/admin/site-compliances?${params.toString()}`),
      ]);
      if (!summaryRes.ok || !rowsRes.ok) throw new Error("Failed to load compliance reports");
      setSummary((await summaryRes.json()) as SiteComplianceSummary);
      setRows((await rowsRes.json()) as SiteComplianceRow[]);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load site compliances."));
      setSummary(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  const loadDetail = useCallback(async (reportId: number) => {
    setSaving(true);
    setError("");
    try {
      const response = await authFetch(`${API}/admin/site-compliances/${reportId}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to load report detail");
      }
      const payload = (await response.json()) as SiteComplianceDetail;
      setSelectedRow(payload);
      setReply({
        title: `Response to ${payload.business_name}`,
        message: "",
        type: payload.status === "open" ? "warning" : "info",
        mark_status: payload.status === "open" ? "reviewing" : "resolved",
      });
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load report detail."));
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadList();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadList]);

  const filteredRows = useMemo(() => rows, [rows]);

  const updateStatus = async (reportId: number, status: ComplianceStatus) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`${API}/admin/site-compliances/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update report status");
      }
      setNotice(`Report moved to ${status}.`);
      const payload = (await response.json()) as SiteComplianceDetail;
      if (selectedRow?.id === reportId) setSelectedRow(payload);
      await loadList();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update report status."));
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async () => {
    if (!selectedRow) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!reply.message.trim()) throw new Error("Reply message is required.");
      const response = await authFetch(`${API}/admin/site-compliances/${selectedRow.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: reply.title.trim() || null,
          message: reply.message.trim(),
          type: reply.type,
          mark_status: reply.mark_status,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to send reply");
      }
      setNotice(`Reply sent to ${selectedRow.business_name}.`);
      setReply((prev) => ({ ...prev, message: "" }));
      await loadDetail(selectedRow.id);
      await loadList();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not send compliance reply."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1540px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <AdminPageHero
        eyebrow="Inbound Compliance Inbox"
        title="Site Compliances"
        subtitle="Review client issue reports, triage them with workspace context, and reply through targeted admin notifications."
        actions={<button type="button" style={adminButtonStyle("secondary")} onClick={() => void loadList()}><RefreshCcw size={16} /> Refresh</button>}
      />

      {(error || notice) && (
        <div
          className="admin-ui-surface"
          style={{
            padding: "14px 16px",
            borderColor: error ? "color-mix(in srgb, var(--danger) 42%, transparent)" : "color-mix(in srgb, #34d399 42%, transparent)",
            background: error
              ? "color-mix(in srgb, var(--danger) 10%, var(--bg-surface) 90%)"
              : "color-mix(in srgb, #34d399 10%, var(--bg-surface) 90%)",
            color: error ? "var(--danger)" : "#34d399",
          }}
        >
          {error || notice}
        </div>
      )}

      <AdminMetricGrid>
        <AdminMetricCard label="All reports" value={summary?.total ?? 0} detail="Inbound feedback and issue reports" tone="accent" />
        <AdminMetricCard label="Open" value={summary?.open ?? 0} detail="Awaiting first response" tone="warning" />
        <AdminMetricCard label="Reviewing" value={summary?.reviewing ?? 0} detail="Active triage in progress" tone="accent" />
        <AdminMetricCard label="Resolved" value={summary?.resolved ?? 0} detail="Closed with an admin action" tone="success" />
        <AdminMetricCard label="24h aging" value={summary?.aging_over_24h ?? 0} detail="Open or reviewing beyond 24 hours" tone="warning" />
        <AdminMetricCard label="72h aging" value={summary?.aging_over_72h ?? 0} detail="Needs escalation" tone="danger" />
      </AdminMetricGrid>

      <AdminSectionCard title="Compliance inbox" description="This inbox is for inbound client reports and feedback only. Outbound campaign messaging remains in the notifications center.">
        <AdminFilterBar>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search report title, message, user email..." style={adminInputStyle({ flex: 2, minWidth: "240px" })} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={adminInputStyle({ flex: 1, minWidth: "180px" })}>
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </AdminFilterBar>

        {filteredRows.length ? (
          <AdminDataTable>
            <AdminTableHead columns={[
              <span key="company">Company</span>,
              <span key="report">Report</span>,
              <span key="status">Status</span>,
              <span key="age">Age</span>,
              <span key="created">Created</span>,
              <span key="actions">Actions</span>,
            ]} />
            {filteredRows.map((row) => (
              <AdminTableRow key={row.id} style={{ gridTemplateColumns: "1.15fr 1.4fr 0.75fr 0.7fr 0.9fr 1fr" }}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => void loadDetail(row.id)}
                    style={{ background: "none", border: 0, padding: 0, margin: 0, textAlign: "left", cursor: "pointer", color: "var(--text-primary)", fontWeight: 700, fontSize: "15px" }}
                  >
                    {row.business_name}
                  </button>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <span>{row.workspace_id || "No workspace"}</span>
                    <span>{row.user_email || row.owner_email || "No email"}</span>
                  </div>
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{row.title}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.55 }}>{row.message.length > 110 ? `${row.message.slice(0, 110)}…` : row.message}</div>
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <AdminPill label={row.status} tone={statusTone(row.status)} />
                  <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{row.plan_tier || "No plan"}</span>
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{row.age_hours}h</span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Docs {row.documents_uploaded_count}</span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{formatDateTime(row.created_at)}</div>
                <AdminActionMenu>
                  {row.account_id ? <Link href={`/admin/clients/${row.account_id}`} style={adminButtonStyle("secondary", { minHeight: "36px", padding: "0 10px" })}><ShieldAlert size={14} /> Client</Link> : null}
                  <button type="button" style={adminButtonStyle("ghost", { minHeight: "36px", padding: "0 10px" })} onClick={() => void loadDetail(row.id)}>Review</button>
                </AdminActionMenu>
              </AdminTableRow>
            ))}
          </AdminDataTable>
        ) : (
          <AdminEmptyState title={loading ? "Loading compliance reports..." : "No reports match these filters"} description="The compliance inbox will populate as clients submit platform reports and feedback." />
        )}
      </AdminSectionCard>

      <AdminDrawer
        open={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        title={selectedRow?.title || "Report detail"}
        description={selectedRow ? `${selectedRow.business_name} · ${selectedRow.workspace_id || "unlinked"}` : undefined}
        width={620}
      >
        {selectedRow ? (
          <div style={{ display: "grid", gap: "16px" }}>
            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <AdminPill label={selectedRow.status} tone={statusTone(selectedRow.status)} />
                {selectedRow.plan_tier ? <AdminPill label={selectedRow.plan_tier} tone="neutral" /> : null}
                {selectedRow.access_status ? <AdminPill label={selectedRow.access_status.replaceAll("_", " ")} tone={selectedRow.access_status === "active" ? "success" : selectedRow.access_status === "payment_required" ? "warning" : selectedRow.access_status === "suspended" ? "danger" : "accent"} /> : null}
              </div>
              <div style={{ fontSize: "13px", lineHeight: 1.7, color: "var(--text-primary)" }}>{selectedRow.message}</div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Reported by {selectedRow.user_email || selectedRow.owner_email || "Unknown user"}</div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Created {formatDateTime(selectedRow.created_at)}</div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Resolved {formatDateTime(selectedRow.resolved_at)}</div>
            </div>

            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "10px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Workspace context</div>
              <div className="admin-form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px", fontSize: "13px", color: "var(--text-primary)" }}>
                <div><strong>Company:</strong> {selectedRow.business_name}</div>
                <div><strong>Workspace:</strong> {selectedRow.workspace_id || "No linked workspace"}</div>
                <div><strong>Owner:</strong> {selectedRow.owner_name || "Unassigned"}</div>
                <div><strong>Owner email:</strong> {selectedRow.owner_email || "—"}</div>
                <div><strong>Country:</strong> {selectedRow.country || "—"}</div>
                <div><strong>City:</strong> {selectedRow.city || "—"}</div>
                <div><strong>Onboarding:</strong> {selectedRow.onboarding_completed ? "Complete" : "Pending"}</div>
                <div><strong>Payment required:</strong> {selectedRow.payment_required ? "Yes" : "No"}</div>
                <div><strong>Documents:</strong> {selectedRow.documents_uploaded_count}</div>
                <div><strong>Open reports:</strong> {selectedRow.open_reports_count}</div>
              </div>
              {selectedRow.account_id ? <Link href={`/admin/clients/${selectedRow.account_id}`} style={adminButtonStyle("secondary", { width: "fit-content" })}>Open client console</Link> : null}
            </div>

            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Status controls</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(["open", "reviewing", "resolved", "dismissed"] as const).map((status) => (
                  <button key={status} type="button" style={adminButtonStyle(selectedRow.status === status ? "primary" : "secondary", { minHeight: "36px", padding: "0 10px" })} onClick={() => void updateStatus(selectedRow.id, status)}>
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)", fontWeight: 700 }}>
                <Reply size={16} /> Reply via targeted notification
              </div>
              <input value={reply.title} onChange={(event) => setReply((prev) => ({ ...prev, title: event.target.value }))} placeholder="Reply title" style={adminInputStyle()} />
              <textarea value={reply.message} onChange={(event) => setReply((prev) => ({ ...prev, message: event.target.value }))} placeholder="Write the response that the client will receive in their notifications center." style={adminInputStyle({ minHeight: "120px", padding: "12px 14px", resize: "vertical" })} />
              <div className="admin-form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <select value={reply.type} onChange={(event) => setReply((prev) => ({ ...prev, type: event.target.value as NotificationType }))} style={adminInputStyle()}>
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
                <select value={reply.mark_status} onChange={(event) => setReply((prev) => ({ ...prev, mark_status: event.target.value as ComplianceStatus }))} style={adminInputStyle()}>
                  <option value="reviewing">Mark reviewing</option>
                  <option value="resolved">Mark resolved</option>
                  <option value="dismissed">Mark dismissed</option>
                  <option value="open">Keep open</option>
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" style={adminButtonStyle("primary")} onClick={() => void sendReply()} disabled={saving || !selectedRow.workspace_id}>
                  <CheckCircle2 size={16} /> {saving ? "Sending..." : "Send response"}
                </button>
              </div>
              {!selectedRow.workspace_id ? <AdminPill label="Reply disabled: report is not linked to a workspace" tone="danger" /> : <AdminPill label={`Reply tone: ${reply.type}`} tone={notificationTone(reply.type)} />}
            </div>
          </div>
        ) : null}
      </AdminDrawer>
    </div>
  );
}
