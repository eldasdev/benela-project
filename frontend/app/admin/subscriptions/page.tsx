"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Link2, Pencil, Plus, RefreshCcw, XCircle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `/api` : "http://localhost:8000");

type PlanTier = "trial" | "starter" | "pro" | "enterprise";
type PlanStatus = "active" | "expired" | "cancelled" | "suspended" | "trial";

type Subscription = {
  id: number;
  client_id: number;
  plan_tier: PlanTier;
  status: PlanStatus;
  price_monthly: number;
  seats: number;
  modules: string;
  billing_cycle: string;
  trial_ends_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  created_at: string;
};

type Client = {
  id: number;
  name: string;
  slug: string;
  owner_name: string;
};

type ClientRow = {
  client: Client;
  subscription: Subscription | null;
};

type FormState = {
  client_id: string;
  plan_tier: PlanTier;
  status: PlanStatus;
  price_monthly: string;
  seats: string;
  modules: string;
  billing_cycle: string;
  trial_ends_at: string;
  current_period_start: string;
  current_period_end: string;
};

const EMPTY_FORM: FormState = {
  client_id: "",
  plan_tier: "trial",
  status: "trial",
  price_monthly: "0",
  seats: "10",
  modules: "finance,hr",
  billing_cycle: "monthly",
  trial_ends_at: "",
  current_period_start: "",
  current_period_end: "",
};

function readErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toIsoOrNull(value: string) {
  if (!value.trim()) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export default function AdminSubscriptionsPage() {
  const searchParams = useSearchParams();
  const initialClientFilter = searchParams.get("client_id") || "";

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PlanStatus>("all");
  const [tierFilter, setTierFilter] = useState<"all" | PlanTier>("all");
  const [clientFilter, setClientFilter] = useState(initialClientFilter);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const clientMap = useMemo(() => {
    const map = new Map<number, Client>();
    for (const c of clients) map.set(c.id, c);
    return map;
  }, [clients]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [subsRes, clientsRes] = await Promise.all([
        fetch(`${API}/admin/subscriptions?limit=500`),
        fetch(`${API}/admin/clients`),
      ]);
      const subscriptionsPayload = subsRes.ok ? ((await subsRes.json()) as Subscription[]) : [];
      const clientsPayload = clientsRes.ok ? ((await clientsRes.json()) as ClientRow[]) : [];

      setSubscriptions(Array.isArray(subscriptionsPayload) ? subscriptionsPayload : []);
      setClients(Array.isArray(clientsPayload) ? clientsPayload.map((row) => row.client) : []);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load subscription data."));
      setSubscriptions([]);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subscriptions.filter((sub) => {
      if (statusFilter !== "all" && sub.status !== statusFilter) return false;
      if (tierFilter !== "all" && sub.plan_tier !== tierFilter) return false;
      if (clientFilter.trim() && String(sub.client_id) !== clientFilter.trim()) return false;

      if (!q) return true;
      const client = clientMap.get(sub.client_id);
      const haystack = [
        sub.id,
        sub.client_id,
        sub.plan_tier,
        sub.status,
        sub.billing_cycle,
        client?.name ?? "",
        client?.slug ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [subscriptions, statusFilter, tierFilter, clientFilter, query, clientMap]);

  const stats = useMemo(() => {
    const total = subscriptions.length;
    const active = subscriptions.filter((s) => s.status === "active").length;
    const trials = subscriptions.filter((s) => s.status === "trial").length;
    const cancelled = subscriptions.filter((s) => s.status === "cancelled").length;
    const mrr = subscriptions
      .filter((s) => s.status === "active" || s.status === "trial")
      .reduce((sum, s) => sum + s.price_monthly, 0);
    return { total, active, trials, cancelled, mrr };
  }, [subscriptions]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      client_id: clientFilter && /^\d+$/.test(clientFilter) ? clientFilter : "",
    });
    setShowModal(true);
  };

  const openEdit = (sub: Subscription) => {
    setEditingId(sub.id);
    setForm({
      client_id: String(sub.client_id),
      plan_tier: sub.plan_tier,
      status: sub.status,
      price_monthly: String(sub.price_monthly),
      seats: String(sub.seats),
      modules: sub.modules,
      billing_cycle: sub.billing_cycle,
      trial_ends_at: toDateInput(sub.trial_ends_at),
      current_period_start: toDateInput(sub.current_period_start),
      current_period_end: toDateInput(sub.current_period_end),
    });
    setShowModal(true);
  };

  const submitForm = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!/^\d+$/.test(form.client_id)) throw new Error("Client is required.");
      if (!form.modules.trim()) throw new Error("Modules cannot be empty.");
      if (Number(form.price_monthly) < 0) throw new Error("Price cannot be negative.");
      if (Number(form.seats) <= 0) throw new Error("Seats must be at least 1.");

      const payload = {
        client_id: Number(form.client_id),
        plan_tier: form.plan_tier,
        status: form.status,
        price_monthly: Number(form.price_monthly),
        seats: Number(form.seats),
        modules: form.modules.trim(),
        billing_cycle: form.billing_cycle.trim() || "monthly",
        trial_ends_at: toIsoOrNull(form.trial_ends_at),
        current_period_start: toIsoOrNull(form.current_period_start),
        current_period_end: toIsoOrNull(form.current_period_end),
      };

      const path = editingId ? `/admin/subscriptions/${editingId}` : "/admin/subscriptions";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(`${API}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to save subscription");
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      setNotice(editingId ? "Subscription updated." : "Subscription created.");
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to save subscription."));
    } finally {
      setSaving(false);
    }
  };

  const cancelSubscription = async (subscriptionId: number) => {
    const reason = window.prompt("Cancel reason (optional):", "") || undefined;
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API}/admin/subscriptions/${subscriptionId}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to cancel subscription");
      }
      setNotice("Subscription cancelled.");
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to cancel subscription."));
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1450px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Subscriptions</h1>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
            Control plans, entitlements, seat counts, billing cycles, and cancellation flow.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" style={secondaryBtn} onClick={() => void loadData()}>
            <RefreshCcw size={12} /> Refresh
          </button>
          <button type="button" style={primaryBtn} onClick={openCreate}>
            <Plus size={13} /> Add Subscription
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "9px",
            border: error ? "1px solid rgba(248,113,113,0.25)" : "1px solid rgba(52,211,153,0.25)",
            background: error ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)",
            color: error ? "#f87171" : "#34d399",
            fontSize: "12px",
          }}
        >
          {error || notice}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", marginBottom: "14px" }}>
        {[
          { label: "Total", value: stats.total, color: "var(--accent)" },
          { label: "Active", value: stats.active, color: "#34d399" },
          { label: "Trials", value: stats.trials, color: "#fbbf24" },
          { label: "Cancelled", value: stats.cancelled, color: "#f87171" },
          { label: "Recurring MRR", value: `$${stats.mrr.toLocaleString()}`, color: "#60a5fa" },
        ].map((card) => (
          <div key={card.label} style={{ ...kpiCard, boxShadow: `inset 0 -1px 0 ${card.color}45` }}>
            <div style={{ fontSize: "10px", color: "var(--text-subtle)", marginBottom: "6px" }}>{card.label}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={panelStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 0.9fr 0.9fr auto", gap: "8px", padding: "10px 12px", borderBottom: "1px solid #1e1e2a" }}>
          <input
            placeholder="Search by client, slug, plan, status, billing..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={inputStyle}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | PlanStatus)} style={inputStyle}>
            <option value="all">All statuses</option>
            <option value="active">active</option>
            <option value="trial">trial</option>
            <option value="suspended">suspended</option>
            <option value="expired">expired</option>
            <option value="cancelled">cancelled</option>
          </select>
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value as "all" | PlanTier)} style={inputStyle}>
            <option value="all">All plans</option>
            <option value="trial">trial</option>
            <option value="starter">starter</option>
            <option value="pro">pro</option>
            <option value="enterprise">enterprise</option>
          </select>
          <input
            placeholder="Client ID"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value.replace(/\D/g, ""))}
            style={inputStyle}
          />
          <Link href="/admin/clients" style={miniLinkBtn}>
            Open Clients
          </Link>
        </div>

        <div style={tableHeadStyle}>
          {["Client", "Plan", "Status", "Price", "Seats", "Billing", "Period End", "Actions"].map((h) => (
            <span key={h} style={thStyle}>
              {h}
            </span>
          ))}
        </div>

        {filtered.map((sub) => {
          const client = clientMap.get(sub.client_id);
          return (
            <div key={sub.id} style={tableRowStyle}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>
                  {client?.name || `Client #${sub.client_id}`}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                  {client?.slug || `ID ${sub.client_id}`}
                </span>
              </div>
              <span style={pillStyle}>{sub.plan_tier}</span>
              <span style={{ ...pillStyle, color: statusColor(sub.status), borderColor: `${statusColor(sub.status)}66` }}>
                {sub.status}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>${sub.price_monthly.toLocaleString()}/mo</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{sub.seats}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{sub.billing_cycle}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}
              </span>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                <button type="button" onClick={() => openEdit(sub)} style={iconBtn} title="Edit">
                  <Pencil size={13} />
                </button>
                {sub.status !== "cancelled" && (
                  <button
                    type="button"
                    onClick={() => void cancelSubscription(sub.id)}
                    style={{ ...iconBtn, color: "#f87171" }}
                    title="Cancel"
                  >
                    <XCircle size={13} />
                  </button>
                )}
                <Link href={`/admin/clients/${sub.client_id}`} style={iconBtn} title="Open client">
                  <Link2 size={13} />
                </Link>
              </div>
            </div>
          );
        })}

        {!filtered.length && !loading && (
          <div style={{ padding: "14px", fontSize: "12px", color: "var(--text-muted)" }}>
            No subscriptions match the selected filters.
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editingId ? "Edit Subscription" : "Create Subscription"} onClose={() => setShowModal(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <select
              value={form.client_id}
              onChange={(e) => setForm((prev) => ({ ...prev, client_id: e.target.value }))}
              style={inputStyle}
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  #{client.id} {client.name}
                </option>
              ))}
            </select>
            <select
              value={form.plan_tier}
              onChange={(e) => setForm((prev) => ({ ...prev, plan_tier: e.target.value as PlanTier }))}
              style={inputStyle}
            >
              <option value="trial">trial</option>
              <option value="starter">starter</option>
              <option value="pro">pro</option>
              <option value="enterprise">enterprise</option>
            </select>
            <select
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as PlanStatus }))}
              style={inputStyle}
            >
              <option value="trial">trial</option>
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="expired">expired</option>
              <option value="cancelled">cancelled</option>
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.price_monthly}
              onChange={(e) => setForm((prev) => ({ ...prev, price_monthly: e.target.value }))}
              placeholder="Monthly price"
              style={inputStyle}
            />
            <input
              type="number"
              min={1}
              step={1}
              value={form.seats}
              onChange={(e) => setForm((prev) => ({ ...prev, seats: e.target.value }))}
              placeholder="Seats"
              style={inputStyle}
            />
            <input
              value={form.billing_cycle}
              onChange={(e) => setForm((prev) => ({ ...prev, billing_cycle: e.target.value }))}
              placeholder="Billing cycle"
              style={inputStyle}
            />
          </div>

          <input
            value={form.modules}
            onChange={(e) => setForm((prev) => ({ ...prev, modules: e.target.value }))}
            placeholder="Modules (comma separated)"
            style={{ ...inputStyle, marginBottom: "10px" }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
            <DateField
              label="Trial Ends"
              value={form.trial_ends_at}
              onChange={(value) => setForm((prev) => ({ ...prev, trial_ends_at: value }))}
            />
            <DateField
              label="Period Start"
              value={form.current_period_start}
              onChange={(value) => setForm((prev) => ({ ...prev, current_period_start: value }))}
            />
            <DateField
              label="Period End"
              value={form.current_period_end}
              onChange={(value) => setForm((prev) => ({ ...prev, current_period_end: value }))}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button type="button" style={secondaryBtn} onClick={() => setShowModal(false)}>
              Cancel
            </button>
            <button type="button" style={primaryBtn} disabled={saving} onClick={() => void submitForm()}>
              {saving ? "Saving..." : editingId ? "Save Subscription" : "Create Subscription"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "11px", color: "var(--text-subtle)" }}>
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "820px",
          maxWidth: "96vw",
          background: "var(--bg-surface)",
          border: "1px solid #1e1e2a",
          borderRadius: "14px",
          padding: "18px",
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: "15px", color: "var(--text-primary)" }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function statusColor(status: PlanStatus) {
  if (status === "active") return "#34d399";
  if (status === "trial") return "#fbbf24";
  if (status === "cancelled") return "#f87171";
  if (status === "suspended") return "#f59e0b";
  return "#60a5fa";
}

const panelStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid #1e1e2a",
  borderRadius: "12px",
  overflow: "hidden",
};

const kpiCard: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid #1e1e2a",
  borderRadius: "10px",
  padding: "12px",
  position: "relative",
  overflow: "hidden",
};

const tableHeadStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.9fr 0.6fr 0.7fr 0.8fr 150px",
  gap: "8px",
  padding: "10px 12px",
  borderBottom: "1px solid #1a1a24",
  background: "var(--bg-panel)",
};

const tableRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.9fr 0.6fr 0.7fr 0.8fr 150px",
  gap: "8px",
  padding: "11px 12px",
  borderBottom: "1px solid #171721",
  alignItems: "center",
};

const thStyle: React.CSSProperties = {
  fontSize: "10px",
  color: "#3f3f50",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontFamily: "monospace",
};

const pillStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--text-muted)",
  padding: "2px 8px",
  borderRadius: "999px",
  width: "fit-content",
  border: "1px solid #2b2b38",
  background: "var(--bg-elevated)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "33px",
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
  height: "33px",
  borderRadius: "8px",
  border: "none",
  background: "linear-gradient(135deg, #ef4444, #b91c1c)",
  color: "white",
  fontSize: "12px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "5px",
  padding: "0 11px",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  height: "33px",
  borderRadius: "8px",
  border: "1px solid #2a2a36",
  background: "var(--bg-elevated)",
  color: "#bbb",
  fontSize: "12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "5px",
  padding: "0 11px",
  cursor: "pointer",
};

const miniLinkBtn: React.CSSProperties = {
  ...secondaryBtn,
  textDecoration: "none",
};

const iconBtn: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "7px",
  border: "1px solid #2a2a36",
  background: "var(--bg-elevated)",
  color: "#a8a8b8",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  textDecoration: "none",
};
