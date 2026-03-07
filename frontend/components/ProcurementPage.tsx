"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown, ClipboardCheck, ReceiptText, AlertTriangle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

type ProcurementSummary = {
  total_requests: number;
  open_requests: number;
  pending_approval: number;
  approved_requests: number;
  received_requests: number;
  overdue_requests: number;
  spend_committed: number;
  spend_received: number;
  created_last_30d: number;
  avg_procurement_cycle_days: number;
};

type ProcurementRequest = {
  id: number;
  request_number: string;
  title: string;
  department?: string | null;
  requester?: string | null;
  supplier?: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "ordered" | "partially_received" | "received" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  amount: number;
  currency: string;
  due_date?: string | null;
  approved_by?: string | null;
  ordered_at?: string | null;
  received_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

type RequestForm = {
  request_number: string;
  title: string;
  department: string;
  requester: string;
  supplier: string;
  status: ProcurementRequest["status"];
  priority: ProcurementRequest["priority"];
  amount: string;
  currency: string;
  due_date: string;
  approved_by: string;
  ordered_at: string;
  received_at: string;
  notes: string;
};

const statusColor: Record<ProcurementRequest["status"], string> = {
  draft: "var(--text-muted)",
  submitted: "#60a5fa",
  approved: "#34d399",
  rejected: "#f87171",
  ordered: "#fbbf24",
  partially_received: "#a78bfa",
  received: "#22c55e",
  cancelled: "var(--text-muted)",
};

const priorityColor: Record<ProcurementRequest["priority"], string> = {
  low: "#34d399",
  medium: "#60a5fa",
  high: "#f59e0b",
  critical: "#f87171",
};

const emptyForm: RequestForm = {
  request_number: "",
  title: "",
  department: "",
  requester: "",
  supplier: "",
  status: "draft",
  priority: "medium",
  amount: "0",
  currency: "USD",
  due_date: "",
  approved_by: "",
  ordered_at: "",
  received_at: "",
  notes: "",
};

const num = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number) => `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const toInputDate = (value?: string | null): string => (value ? new Date(value).toISOString().slice(0, 10) : "");
const toIsoOrNull = (value: string): string | null => (value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null);

export default function ProcurementPage() {
  const [summary, setSummary] = useState<ProcurementSummary | null>(null);
  const [requests, setRequests] = useState<ProcurementRequest[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<null | "add" | "edit">(null);
  const [selected, setSelected] = useState<ProcurementRequest | null>(null);
  const [form, setForm] = useState<RequestForm>(emptyForm);

  const load = async () => {
    setError("");
    try {
      const [summaryRes, requestsRes] = await Promise.all([
        fetch(`${API}/procurement/summary`),
        fetch(`${API}/procurement/requests?limit=300`),
      ]);
      if (!summaryRes.ok) {
        const body = await summaryRes.json().catch(() => null);
        setError(body?.detail || "Could not load procurement module.");
      }
      setSummary(summaryRes.ok ? await summaryRes.json() : null);
      setRequests(requestsRes.ok ? await requestsRes.json() : []);
    } catch {
      setError("Failed to connect to procurement service.");
      setSummary(null);
      setRequests([]);
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
    setForm({
      ...emptyForm,
      request_number: `PR-${Date.now().toString().slice(-6)}`,
    });
    setModal("add");
  };

  const openEdit = (row: ProcurementRequest) => {
    setSelected(row);
    setForm({
      request_number: row.request_number,
      title: row.title,
      department: row.department || "",
      requester: row.requester || "",
      supplier: row.supplier || "",
      status: row.status,
      priority: row.priority,
      amount: String(row.amount),
      currency: row.currency || "USD",
      due_date: toInputDate(row.due_date),
      approved_by: row.approved_by || "",
      ordered_at: toInputDate(row.ordered_at),
      received_at: toInputDate(row.received_at),
      notes: row.notes || "",
    });
    setModal("edit");
  };

  const save = async () => {
    if (!form.request_number.trim() || !form.title.trim()) {
      alert("Request number and title are required.");
      return;
    }
    setLoading(true);
    const payload = {
      request_number: form.request_number.trim().toUpperCase(),
      title: form.title.trim(),
      department: form.department.trim() || null,
      requester: form.requester.trim() || null,
      supplier: form.supplier.trim() || null,
      status: form.status,
      priority: form.priority,
      amount: num(form.amount),
      currency: form.currency.trim() || "USD",
      due_date: toIsoOrNull(form.due_date),
      approved_by: form.approved_by.trim() || null,
      ordered_at: toIsoOrNull(form.ordered_at),
      received_at: toIsoOrNull(form.received_at),
      notes: form.notes.trim() || null,
    };
    const endpoint = modal === "add" ? `${API}/procurement/requests` : `${API}/procurement/requests/${selected?.id}`;
    const method = modal === "add" ? "POST" : "PUT";
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to save request.");
      setLoading(false);
      return;
    }
    await load();
    setModal(null);
    setLoading(false);
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this procurement request?")) return;
    const res = await fetch(`${API}/procurement/requests/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to delete request.");
      return;
    }
    await load();
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1240px", margin: "0 auto" }}>
      {error ? (
        <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--danger-soft-border)", background: "var(--danger-soft-bg)", color: "var(--danger)", fontSize: "12px" }}>
          {error}
        </div>
      ) : null}

      {summary ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "12px", marginBottom: "14px" }}>
          {[
            { label: "Open Requests", value: String(summary.open_requests), meta: `${summary.pending_approval} pending approval`, color: "#60a5fa", up: summary.pending_approval <= summary.open_requests / 2, icon: <ClipboardCheck size={13} /> },
            { label: "Spend Committed", value: money(summary.spend_committed), meta: `received ${money(summary.spend_received)}`, color: "#34d399", up: summary.spend_received <= summary.spend_committed, icon: <ReceiptText size={13} /> },
            { label: "Overdue", value: String(summary.overdue_requests), meta: "requests past due date", color: summary.overdue_requests ? "#f87171" : "#34d399", up: summary.overdue_requests === 0, icon: <AlertTriangle size={13} /> },
            { label: "Cycle Time", value: `${summary.avg_procurement_cycle_days.toFixed(1)}d`, meta: `${summary.created_last_30d} created in 30d`, color: summary.avg_procurement_cycle_days <= 10 ? "#34d399" : "#fbbf24", up: summary.avg_procurement_cycle_days <= 10, icon: summary.avg_procurement_cycle_days <= 10 ? <TrendingUp size={13} /> : <TrendingDown size={13} /> },
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
      ) : null}

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-default)" }}>
          <div style={{ display: "grid", gap: "2px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Procurement Control Board</span>
            <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Manage purchase requests from intake to receipt.</span>
          </div>
          <button onClick={openAdd} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "9px", border: "none", background: "var(--accent)", color: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}><Plus size={14} />Add Request</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.7fr 0.9fr 0.8fr 0.8fr 0.7fr 0.8fr 92px", gap: "10px", padding: "10px 18px", borderBottom: "1px solid var(--border-soft)", background: "var(--bg-panel)" }}>
          {["Req #", "Title", "Department", "Supplier", "Amount", "Priority", "Status", "Actions"].map((h) => <span key={h} style={{ fontSize: "10px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", fontWeight: 600 }}>{h}</span>)}
        </div>
        {requests.map((row, idx) => (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: "0.8fr 1.7fr 0.9fr 0.8fr 0.8fr 0.7fr 0.8fr 92px", gap: "10px", padding: "12px 18px", borderBottom: idx < requests.length - 1 ? "1px solid var(--table-row-divider)" : "none", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--accent)", fontFamily: "monospace" }}>{row.request_number}</span>
            <div style={{ display: "grid", gap: "2px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{row.title}</span>
              <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{row.requester || "—"} · due {row.due_date ? new Date(row.due_date).toLocaleDateString() : "—"}</span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.department || "—"}</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.supplier || "—"}</span>
            <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{money(row.amount)}</span>
            <span style={{ fontSize: "11px", color: priorityColor[row.priority], background: `${priorityColor[row.priority]}1A`, border: `1px solid ${priorityColor[row.priority]}55`, borderRadius: "999px", padding: "3px 8px", width: "fit-content", textTransform: "capitalize" }}>{row.priority}</span>
            <span style={{ fontSize: "11px", color: statusColor[row.status], background: `${statusColor[row.status]}1A`, border: `1px solid ${statusColor[row.status]}55`, borderRadius: "999px", padding: "3px 8px", width: "fit-content" }}>{row.status.replace("_", " ")}</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={() => openEdit(row)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Pencil size={12} color="var(--text-muted)" /></button>
              <button onClick={() => void remove(row.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Trash2 size={12} color="var(--danger)" /></button>
            </div>
          </div>
        ))}
      </div>

      {modal ? (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-backdrop)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }} onClick={() => setModal(null)}>
          <div style={{ width: "820px", maxWidth: "95vw", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: "24px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <h2 style={{ fontSize: "16px", color: "var(--text-primary)", fontWeight: 600 }}>{modal === "add" ? "Add Procurement Request" : "Edit Procurement Request"}</h2>
              <button onClick={() => setModal(null)} style={{ width: "30px", height: "30px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={13} color="var(--text-muted)" /></button>
            </div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: "10px" }}>
                <div><label style={labelStyle}>Request #</label><input style={inputStyle} value={form.request_number} onChange={(e) => setForm((f) => ({ ...f, request_number: e.target.value }))} /></div>
                <div><label style={labelStyle}>Title</label><input style={inputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
                <div><label style={labelStyle}>Department</label><input style={inputStyle} value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px" }}>
                <div><label style={labelStyle}>Requester</label><input style={inputStyle} value={form.requester} onChange={(e) => setForm((f) => ({ ...f, requester: e.target.value }))} /></div>
                <div><label style={labelStyle}>Supplier</label><input style={inputStyle} value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} /></div>
                <div><label style={labelStyle}>Amount</label><input style={inputStyle} type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></div>
                <div><label style={labelStyle}>Currency</label><input style={inputStyle} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px" }}>
                <div><label style={labelStyle}>Priority</label><select style={inputStyle} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as ProcurementRequest["priority"] }))}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option></select></div>
                <div><label style={labelStyle}>Status</label><select style={inputStyle} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProcurementRequest["status"] }))}><option value="draft">draft</option><option value="submitted">submitted</option><option value="approved">approved</option><option value="rejected">rejected</option><option value="ordered">ordered</option><option value="partially_received">partially_received</option><option value="received">received</option><option value="cancelled">cancelled</option></select></div>
                <div><label style={labelStyle}>Due Date</label><input style={inputStyle} type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} /></div>
                <div><label style={labelStyle}>Approved By</label><input style={inputStyle} value={form.approved_by} onChange={(e) => setForm((f) => ({ ...f, approved_by: e.target.value }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div><label style={labelStyle}>Ordered At</label><input style={inputStyle} type="date" value={form.ordered_at} onChange={(e) => setForm((f) => ({ ...f, ordered_at: e.target.value }))} /></div>
                <div><label style={labelStyle}>Received At</label><input style={inputStyle} type="date" value={form.received_at} onChange={(e) => setForm((f) => ({ ...f, received_at: e.target.value }))} /></div>
              </div>
              <div><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, minHeight: "88px", resize: "vertical" }} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button onClick={() => setModal(null)} style={{ padding: "8px 14px", borderRadius: "9px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", color: "var(--text-muted)", cursor: "pointer" }}>Cancel</button>
                <button onClick={() => void save()} disabled={loading} style={{ padding: "8px 14px", borderRadius: "9px", border: "none", background: "var(--accent)", color: "white", fontWeight: 600, cursor: "pointer" }}>{loading ? "Saving..." : "Save Request"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
