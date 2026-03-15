"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown, Headset, Clock3, AlertTriangle } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";

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
} as const;

type SupportSummary = {
  total_tickets: number;
  open_tickets: number;
  urgent_open_tickets: number;
  sla_at_risk: number;
  resolved_last_30d: number;
  created_last_30d: number;
  resolution_rate_percent: number;
  avg_first_response_hours: number;
  avg_csat: number;
};

type SupportTicket = {
  id: number;
  ticket_number: string;
  subject: string;
  customer_name: string;
  customer_email?: string | null;
  channel: "email" | "chat" | "phone" | "portal" | "social";
  module?: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
  assignee?: string | null;
  first_response_at?: string | null;
  sla_due_at?: string | null;
  resolved_at?: string | null;
  satisfaction_score?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

type TicketForm = {
  ticket_number: string;
  subject: string;
  customer_name: string;
  customer_email: string;
  channel: SupportTicket["channel"];
  module: string;
  priority: SupportTicket["priority"];
  status: SupportTicket["status"];
  assignee: string;
  first_response_at: string;
  sla_due_at: string;
  resolved_at: string;
  satisfaction_score: string;
  notes: string;
};

const statusColor: Record<SupportTicket["status"], string> = {
  open: "#60a5fa",
  in_progress: "#fbbf24",
  waiting_customer: "#a78bfa",
  resolved: "#34d399",
  closed: "var(--text-muted)",
};

const priorityColor: Record<SupportTicket["priority"], string> = {
  low: "#34d399",
  medium: "#60a5fa",
  high: "#f59e0b",
  urgent: "#f87171",
};

const emptyForm: TicketForm = {
  ticket_number: "",
  subject: "",
  customer_name: "",
  customer_email: "",
  channel: "portal",
  module: "dashboard",
  priority: "medium",
  status: "open",
  assignee: "",
  first_response_at: "",
  sla_due_at: "",
  resolved_at: "",
  satisfaction_score: "",
  notes: "",
};

const toInputDateTime = (value?: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const toIsoOrNull = (value: string): string | null => (value ? new Date(value).toISOString() : null);
const shortDate = (value?: string | null) => (value ? new Date(value).toLocaleString() : "—");

export default function SupportPage() {
  const isMobile = useIsMobile(900);
  const [summary, setSummary] = useState<SupportSummary | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [modal, setModal] = useState<null | "add" | "edit">(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [form, setForm] = useState<TicketForm>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const statusMix = useMemo(() => {
    const mix = {
      open: 0,
      in_progress: 0,
      waiting_customer: 0,
      resolved: 0,
      closed: 0,
    };
    tickets.forEach((ticket) => {
      mix[ticket.status] += 1;
    });
    return mix;
  }, [tickets]);

  const load = async () => {
    setError("");
    try {
      const [summaryRes, ticketsRes] = await Promise.all([
        fetch(`${API}/support/summary`),
        fetch(`${API}/support/tickets?limit=300`),
      ]);

      if (!summaryRes.ok) {
        const body = await summaryRes.json().catch(() => null);
        setError(body?.detail || "Could not load support module.");
      }

      setSummary(summaryRes.ok ? await summaryRes.json() : null);
      setTickets(ticketsRes.ok ? await ticketsRes.json() : []);
    } catch {
      setError("Failed to connect to support service.");
      setSummary(null);
      setTickets([]);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const openAdd = () => {
    setSelectedTicket(null);
    setForm({
      ...emptyForm,
      ticket_number: `SUP-${Date.now().toString().slice(-6)}`,
    });
    setModal("add");
  };

  const openEdit = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setForm({
      ticket_number: ticket.ticket_number,
      subject: ticket.subject,
      customer_name: ticket.customer_name,
      customer_email: ticket.customer_email || "",
      channel: ticket.channel,
      module: ticket.module || "dashboard",
      priority: ticket.priority,
      status: ticket.status,
      assignee: ticket.assignee || "",
      first_response_at: toInputDateTime(ticket.first_response_at),
      sla_due_at: toInputDateTime(ticket.sla_due_at),
      resolved_at: toInputDateTime(ticket.resolved_at),
      satisfaction_score: ticket.satisfaction_score ? String(ticket.satisfaction_score) : "",
      notes: ticket.notes || "",
    });
    setModal("edit");
  };

  const saveTicket = async () => {
    if (!form.ticket_number.trim() || !form.subject.trim() || !form.customer_name.trim()) {
      alert("Ticket number, subject, and customer name are required.");
      return;
    }
    setLoading(true);
    const payload = {
      ticket_number: form.ticket_number.trim().toUpperCase(),
      subject: form.subject.trim(),
      customer_name: form.customer_name.trim(),
      customer_email: form.customer_email.trim() || null,
      channel: form.channel,
      module: form.module.trim() || null,
      priority: form.priority,
      status: form.status,
      assignee: form.assignee.trim() || null,
      first_response_at: toIsoOrNull(form.first_response_at),
      sla_due_at: toIsoOrNull(form.sla_due_at),
      resolved_at: toIsoOrNull(form.resolved_at),
      satisfaction_score: form.satisfaction_score ? Number(form.satisfaction_score) : null,
      notes: form.notes.trim() || null,
    };
    const endpoint = modal === "add" ? `${API}/support/tickets` : `${API}/support/tickets/${selectedTicket?.id}`;
    const method = modal === "add" ? "POST" : "PUT";
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to save ticket.");
      setLoading(false);
      return;
    }
    await load();
    setModal(null);
    setLoading(false);
  };

  const deleteTicket = async (id: number) => {
    if (!confirm("Delete this support ticket?")) return;
    const res = await fetch(`${API}/support/tickets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to delete ticket.");
      return;
    }
    await load();
  };

  return (
    <div style={{ padding: isMobile ? "12px" : "24px", maxWidth: "1240px", margin: "0 auto" }}>
      {error ? (
        <div
          style={{
            marginBottom: "14px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid var(--danger-soft-border)",
            background: "var(--danger-soft-bg)",
            color: "var(--danger)",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      ) : null}

      {summary ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            {[
              {
                label: "Open Tickets",
                value: String(summary.open_tickets),
                meta: `${summary.urgent_open_tickets} urgent`,
                up: summary.urgent_open_tickets === 0,
                icon: <Headset size={13} />,
                color: summary.urgent_open_tickets === 0 ? "#34d399" : "#f87171",
              },
              {
                label: "SLA At Risk",
                value: String(summary.sla_at_risk),
                meta: "tickets overdue SLA",
                up: summary.sla_at_risk === 0,
                icon: <AlertTriangle size={13} />,
                color: summary.sla_at_risk === 0 ? "#34d399" : "#f87171",
              },
              {
                label: "Resolution Rate",
                value: `${summary.resolution_rate_percent.toFixed(1)}%`,
                meta: `${summary.resolved_last_30d}/${summary.created_last_30d} in 30d`,
                up: summary.resolution_rate_percent >= 70,
                icon: summary.resolution_rate_percent >= 70 ? <TrendingUp size={13} /> : <TrendingDown size={13} />,
                color: summary.resolution_rate_percent >= 70 ? "#34d399" : "#f59e0b",
              },
              {
                label: "Avg First Response",
                value: `${summary.avg_first_response_hours.toFixed(1)}h`,
                meta: "last 60-day tickets",
                up: summary.avg_first_response_hours <= 4,
                icon: <Clock3 size={13} />,
                color: summary.avg_first_response_hours <= 4 ? "#34d399" : "#fbbf24",
              },
              {
                label: "CSAT",
                value: summary.avg_csat ? summary.avg_csat.toFixed(1) : "—",
                meta: "average customer score",
                up: summary.avg_csat >= 4,
                icon: summary.avg_csat >= 4 ? <TrendingUp size={13} /> : <TrendingDown size={13} />,
                color: summary.avg_csat >= 4 ? "#34d399" : "#f59e0b",
              },
            ].map((card) => (
              <div
                key={card.label}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "12px",
                  padding: "15px",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{card.label}</span>
                  <span style={{ color: card.color }}>{card.icon}</span>
                </div>
                <div style={{ marginTop: "7px", fontSize: isMobile ? "22px" : "28px", fontWeight: 650, color: "var(--text-primary)", lineHeight: 1.1 }}>{card.value}</div>
                <div style={{ marginTop: "3px", fontSize: "11px", color: card.color }}>{card.meta}</div>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "1px",
                    background: `linear-gradient(90deg, transparent, ${card.color}55, transparent)`,
                  }}
                />
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
              gap: "8px",
              marginBottom: "14px",
            }}
          >
            {(
              [
                ["open", "Open"],
                ["in_progress", "In Progress"],
                ["waiting_customer", "Waiting"],
                ["resolved", "Resolved"],
                ["closed", "Closed"],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
              style={{
                border: "1px solid var(--border-soft)",
                background: "var(--bg-panel)",
                borderRadius: "9px",
                padding: isMobile ? "8px" : "8px 10px",
                display: "grid",
                gap: "2px",
              }}
              >
                <span style={{ fontSize: "10px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>
                  {label}
                </span>
                <span style={{ fontSize: "14px", color: statusColor[key], fontWeight: 700 }}>{statusMix[key]}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            padding: isMobile ? "14px 12px" : "16px 20px",
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          <div style={{ display: "grid", gap: "2px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Support Case Board</span>
            <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
              Manage issue queue, SLA risk, and resolution flow across modules.
            </span>
          </div>
          <button
            onClick={openAdd}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "9px",
              border: "none",
              background: "var(--accent)",
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              width: isMobile ? "100%" : "auto",
              justifyContent: "center",
            }}
          >
            <Plus size={14} />
            Add Ticket
          </button>
        </div>

        {isMobile ? (
          <div style={{ display: "grid", gap: "10px", padding: "12px" }}>
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                style={{
                  border: "1px solid var(--border-default)",
                  borderRadius: "12px",
                  background: "color-mix(in srgb, var(--bg-panel) 90%, var(--bg-surface) 10%)",
                  padding: "10px",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "12px", color: "var(--accent)", fontFamily: "monospace" }}>{ticket.ticket_number}</div>
                    <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600, marginTop: "2px" }}>{ticket.subject}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "2px" }}>Assignee: {ticket.assignee || "Unassigned"}</div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => openEdit(ticket)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <Pencil size={12} color="var(--text-muted)" />
                    </button>
                    <button onClick={() => void deleteTicket(ticket.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <Trash2 size={12} color="var(--danger)" />
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                  <span>{ticket.customer_name}</span>
                  <span>{ticket.module || "general"}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    <span style={{ fontSize: "11px", color: priorityColor[ticket.priority], background: `${priorityColor[ticket.priority]}1A`, border: `1px solid ${priorityColor[ticket.priority]}55`, borderRadius: "999px", padding: "3px 8px", textTransform: "capitalize" }}>{ticket.priority}</span>
                    <span style={{ fontSize: "11px", color: statusColor[ticket.status], background: `${statusColor[ticket.status]}1A`, border: `1px solid ${statusColor[ticket.status]}55`, borderRadius: "999px", padding: "3px 8px", textTransform: "capitalize" }}>{ticket.status.replace("_", " ")}</span>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>SLA: {shortDate(ticket.sla_due_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "0.9fr 1.7fr 1fr 0.8fr 0.8fr 0.9fr 0.8fr 92px",
                gap: "10px",
                padding: "10px 18px",
                borderBottom: "1px solid var(--border-soft)",
                background: "var(--bg-panel)",
              }}
            >
              {["Ticket", "Subject", "Customer", "Module", "Priority", "Status", "SLA", "Actions"].map((head) => (
                <span
                  key={head}
                  style={{
                    fontSize: "10px",
                    color: "var(--text-quiet)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontFamily: "monospace",
                    fontWeight: 600,
                  }}
                >
                  {head}
                </span>
              ))}
            </div>
            {tickets.map((ticket, index) => (
              <div
                key={ticket.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "0.9fr 1.7fr 1fr 0.8fr 0.8fr 0.9fr 0.8fr 92px",
                  gap: "10px",
                  padding: "12px 18px",
                  borderBottom: index < tickets.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "12px", color: "var(--accent)", fontFamily: "monospace" }}>{ticket.ticket_number}</span>
                <div style={{ display: "grid", gap: "2px" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{ticket.subject}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Assignee: {ticket.assignee || "Unassigned"}</span>
                </div>
                <div style={{ display: "grid", gap: "2px" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{ticket.customer_name}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{ticket.channel}</span>
                </div>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{ticket.module || "general"}</span>
                <span
                  style={{
                    fontSize: "11px",
                    color: priorityColor[ticket.priority],
                    background: `${priorityColor[ticket.priority]}1A`,
                    border: `1px solid ${priorityColor[ticket.priority]}55`,
                    borderRadius: "999px",
                    padding: "3px 8px",
                    width: "fit-content",
                    textTransform: "capitalize",
                  }}
                >
                  {ticket.priority}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: statusColor[ticket.status],
                    background: `${statusColor[ticket.status]}1A`,
                    border: `1px solid ${statusColor[ticket.status]}55`,
                    borderRadius: "999px",
                    padding: "3px 8px",
                    width: "fit-content",
                    textTransform: "capitalize",
                  }}
                >
                  {ticket.status.replace("_", " ")}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{shortDate(ticket.sla_due_at)}</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={() => openEdit(ticket)}
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <Pencil size={12} color="var(--text-muted)" />
                  </button>
                  <button
                    onClick={() => void deleteTicket(ticket.id)}
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={12} color="var(--danger)" />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        {!tickets.length ? (
          <div style={{ padding: "24px 18px", color: "var(--text-subtle)", fontSize: "13px" }}>No support tickets yet.</div>
        ) : null}
      </div>

      {modal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-backdrop)",
            zIndex: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isMobile ? "10px" : "18px",
          }}
          onClick={() => setModal(null)}
        >
          <div
            style={{
              width: isMobile ? "100%" : "820px",
              maxWidth: "95vw",
              maxHeight: "90vh",
              overflow: "auto",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "16px",
              padding: isMobile ? "16px 14px" : "24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <h2 style={{ fontSize: "16px", color: "var(--text-primary)", fontWeight: 600 }}>
                {modal === "add" ? "Create Support Ticket" : "Edit Support Ticket"}
              </h2>
              <button
                onClick={() => setModal(null)}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-elevated)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={13} color="var(--text-muted)" />
              </button>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr 1.2fr", gap: "10px" }}>
                <div>
                  <label style={labelStyle}>Ticket #</label>
                  <input style={inputStyle} value={form.ticket_number} onChange={(e) => setForm((f) => ({ ...f, ticket_number: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Subject</label>
                  <input style={inputStyle} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Module</label>
                  <input style={inputStyle} value={form.module} onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1.2fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelStyle}>Customer</label>
                  <input style={inputStyle} value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input style={inputStyle} value={form.customer_email} onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Assignee</label>
                  <input style={inputStyle} value={form.assignee} onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelStyle}>Channel</label>
                  <select style={inputStyle} value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as SupportTicket["channel"] }))}>
                    <option value="portal">portal</option>
                    <option value="email">email</option>
                    <option value="chat">chat</option>
                    <option value="phone">phone</option>
                    <option value="social">social</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Priority</label>
                  <select style={inputStyle} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as SupportTicket["priority"] }))}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="urgent">urgent</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={inputStyle} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as SupportTicket["status"] }))}>
                    <option value="open">open</option>
                    <option value="in_progress">in_progress</option>
                    <option value="waiting_customer">waiting_customer</option>
                    <option value="resolved">resolved</option>
                    <option value="closed">closed</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Satisfaction (1-5)</label>
                  <input style={inputStyle} type="number" min={1} max={5} value={form.satisfaction_score} onChange={(e) => setForm((f) => ({ ...f, satisfaction_score: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelStyle}>First Response</label>
                  <input style={inputStyle} type="datetime-local" value={form.first_response_at} onChange={(e) => setForm((f) => ({ ...f, first_response_at: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>SLA Due</label>
                  <input style={inputStyle} type="datetime-local" value={form.sla_due_at} onChange={(e) => setForm((f) => ({ ...f, sla_due_at: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Resolved At</label>
                  <input style={inputStyle} type="datetime-local" value={form.resolved_at} onChange={(e) => setForm((f) => ({ ...f, resolved_at: e.target.value }))} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, minHeight: "90px", resize: "vertical" }} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexDirection: isMobile ? "column-reverse" : "row" }}>
                <button
                  onClick={() => setModal(null)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "9px",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveTicket()}
                  disabled={loading}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "9px",
                    border: "none",
                    background: "var(--accent)",
                    color: "white",
                    fontWeight: 600,
                    cursor: "pointer",
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  {loading ? "Saving..." : "Save Ticket"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
