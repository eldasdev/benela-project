"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Play, BarChart3, Activity, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `/api` : "http://localhost:8000");

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
} as const;

type InsightsSummary = {
  total_reports: number;
  active_reports: number;
  paused_reports: number;
  error_reports: number;
  scheduled_reports: number;
  freshness_score_percent: number;
  cross_module_metrics: {
    finance_net: number;
    sales_revenue: number;
    open_support_tickets: number;
    open_procurement_requests: number;
    supply_chain_risk_items: number;
  };
};

type InsightReport = {
  id: number;
  name: string;
  report_type: string;
  owner?: string | null;
  status: "draft" | "active" | "paused" | "error";
  schedule?: string | null;
  kpi_target?: string | null;
  last_run_at?: string | null;
  next_run_at?: string | null;
  summary?: string | null;
  config_json?: string | null;
  created_at: string;
  updated_at: string;
};

type ReportForm = {
  name: string;
  report_type: string;
  owner: string;
  status: InsightReport["status"];
  schedule: string;
  kpi_target: string;
  summary: string;
  config_json: string;
};

const statusColor: Record<InsightReport["status"], string> = {
  draft: "var(--text-muted)",
  active: "#34d399",
  paused: "#fbbf24",
  error: "#f87171",
};

const emptyForm: ReportForm = {
  name: "",
  report_type: "executive",
  owner: "",
  status: "draft",
  schedule: "weekly",
  kpi_target: "",
  summary: "",
  config_json: "",
};

const money = (value: number) => `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const shortDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : "—");

export default function InsightsPage() {
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [reports, setReports] = useState<InsightReport[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [modal, setModal] = useState<null | "add" | "edit">(null);
  const [selected, setSelected] = useState<InsightReport | null>(null);
  const [form, setForm] = useState<ReportForm>(emptyForm);

  const load = async () => {
    setError("");
    try {
      const [summaryRes, reportsRes] = await Promise.all([
        fetch(`${API}/insights/summary`),
        fetch(`${API}/insights/reports?limit=300`),
      ]);
      if (!summaryRes.ok) {
        const body = await summaryRes.json().catch(() => null);
        setError(body?.detail || "Could not load insights module.");
      }
      setSummary(summaryRes.ok ? await summaryRes.json() : null);
      setReports(reportsRes.ok ? await reportsRes.json() : []);
    } catch {
      setError("Failed to connect to insights service.");
      setSummary(null);
      setReports([]);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const openAdd = () => {
    setSelected(null);
    setForm(emptyForm);
    setModal("add");
  };

  const openEdit = (row: InsightReport) => {
    setSelected(row);
    setForm({
      name: row.name,
      report_type: row.report_type,
      owner: row.owner || "",
      status: row.status,
      schedule: row.schedule || "",
      kpi_target: row.kpi_target || "",
      summary: row.summary || "",
      config_json: row.config_json || "",
    });
    setModal("edit");
  };

  const save = async () => {
    if (!form.name.trim()) {
      alert("Report name is required.");
      return;
    }
    setLoading(true);
    const payload = {
      name: form.name.trim(),
      report_type: form.report_type.trim() || "executive",
      owner: form.owner.trim() || null,
      status: form.status,
      schedule: form.schedule.trim() || null,
      kpi_target: form.kpi_target.trim() || null,
      summary: form.summary.trim() || null,
      config_json: form.config_json.trim() || null,
    };
    const endpoint = modal === "add" ? `${API}/insights/reports` : `${API}/insights/reports/${selected?.id}`;
    const method = modal === "add" ? "POST" : "PUT";
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to save insight report.");
      setLoading(false);
      return;
    }
    await load();
    setModal(null);
    setLoading(false);
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this report?")) return;
    const res = await fetch(`${API}/insights/reports/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to delete report.");
      return;
    }
    await load();
  };

  const runReport = async (id: number) => {
    setRunningId(id);
    const res = await fetch(`${API}/insights/reports/${id}/run`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to run report.");
      setRunningId(null);
      return;
    }
    await load();
    setRunningId(null);
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1260px", margin: "0 auto" }}>
      {error ? (
        <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--danger-soft-border)", background: "var(--danger-soft-bg)", color: "var(--danger)", fontSize: "12px" }}>
          {error}
        </div>
      ) : null}

      {summary ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "12px", marginBottom: "12px" }}>
            {[
              { label: "Reports", value: String(summary.total_reports), meta: `${summary.active_reports} active`, color: "#60a5fa", icon: <BarChart3 size={13} /> },
              { label: "Freshness", value: `${summary.freshness_score_percent.toFixed(1)}%`, meta: `${summary.scheduled_reports} scheduled`, color: summary.freshness_score_percent >= 70 ? "#34d399" : "#fbbf24", icon: summary.freshness_score_percent >= 70 ? <TrendingUp size={13} /> : <TrendingDown size={13} /> },
              { label: "Errors", value: String(summary.error_reports), meta: `${summary.paused_reports} paused`, color: summary.error_reports ? "#f87171" : "#34d399", icon: <AlertTriangle size={13} /> },
              { label: "Finance Net", value: money(summary.cross_module_metrics.finance_net), meta: "cross-module metric", color: summary.cross_module_metrics.finance_net >= 0 ? "#34d399" : "#f87171", icon: <Activity size={13} /> },
              { label: "Sales Revenue", value: money(summary.cross_module_metrics.sales_revenue), meta: `${summary.cross_module_metrics.open_support_tickets} open support`, color: "#34d399", icon: <BarChart3 size={13} /> },
            ].map((card) => (
              <div key={card.label} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "15px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{card.label}</span>
                  <span style={{ color: card.color }}>{card.icon}</span>
                </div>
                <div style={{ marginTop: "7px", fontSize: "28px", fontWeight: 650, color: "var(--text-primary)" }}>{card.value}</div>
                <div style={{ marginTop: "3px", fontSize: "11px", color: card.color }}>{card.meta}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "8px", marginBottom: "14px" }}>
            {[
              ["Open Support", String(summary.cross_module_metrics.open_support_tickets)],
              ["Open Procurement", String(summary.cross_module_metrics.open_procurement_requests)],
              ["Supply Chain Risk", String(summary.cross_module_metrics.supply_chain_risk_items)],
              ["Report Health", summary.error_reports ? "Attention Needed" : "Stable"],
            ].map(([label, value]) => (
              <div key={label} style={{ border: "1px solid var(--border-soft)", background: "var(--bg-panel)", borderRadius: "9px", padding: "8px 10px" }}>
                <div style={{ fontSize: "10px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{label}</div>
                <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-default)" }}>
          <div style={{ display: "grid", gap: "2px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Insight Report Studio</span>
            <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Schedule, run, and maintain strategic analytics reports.</span>
          </div>
          <button onClick={openAdd} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "9px", border: "none", background: "var(--accent)", color: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}><Plus size={14} />Add Report</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr 130px", gap: "10px", padding: "10px 18px", borderBottom: "1px solid var(--border-soft)", background: "var(--bg-panel)" }}>
          {["Name", "Type", "Owner", "Status", "Schedule", "Last Run", "Actions"].map((h) => <span key={h} style={{ fontSize: "10px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", fontWeight: 600 }}>{h}</span>)}
        </div>
        {reports.map((row, idx) => (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr 130px", gap: "10px", padding: "12px 18px", borderBottom: idx < reports.length - 1 ? "1px solid var(--table-row-divider)" : "none", alignItems: "center" }}>
            <div style={{ display: "grid", gap: "2px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{row.name}</span>
              <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{row.kpi_target || "No KPI target"}</span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.report_type}</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.owner || "—"}</span>
            <span style={{ fontSize: "11px", color: statusColor[row.status], background: `${statusColor[row.status]}1A`, border: `1px solid ${statusColor[row.status]}55`, borderRadius: "999px", padding: "3px 8px", width: "fit-content", textTransform: "capitalize" }}>{row.status}</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.schedule || "manual"}</span>
            <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{shortDateTime(row.last_run_at)}</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={() => void runReport(row.id)} disabled={runningId === row.id} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title="Run now"><Play size={12} color="var(--accent)" /></button>
              <button onClick={() => openEdit(row)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title="Edit"><Pencil size={12} color="var(--text-muted)" /></button>
              <button onClick={() => void remove(row.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title="Delete"><Trash2 size={12} color="var(--danger)" /></button>
            </div>
          </div>
        ))}
      </div>

      {modal ? (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-backdrop)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }} onClick={() => setModal(null)}>
          <div style={{ width: "760px", maxWidth: "95vw", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: "24px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <h2 style={{ fontSize: "16px", color: "var(--text-primary)", fontWeight: 600 }}>{modal === "add" ? "Add Insight Report" : "Edit Insight Report"}</h2>
              <button onClick={() => setModal(null)} style={{ width: "30px", height: "30px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={13} color="var(--text-muted)" /></button>
            </div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: "10px" }}>
                <div><label style={labelStyle}>Report Name</label><input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div><label style={labelStyle}>Type</label><input style={inputStyle} value={form.report_type} onChange={(e) => setForm((f) => ({ ...f, report_type: e.target.value }))} /></div>
                <div><label style={labelStyle}>Owner</label><input style={inputStyle} value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <div><label style={labelStyle}>Status</label><select style={inputStyle} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as InsightReport["status"] }))}><option value="draft">draft</option><option value="active">active</option><option value="paused">paused</option><option value="error">error</option></select></div>
                <div><label style={labelStyle}>Schedule</label><select style={inputStyle} value={form.schedule} onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))}><option value="">manual</option><option value="daily">daily</option><option value="weekly">weekly</option><option value="monthly">monthly</option></select></div>
                <div><label style={labelStyle}>KPI Target</label><input style={inputStyle} value={form.kpi_target} onChange={(e) => setForm((f) => ({ ...f, kpi_target: e.target.value }))} placeholder="e.g. Margin > 28%" /></div>
              </div>
              <div><label style={labelStyle}>Summary</label><textarea style={{ ...inputStyle, minHeight: "86px", resize: "vertical" }} value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} /></div>
              <div><label style={labelStyle}>Config JSON</label><textarea style={{ ...inputStyle, minHeight: "86px", resize: "vertical", fontFamily: "monospace" }} value={form.config_json} onChange={(e) => setForm((f) => ({ ...f, config_json: e.target.value }))} placeholder='{"modules":["finance","sales"],"window":"30d"}' /></div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button onClick={() => setModal(null)} style={{ padding: "8px 14px", borderRadius: "9px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", color: "var(--text-muted)", cursor: "pointer" }}>Cancel</button>
                <button onClick={() => void save()} disabled={loading} style={{ padding: "8px 14px", borderRadius: "9px", border: "none", background: "var(--accent)", color: "white", fontWeight: 600, cursor: "pointer" }}>{loading ? "Saving..." : "Save Report"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
