"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CreditCard,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `/api` : "http://localhost:8000");

type Client = {
  id: number;
  name: string;
  slug: string;
  owner_name: string;
  owner_email: string;
  owner_phone?: string | null;
  industry?: string | null;
  company_size?: string | null;
  country?: string | null;
  is_active: boolean;
  is_suspended: boolean;
  notes?: string | null;
  created_at: string;
};

type Subscription = {
  id: number;
  client_id: number;
  plan_tier: string;
  status: string;
  price_monthly: number;
  seats: number;
  modules: string;
  billing_cycle: string;
  current_period_end?: string | null;
  created_at: string;
};

type Payment = {
  id: number;
  client_id: number;
  amount: number;
  currency: string;
  status: string;
  payment_method?: string | null;
  invoice_number?: string | null;
  created_at: string;
  paid_at?: string | null;
};

type ActivityItem = {
  id: number;
  client_id: number;
  action: string;
  actor?: string | null;
  extra_data?: string | null;
  created_at: string;
};

type ClientForm = {
  name: string;
  slug: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  industry: string;
  company_size: string;
  country: string;
  notes: string;
};

const EMPTY_FORM: ClientForm = {
  name: "",
  slug: "",
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  industry: "",
  company_size: "",
  country: "",
  notes: "",
};

function readErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export default function AdminClientProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = Number(params.id);

  const [client, setClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    if (!Number.isFinite(clientId)) {
      setError("Invalid client id.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [clientRes, subscriptionsRes, paymentsRes, activityRes] = await Promise.all([
        fetch(`${API}/admin/clients/${clientId}`),
        fetch(`${API}/admin/subscriptions?limit=500`),
        fetch(`${API}/admin/payments/client/${clientId}?limit=100`),
        fetch(`${API}/admin/activity/client/${clientId}?limit=100`),
      ]);

      if (!clientRes.ok) {
        const body = await clientRes.json().catch(() => null);
        throw new Error(body?.detail || "Client not found");
      }

      const clientPayload = (await clientRes.json()) as Client;
      const allSubscriptions = subscriptionsRes.ok ? ((await subscriptionsRes.json()) as Subscription[]) : [];
      const paymentsPayload = paymentsRes.ok ? ((await paymentsRes.json()) as Payment[]) : [];
      const activityPayload = activityRes.ok ? ((await activityRes.json()) as ActivityItem[]) : [];

      setClient(clientPayload);
      setForm({
        name: clientPayload.name,
        slug: clientPayload.slug,
        owner_name: clientPayload.owner_name,
        owner_email: clientPayload.owner_email,
        owner_phone: clientPayload.owner_phone || "",
        industry: clientPayload.industry || "",
        company_size: clientPayload.company_size || "",
        country: clientPayload.country || "",
        notes: clientPayload.notes || "",
      });
      setSubscriptions(allSubscriptions.filter((item) => item.client_id === clientId));
      setPayments(Array.isArray(paymentsPayload) ? paymentsPayload : []);
      setActivity(Array.isArray(activityPayload) ? activityPayload : []);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to load client profile."));
      setClient(null);
      setSubscriptions([]);
      setPayments([]);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const profileStats = useMemo(() => {
    const activeSubscription = subscriptions.find(
      (item) => item.status === "active" || item.status === "trial",
    );
    const lifetimeVolume = payments.reduce((sum, item) => sum + item.amount, 0);
    const paidCount = payments.filter((item) => item.status === "paid").length;
    return {
      activeSubscription,
      lifetimeVolume,
      paidCount,
      totalPayments: payments.length,
      totalSubscriptions: subscriptions.length,
    };
  }, [subscriptions, payments]);

  const saveClient = async () => {
    if (!client) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!form.name.trim()) throw new Error("Company name is required.");
      if (!form.slug.trim()) throw new Error("Slug is required.");
      if (!form.owner_name.trim()) throw new Error("Owner name is required.");
      if (!form.owner_email.trim()) throw new Error("Owner email is required.");

      const res = await fetch(`${API}/admin/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim(),
          owner_name: form.owner_name.trim(),
          owner_email: form.owner_email.trim(),
          owner_phone: form.owner_phone.trim() || null,
          industry: form.industry.trim() || null,
          company_size: form.company_size.trim() || null,
          country: form.country.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update client");
      }
      const payload = (await res.json()) as Client;
      setClient(payload);
      setNotice("Client profile updated.");
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to update client profile."));
    } finally {
      setSaving(false);
    }
  };

  const setSuspended = async (suspend: boolean) => {
    if (!client) return;
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API}/admin/clients/${client.id}/${suspend ? "suspend" : "unsuspend"}`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update client status");
      }
      const payload = (await res.json()) as Client;
      setClient(payload);
      setNotice(suspend ? "Client suspended." : "Client unsuspended.");
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to update client status."));
    }
  };

  const deleteClient = async () => {
    if (!client) return;
    const ok = window.confirm(
      `Delete ${client.name}? This permanently removes the client record and related admin entities.`,
    );
    if (!ok) return;

    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API}/admin/clients/${client.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to delete client");
      }
      router.push("/admin/clients");
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to delete client."));
    }
  };

  if (!Number.isFinite(clientId)) {
    return (
      <div style={{ padding: "24px" }}>
        <p style={{ color: "#f87171", fontSize: "13px" }}>Invalid client id.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1450px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <Link href="/admin/clients" style={linkInlineStyle}>
              <ArrowLeft size={13} /> Clients
            </Link>
            <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>#{clientId}</span>
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            {client?.name || "Client Profile"}
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
            Owner profile, lifecycle actions, subscriptions, billing, and audit activity.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" style={secondaryBtn} onClick={() => void loadData()}>
            <RefreshCcw size={12} /> Refresh
          </button>
          <button type="button" style={primaryBtn} disabled={saving || !client} onClick={() => void saveClient()}>
            <Save size={12} /> {saving ? "Saving..." : "Save Profile"}
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

      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 0.85fr", gap: "14px", marginBottom: "14px" }}>
        <section style={panelStyle}>
          <div style={panelHeader}>Profile</div>
          <div style={{ padding: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Company name"
                style={inputStyle}
              />
              <input
                value={form.slug}
                onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="Slug"
                style={inputStyle}
              />
              <input
                value={form.owner_name}
                onChange={(e) => setForm((prev) => ({ ...prev, owner_name: e.target.value }))}
                placeholder="Owner name"
                style={inputStyle}
              />
              <input
                value={form.owner_email}
                onChange={(e) => setForm((prev) => ({ ...prev, owner_email: e.target.value }))}
                placeholder="Owner email"
                style={inputStyle}
              />
              <input
                value={form.owner_phone}
                onChange={(e) => setForm((prev) => ({ ...prev, owner_phone: e.target.value }))}
                placeholder="Owner phone"
                style={inputStyle}
              />
              <input
                value={form.country}
                onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                placeholder="Country"
                style={inputStyle}
              />
              <input
                value={form.industry}
                onChange={(e) => setForm((prev) => ({ ...prev, industry: e.target.value }))}
                placeholder="Industry"
                style={inputStyle}
              />
              <input
                value={form.company_size}
                onChange={(e) => setForm((prev) => ({ ...prev, company_size: e.target.value }))}
                placeholder="Company size"
                style={inputStyle}
              />
            </div>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Internal notes"
              style={{ ...inputStyle, minHeight: "90px", resize: "vertical", padding: "8px 10px" }}
            />
          </div>
        </section>

        <section style={panelStyle}>
          <div style={panelHeader}>Account Controls</div>
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={statRowStyle}>
              <span style={{ color: "var(--text-subtle)", fontSize: "11px" }}>Current Plan</span>
              <span style={{ color: "var(--text-primary)", fontSize: "12px", fontWeight: 600 }}>
                {profileStats.activeSubscription?.plan_tier || "No active plan"}
              </span>
            </div>
            <div style={statRowStyle}>
              <span style={{ color: "var(--text-subtle)", fontSize: "11px" }}>Payments</span>
              <span style={{ color: "var(--text-primary)", fontSize: "12px", fontWeight: 600 }}>
                {profileStats.paidCount}/{profileStats.totalPayments} paid
              </span>
            </div>
            <div style={statRowStyle}>
              <span style={{ color: "var(--text-subtle)", fontSize: "11px" }}>Lifetime Volume</span>
              <span style={{ color: "var(--text-primary)", fontSize: "12px", fontWeight: 600 }}>
                ${profileStats.lifetimeVolume.toLocaleString()}
              </span>
            </div>
            <div style={statRowStyle}>
              <span style={{ color: "var(--text-subtle)", fontSize: "11px" }}>Subscriptions</span>
              <span style={{ color: "var(--text-primary)", fontSize: "12px", fontWeight: 600 }}>
                {profileStats.totalSubscriptions}
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
              {client?.is_suspended ? (
                <button type="button" style={secondaryBtn} onClick={() => void setSuspended(false)}>
                  <PlayCircle size={12} /> Unsuspend
                </button>
              ) : (
                <button type="button" style={secondaryBtn} onClick={() => void setSuspended(true)}>
                  <PauseCircle size={12} /> Suspend
                </button>
              )}
              <Link href={`/admin/subscriptions?client_id=${clientId}`} style={secondaryLinkBtn}>
                <CreditCard size={12} /> Subscriptions
              </Link>
              <button type="button" style={{ ...secondaryBtn, color: "#f87171" }} onClick={() => void deleteClient()}>
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <section style={panelStyle}>
          <div style={panelHeader}>Subscription History</div>
          <div style={tableHeadStyle}>
            {["Plan", "Status", "Seats", "Billing", "Period End"].map((h) => (
              <span key={h} style={thStyle}>
                {h}
              </span>
            ))}
          </div>
          {subscriptions.map((sub) => (
            <div key={sub.id} style={tableRowStyle}>
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{sub.plan_tier}</span>
              <span style={{ fontSize: "12px", color: statusColor(sub.status) }}>{sub.status}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{sub.seats}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{sub.billing_cycle}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}
              </span>
            </div>
          ))}
          {!subscriptions.length && !loading && (
            <div style={{ padding: "12px", fontSize: "12px", color: "var(--text-muted)" }}>
              No subscriptions found.
            </div>
          )}
        </section>

        <section style={panelStyle}>
          <div style={panelHeader}>Payments</div>
          <div style={tableHeadStyle}>
            {["Date", "Amount", "Method", "Status", "Invoice"].map((h) => (
              <span key={h} style={thStyle}>
                {h}
              </span>
            ))}
          </div>
          {payments.map((payment) => (
            <div key={payment.id} style={tableRowStyle}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {new Date(payment.created_at).toLocaleDateString()}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                {payment.currency} {payment.amount.toLocaleString()}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{payment.payment_method || "—"}</span>
              <span style={{ fontSize: "12px", color: paymentStatusColor(payment.status) }}>{payment.status}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{payment.invoice_number || "—"}</span>
            </div>
          ))}
          {!payments.length && !loading && (
            <div style={{ padding: "12px", fontSize: "12px", color: "var(--text-muted)" }}>
              No payments found.
            </div>
          )}
        </section>
      </div>

      <section style={panelStyle}>
        <div style={panelHeader}>
          <Activity size={14} />
          Activity Log
        </div>
        <div style={tableHeadStyle}>
          {["Date", "Action", "Actor", "Details", ""].map((h) => (
            <span key={h} style={thStyle}>
              {h}
            </span>
          ))}
        </div>
        {activity.map((item) => (
          <div key={item.id} style={tableRowStyle}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {new Date(item.created_at).toLocaleString()}
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{item.action}</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{item.actor || "system"}</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{item.extra_data || "—"}</span>
            <span />
          </div>
        ))}
        {!activity.length && !loading && (
          <div style={{ padding: "12px", fontSize: "12px", color: "var(--text-muted)" }}>
            No recorded activity for this client.
          </div>
        )}
      </section>
    </div>
  );
}

function statusColor(status: string) {
  if (status === "active") return "#34d399";
  if (status === "trial") return "#fbbf24";
  if (status === "cancelled") return "#f87171";
  if (status === "suspended") return "#f59e0b";
  return "#60a5fa";
}

function paymentStatusColor(status: string) {
  if (status === "paid") return "#34d399";
  if (status === "pending") return "#fbbf24";
  if (status === "failed") return "#f87171";
  return "#60a5fa";
}

const panelStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid #1e1e2a",
  borderRadius: "12px",
  overflow: "hidden",
};

const panelHeader: React.CSSProperties = {
  height: "40px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "0 12px",
  borderBottom: "1px solid #1e1e2a",
  fontSize: "13px",
  color: "#e0e0e6",
  fontWeight: 600,
};

const statRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 10px",
  borderRadius: "8px",
  background: "var(--bg-elevated)",
  border: "1px solid #222230",
};

const tableHeadStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
  gap: "8px",
  padding: "10px 12px",
  borderBottom: "1px solid #1a1a24",
  background: "var(--bg-panel)",
};

const tableRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
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
  textDecoration: "none",
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
  textDecoration: "none",
};

const secondaryLinkBtn: React.CSSProperties = {
  ...secondaryBtn,
};

const linkInlineStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  fontSize: "12px",
  color: "var(--accent)",
  textDecoration: "none",
};
