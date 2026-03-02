"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, PauseCircle, Pencil, PlayCircle, Plus, RefreshCcw, Trash2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type ClientRecord = {
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

type SubscriptionSnapshot = {
  id: number;
  client_id: number;
  plan_tier: string;
  status: string;
  price_monthly: number;
  seats: number;
  modules: string;
  billing_cycle: string;
} | null;

type ClientRow = {
  client: ClientRecord;
  subscription: SubscriptionSnapshot;
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

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function readErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export default function AdminClientsPage() {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/admin/clients`);
      if (!res.ok) {
        throw new Error("Failed to load clients");
      }
      const payload = (await res.json()) as ClientRow[];
      setRows(Array.isArray(payload) ? payload : []);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load clients."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadClients();
    }, 0);
    return () => clearTimeout(t);
  }, [loadClients]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const { client } = row;
      if (statusFilter === "active" && client.is_suspended) return false;
      if (statusFilter === "suspended" && !client.is_suspended) return false;

      if (!q) return true;
      const haystack = [
        client.name,
        client.slug,
        client.owner_name,
        client.owner_email,
        client.country ?? "",
        client.industry ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, statusFilter]);

  const totals = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => !r.client.is_suspended).length;
    const suspended = rows.filter((r) => r.client.is_suspended).length;
    const monthly = rows.reduce((sum, r) => sum + (r.subscription?.price_monthly ?? 0), 0);
    return { total, active, suspended, monthly };
  }, [rows]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (row: ClientRow) => {
    const { client } = row;
    setEditingId(client.id);
    setForm({
      name: client.name,
      slug: client.slug,
      owner_name: client.owner_name,
      owner_email: client.owner_email,
      owner_phone: client.owner_phone || "",
      industry: client.industry || "",
      company_size: client.company_size || "",
      country: client.country || "",
      notes: client.notes || "",
    });
    setShowModal(true);
  };

  const submitClient = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!form.name.trim()) throw new Error("Company name is required.");
      if (!form.slug.trim()) throw new Error("Slug is required.");
      if (!form.owner_name.trim()) throw new Error("Owner name is required.");
      if (!form.owner_email.trim()) throw new Error("Owner email is required.");

      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        owner_name: form.owner_name.trim(),
        owner_email: form.owner_email.trim(),
        owner_phone: form.owner_phone.trim() || null,
        industry: form.industry.trim() || null,
        company_size: form.company_size.trim() || null,
        country: form.country.trim() || null,
        notes: form.notes.trim() || null,
      };

      const path = editingId ? `/admin/clients/${editingId}` : "/admin/clients";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(`${API}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to save client");
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      setNotice(editingId ? "Client updated." : "Client created.");
      await loadClients();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to save client."));
    } finally {
      setSaving(false);
    }
  };

  const setClientSuspended = async (id: number, suspend: boolean) => {
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API}/admin/clients/${id}/${suspend ? "suspend" : "unsuspend"}`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update suspension");
      }
      setNotice(suspend ? "Client suspended." : "Client unsuspended.");
      await loadClients();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to update client status."));
    }
  };

  const removeClient = async (id: number, name: string) => {
    const ok = window.confirm(
      `Delete ${name}? This permanently removes the client record and related admin entities.`,
    );
    if (!ok) return;
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API}/admin/clients/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to delete client");
      }
      setNotice("Client deleted.");
      await loadClients();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to delete client."));
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1450px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Clients</h1>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
            Manage all tenant organizations, owner profiles, and lifecycle status.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" onClick={() => void loadClients()} style={secondaryBtn}>
            <RefreshCcw size={12} /> Refresh
          </button>
          <button type="button" onClick={openCreateModal} style={primaryBtn}>
            <Plus size={13} /> Add Client
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "14px" }}>
        {[
          { label: "Total Clients", value: totals.total, color: "var(--accent)" },
          { label: "Active", value: totals.active, color: "#34d399" },
          { label: "Suspended", value: totals.suspended, color: "#f87171" },
          { label: "Portfolio MRR", value: `$${totals.monthly.toLocaleString()}`, color: "#60a5fa" },
        ].map((card) => (
          <div key={card.label} style={{ ...kpiCard, boxShadow: `inset 0 -1px 0 ${card.color}45` }}>
            <div style={{ fontSize: "10px", color: "var(--text-subtle)", marginBottom: "6px" }}>{card.label}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...panelStyle, marginBottom: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 0.8fr auto", gap: "8px", padding: "10px 12px", borderBottom: "1px solid #1e1e2a" }}>
          <input
            placeholder="Search by company, slug, owner, email, country..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={inputStyle}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "suspended")}
            style={inputStyle}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <Link href="/admin/dashboard" style={miniLinkBtn}>
            Back to Overview
          </Link>
        </div>

        <div style={tableHeadStyle}>
          {["Company", "Owner", "Plan", "Status", "Country", "Joined", "Actions"].map((h) => (
            <span key={h} style={thStyle}>
              {h}
            </span>
          ))}
        </div>

        {filteredRows.map((row) => (
          <div key={row.client.id} style={tableRowStyle}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{row.client.name}</span>
              <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{row.client.slug}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.client.owner_name}</span>
              <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{row.client.owner_email}</span>
            </div>
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                padding: "2px 8px",
                borderRadius: "999px",
                width: "fit-content",
                border: "1px solid #2b2b38",
                background: "var(--bg-elevated)",
              }}
            >
              {row.subscription ? `${row.subscription.plan_tier} · $${row.subscription.price_monthly}/mo` : "No plan"}
            </span>
            <span
              style={{
                fontSize: "11px",
                color: row.client.is_suspended ? "#f87171" : "#34d399",
                padding: "2px 8px",
                borderRadius: "999px",
                width: "fit-content",
                background: row.client.is_suspended ? "rgba(248,113,113,0.15)" : "rgba(52,211,153,0.15)",
              }}
            >
              {row.client.is_suspended ? "Suspended" : row.client.is_active ? "Active" : "Inactive"}
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.client.country || "—"}</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {new Date(row.client.created_at).toLocaleDateString()}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
              <Link href={`/admin/clients/${row.client.id}`} style={iconBtn} title="Open profile">
                <Eye size={13} />
              </Link>
              <button type="button" onClick={() => openEditModal(row)} style={iconBtn} title="Edit">
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => void setClientSuspended(row.client.id, !row.client.is_suspended)}
                style={iconBtn}
                title={row.client.is_suspended ? "Unsuspend" : "Suspend"}
              >
                {row.client.is_suspended ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
              </button>
              <button
                type="button"
                onClick={() => void removeClient(row.client.id, row.client.name)}
                style={{ ...iconBtn, color: "#f87171" }}
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}

        {!filteredRows.length && !loading && (
          <div style={{ padding: "14px", fontSize: "12px", color: "var(--text-muted)" }}>
            No clients match the current filter.
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          title={editingId ? "Edit Client" : "Add Client"}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <input
              value={form.name}
              onChange={(e) => {
                const nextName = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  name: nextName,
                  slug: editingId || prev.slug ? prev.slug : slugify(nextName),
                }));
              }}
              placeholder="Company name"
              style={inputStyle}
            />
            <input
              value={form.slug}
              onChange={(e) => setForm((prev) => ({ ...prev, slug: slugify(e.target.value) }))}
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
              type="email"
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
            style={{
              ...inputStyle,
              minHeight: "84px",
              resize: "vertical",
              padding: "8px 10px",
              marginBottom: "14px",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button type="button" onClick={() => setShowModal(false)} style={secondaryBtn}>
              Cancel
            </button>
            <button type="button" onClick={() => void submitClient()} disabled={saving} style={primaryBtn}>
              {saving ? "Saving..." : editingId ? "Save Client" : "Create Client"}
            </button>
          </div>
        </Modal>
      )}
    </div>
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
          width: "760px",
          maxWidth: "95vw",
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
  gridTemplateColumns: "1.35fr 1.15fr 1.1fr 0.8fr 0.7fr 0.7fr 190px",
  gap: "8px",
  padding: "10px 12px",
  borderBottom: "1px solid #1a1a24",
  background: "var(--bg-panel)",
};

const tableRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.35fr 1.15fr 1.1fr 0.8fr 0.7fr 0.7fr 190px",
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
