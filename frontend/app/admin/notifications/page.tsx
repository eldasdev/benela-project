"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Megaphone, RefreshCcw, Send, Trash2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `/api` : "http://localhost:8000");

type NotificationType = "info" | "warning" | "success" | "critical";
type NotificationTarget = "all" | "plan_tier" | "specific";

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: NotificationType;
  target: NotificationTarget;
  target_value?: string | null;
  is_sent: boolean;
  sent_at?: string | null;
  recipient_count: number;
  created_at: string;
};

type ComposeForm = {
  title: string;
  message: string;
  type: NotificationType;
  target: NotificationTarget;
  target_value: string;
  recipient_count: string;
};

const EMPTY_FORM: ComposeForm = {
  title: "",
  message: "",
  type: "info",
  target: "all",
  target_value: "",
  recipient_count: "1",
};

function readErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function badgeColor(type: NotificationType) {
  if (type === "success") return "#34d399";
  if (type === "warning") return "#fbbf24";
  if (type === "critical") return "#f87171";
  return "#60a5fa";
}

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | NotificationType>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "sent" | "draft">("all");
  const [form, setForm] = useState<ComposeForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/admin/notifications?limit=200`);
      if (!res.ok) throw new Error("Failed to load notifications");
      const payload = (await res.json()) as NotificationItem[];
      setItems(Array.isArray(payload) ? payload : []);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load notifications."));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadItems();
    }, 0);
    return () => clearTimeout(t);
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (deliveryFilter === "sent" && !item.is_sent) return false;
      if (deliveryFilter === "draft" && item.is_sent) return false;

      if (!q) return true;
      const haystack = [item.title, item.message, item.target, item.target_value || "", item.type]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query, typeFilter, deliveryFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const sent = items.filter((n) => n.is_sent).length;
    const drafts = total - sent;
    const recipients = items.reduce((sum, n) => sum + (n.recipient_count || 0), 0);
    return { total, sent, drafts, recipients };
  }, [items]);

  const createNotification = async (sendNow: boolean) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!form.title.trim()) throw new Error("Title is required.");
      if (!form.message.trim()) throw new Error("Message is required.");
      if ((form.target === "specific" || form.target === "plan_tier") && !form.target_value.trim()) {
        throw new Error("Target value is required for selected target.");
      }

      const createRes = await fetch(`${API}/admin/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          message: form.message.trim(),
          type: form.type,
          target: form.target,
          target_value: form.target_value.trim() || null,
        }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => null);
        throw new Error(body?.detail || "Failed to create notification");
      }
      const created = (await createRes.json()) as NotificationItem;

      if (sendNow) {
        const recipientCount = Number(form.recipient_count);
        if (!Number.isFinite(recipientCount) || recipientCount <= 0) {
          throw new Error("Recipient count must be a positive number.");
        }
        const sendRes = await fetch(`${API}/admin/notifications/${created.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient_count: recipientCount }),
        });
        if (!sendRes.ok) {
          const body = await sendRes.json().catch(() => null);
          throw new Error(body?.detail || "Notification created but send failed");
        }
      }

      setNotice(sendNow ? "Notification sent." : "Notification draft created.");
      setForm(EMPTY_FORM);
      await loadItems();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to save notification."));
    } finally {
      setSaving(false);
    }
  };

  const sendExisting = async (item: NotificationItem) => {
    const rawCount = window.prompt("Recipient count", String(item.recipient_count || 1));
    if (rawCount == null) return;
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count <= 0) {
      setError("Recipient count must be a positive number.");
      return;
    }

    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API}/admin/notifications/${item.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_count: count }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to send notification");
      }
      setNotice("Notification sent.");
      await loadItems();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to send notification."));
    }
  };

  const deleteNotification = async (item: NotificationItem) => {
    const ok = window.confirm(`Delete "${item.title}"?`);
    if (!ok) return;

    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API}/admin/notifications/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to delete notification");
      }
      setNotice("Notification deleted.");
      await loadItems();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Failed to delete notification."));
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1450px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Notifications</h1>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
            Compose, target, send, and audit platform-wide client communications.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" style={secondaryBtn} onClick={() => void loadItems()}>
            <RefreshCcw size={12} /> Refresh
          </button>
          <Link href="/admin/dashboard" style={secondaryLinkBtn}>
            Back to Overview
          </Link>
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
          { label: "Total", value: stats.total, color: "var(--accent)" },
          { label: "Sent", value: stats.sent, color: "#34d399" },
          { label: "Drafts", value: stats.drafts, color: "#fbbf24" },
          { label: "Recipients Reached", value: stats.recipients, color: "#60a5fa" },
        ].map((card) => (
          <div key={card.label} style={{ ...kpiCard, boxShadow: `inset 0 -1px 0 ${card.color}45` }}>
            <div style={{ fontSize: "10px", color: "var(--text-subtle)", marginBottom: "6px" }}>{card.label}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "14px" }}>
        <section style={panelStyle}>
          <div style={panelHeader}>
            <Megaphone size={14} />
            Compose
          </div>
          <div style={{ padding: "12px" }}>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Notification title"
              style={{ ...inputStyle, marginBottom: "8px" }}
            />
            <textarea
              value={form.message}
              onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
              placeholder="Message body"
              style={{ ...inputStyle, minHeight: "90px", resize: "vertical", padding: "8px 10px", marginBottom: "8px" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
              <select
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as NotificationType }))}
                style={inputStyle}
              >
                <option value="info">info</option>
                <option value="success">success</option>
                <option value="warning">warning</option>
                <option value="critical">critical</option>
              </select>
              <select
                value={form.target}
                onChange={(e) => setForm((prev) => ({ ...prev, target: e.target.value as NotificationTarget }))}
                style={inputStyle}
              >
                <option value="all">all clients</option>
                <option value="plan_tier">plan tier</option>
                <option value="specific">specific workspaces</option>
              </select>
            </div>

            {(form.target === "plan_tier" || form.target === "specific") && (
              <input
                value={form.target_value}
                onChange={(e) => setForm((prev) => ({ ...prev, target_value: e.target.value }))}
                placeholder={form.target === "plan_tier" ? "trial,starter,pro" : "workspace-1,workspace-2"}
                style={{ ...inputStyle, marginBottom: "8px" }}
              />
            )}

            <input
              type="number"
              min={1}
              value={form.recipient_count}
              onChange={(e) => setForm((prev) => ({ ...prev, recipient_count: e.target.value.replace(/[^\d]/g, "") || "1" }))}
              placeholder="Recipient count for send operation"
              style={{ ...inputStyle, marginBottom: "12px" }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button type="button" style={secondaryBtn} disabled={saving} onClick={() => void createNotification(false)}>
                Save Draft
              </button>
              <button type="button" style={primaryBtn} disabled={saving} onClick={() => void createNotification(true)}>
                <Send size={12} />
                {saving ? "Sending..." : "Send Now"}
              </button>
            </div>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={panelHeader}>Notification Feed</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr", gap: "8px", padding: "10px 12px", borderBottom: "1px solid #1e1e2a" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, message, target..."
              style={inputStyle}
            />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | NotificationType)} style={inputStyle}>
              <option value="all">All types</option>
              <option value="info">info</option>
              <option value="success">success</option>
              <option value="warning">warning</option>
              <option value="critical">critical</option>
            </select>
            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value as "all" | "sent" | "draft")}
              style={inputStyle}
            >
              <option value="all">All delivery</option>
              <option value="sent">Sent</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div style={tableHeadStyle}>
            {["Message", "Type", "Target", "Delivery", "Created", "Actions"].map((h) => (
              <span key={h} style={thStyle}>
                {h}
              </span>
            ))}
          </div>

          {filteredItems.map((item) => (
            <div key={item.id} style={tableRowStyle}>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>{item.title}</span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.message}
                </span>
              </div>
              <span style={{ ...pillStyle, color: badgeColor(item.type), borderColor: `${badgeColor(item.type)}66` }}>
                {item.type}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {item.target}
                {item.target_value ? `: ${item.target_value}` : ""}
              </span>
              <span style={{ fontSize: "12px", color: item.is_sent ? "#34d399" : "#fbbf24" }}>
                {item.is_sent ? `Sent (${item.recipient_count})` : "Draft"}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {new Date(item.created_at).toLocaleDateString()}
              </span>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                {!item.is_sent && (
                  <button type="button" style={iconBtn} onClick={() => void sendExisting(item)} title="Send">
                    <Send size={13} />
                  </button>
                )}
                <button
                  type="button"
                  style={{ ...iconBtn, color: "#f87171" }}
                  onClick={() => void deleteNotification(item)}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          {!filteredItems.length && !loading && (
            <div style={{ padding: "14px", fontSize: "12px", color: "var(--text-muted)" }}>
              No notifications found for the current filter.
            </div>
          )}
        </section>
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
  gridTemplateColumns: "1.7fr 0.7fr 1fr 0.9fr 0.8fr 100px",
  gap: "8px",
  padding: "10px 12px",
  borderBottom: "1px solid #1a1a24",
  background: "var(--bg-panel)",
};

const tableRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.7fr 0.7fr 1fr 0.9fr 0.8fr 100px",
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

const secondaryLinkBtn: React.CSSProperties = {
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
