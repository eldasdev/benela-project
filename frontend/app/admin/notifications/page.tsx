"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyPlus, Megaphone, RefreshCcw, Send, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { type AdminWorkspaceRow } from "@/lib/admin-client-workspaces";
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

type ComposeState = {
  title: string;
  message: string;
  type: NotificationType;
  target: NotificationTarget;
  plan_tier: string;
  selected_workspaces: string[];
};

const EMPTY_FORM: ComposeState = {
  title: "",
  message: "",
  type: "info",
  target: "all",
  plan_tier: "starter",
  selected_workspaces: [],
};

function tone(type: NotificationType): "accent" | "success" | "warning" | "danger" | "neutral" {
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

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspaceRow[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [form, setForm] = useState<ComposeState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedItem, setSelectedItem] = useState<NotificationItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [notificationsRes, workspacesRes] = await Promise.all([
        authFetch(`${API}/admin/notifications?limit=200`),
        authFetch(`${API}/admin/client-workspaces?limit=300`),
      ]);
      if (!notificationsRes.ok || !workspacesRes.ok) throw new Error("Failed to load notification data");
      setItems((await notificationsRes.json()) as NotificationItem[]);
      setWorkspaces((await workspacesRes.json()) as AdminWorkspaceRow[]);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load notification operations."));
      setItems([]);
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (deliveryFilter === "sent" && !item.is_sent) return false;
      if (deliveryFilter === "draft" && item.is_sent) return false;
      if (!needle) return true;
      const haystack = [item.title, item.message, item.type, item.target, item.target_value || ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [deliveryFilter, items, query, typeFilter]);

  const audiencePreview = useMemo(() => {
    if (form.target === "all") return workspaces;
    if (form.target === "plan_tier") {
      return workspaces.filter((workspace) => workspace.plan_tier === form.plan_tier);
    }
    return workspaces.filter((workspace) => form.selected_workspaces.includes(workspace.workspace_id));
  }, [form.plan_tier, form.selected_workspaces, form.target, workspaces]);

  const stats = useMemo(() => {
    const total = items.length;
    const sent = items.filter((item) => item.is_sent).length;
    const drafts = total - sent;
    const recipients = items.reduce((sum, item) => sum + (item.recipient_count || 0), 0);
    return { total, sent, drafts, recipients };
  }, [items]);

  const createNotification = async (sendNow: boolean) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!form.title.trim()) throw new Error("Title is required.");
      if (!form.message.trim()) throw new Error("Message is required.");
      if (form.target === "specific" && !form.selected_workspaces.length) {
        throw new Error("Choose at least one target workspace.");
      }
      const targetValue = form.target === "specific"
        ? form.selected_workspaces.join(",")
        : form.target === "plan_tier"
          ? form.plan_tier
          : null;

      const createRes = await authFetch(`${API}/admin/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          message: form.message.trim(),
          type: form.type,
          target: form.target,
          target_value: targetValue,
        }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => null);
        throw new Error(body?.detail || "Failed to create notification");
      }
      const created = (await createRes.json()) as NotificationItem;

      if (sendNow) {
        const sendRes = await authFetch(`${API}/admin/notifications/${created.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!sendRes.ok) {
          const body = await sendRes.json().catch(() => null);
          throw new Error(body?.detail || "Notification created, but send failed");
        }
      }

      setForm(EMPTY_FORM);
      setNotice(sendNow ? "Notification sent." : "Draft created.");
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not save notification."));
    } finally {
      setSaving(false);
    }
  };

  const sendExisting = async (item: NotificationItem) => {
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`${API}/admin/notifications/${item.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to send notification");
      }
      setNotice(`Notification sent to ${item.recipient_count || 0} recipients.`);
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not send notification."));
    }
  };

  const deleteNotification = async (item: NotificationItem) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`${API}/admin/notifications/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to delete notification");
      }
      setNotice("Notification deleted.");
      if (selectedItem?.id === item.id) setSelectedItem(null);
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not delete notification."));
    }
  };

  const duplicateIntoComposer = (item: NotificationItem) => {
    setForm({
      title: item.title,
      message: item.message,
      type: item.type,
      target: item.target,
      plan_tier: item.target === "plan_tier" ? item.target_value || "starter" : "starter",
      selected_workspaces: item.target === "specific"
        ? (item.target_value || "").split(",").map((value) => value.trim()).filter(Boolean)
        : [],
    });
  };

  const toggleWorkspace = (workspaceId: string) => {
    setForm((prev) => ({
      ...prev,
      selected_workspaces: prev.selected_workspaces.includes(workspaceId)
        ? prev.selected_workspaces.filter((value) => value !== workspaceId)
        : [...prev.selected_workspaces, workspaceId],
    }));
  };

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1540px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <AdminPageHero
        eyebrow="Outbound Communications"
        title="Notifications"
        subtitle="Compose, preview, send, and audit platform-wide messages without hand-entering recipient counts or guessing the audience."
        actions={<button type="button" style={adminButtonStyle("secondary")} onClick={() => void loadData()}><RefreshCcw size={16} /> Refresh</button>}
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
        <AdminMetricCard label="Total messages" value={stats.total} detail="Draft and sent communications" tone="accent" />
        <AdminMetricCard label="Sent" value={stats.sent} detail="Completed outbound notifications" tone="success" />
        <AdminMetricCard label="Drafts" value={stats.drafts} detail="Pending approval or send" tone="warning" />
        <AdminMetricCard label="Recipients reached" value={stats.recipients} detail="Computed from real workspace targeting" tone="accent" />
      </AdminMetricGrid>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.4fr", gap: "18px", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "18px" }}>
          <AdminSectionCard title="Compose" description="Create a new message and preview the real audience before sending it.">
            <div style={{ display: "grid", gap: "12px" }}>
              <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Notification title" style={adminInputStyle()} />
              <textarea value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} placeholder="Message body" style={adminInputStyle({ minHeight: "120px", padding: "12px 14px", resize: "vertical" })} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <select value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as NotificationType }))} style={adminInputStyle()}>
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
                <select value={form.target} onChange={(event) => setForm((prev) => ({ ...prev, target: event.target.value as NotificationTarget, selected_workspaces: [], plan_tier: "starter" }))} style={adminInputStyle()}>
                  <option value="all">All workspaces</option>
                  <option value="plan_tier">Plan tier</option>
                  <option value="specific">Specific workspaces</option>
                </select>
              </div>

              {form.target === "plan_tier" ? (
                <select value={form.plan_tier} onChange={(event) => setForm((prev) => ({ ...prev, plan_tier: event.target.value }))} style={adminInputStyle()}>
                  <option value="trial">Trial</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              ) : null}

              {form.target === "specific" ? (
                <div className="admin-ui-surface" style={{ padding: "12px", display: "grid", gap: "10px", maxHeight: "220px", overflow: "auto" }}>
                  {workspaces.map((workspace) => (
                    <label key={workspace.workspace_id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "10px", alignItems: "center" }}>
                      <input type="checkbox" checked={form.selected_workspaces.includes(workspace.workspace_id)} onChange={() => toggleWorkspace(workspace.workspace_id)} />
                      <span style={{ color: "var(--text-primary)", fontSize: "13px" }}>{workspace.business_name}</span>
                      <AdminPill label={workspace.plan_tier} tone={workspace.plan_tier === "pro" ? "accent" : workspace.plan_tier === "enterprise" ? "warning" : workspace.plan_tier === "trial" ? "warning" : "neutral"} />
                    </label>
                  ))}
                </div>
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                <button type="button" style={adminButtonStyle("secondary")} onClick={() => void createNotification(false)} disabled={saving}>
                  {saving ? "Saving..." : "Save draft"}
                </button>
                <button type="button" style={adminButtonStyle("primary")} onClick={() => void createNotification(true)} disabled={saving}>
                  <Send size={16} /> {saving ? "Sending..." : "Send now"}
                </button>
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Audience preview" description="This preview is computed from real workspace records before the send request is issued.">
            <div style={{ display: "grid", gap: "12px" }}>
              <div className="admin-ui-surface" style={{ padding: "14px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Expected recipients</div>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", marginTop: "6px" }}>{audiencePreview.length}</div>
                </div>
                <Megaphone size={18} color="var(--accent)" />
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {audiencePreview.slice(0, 6).map((workspace) => (
                  <div key={workspace.workspace_id} className="admin-ui-surface" style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{workspace.business_name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{workspace.workspace_id}</div>
                    </div>
                    <AdminPill label={workspace.plan_tier} tone={workspace.plan_tier === "pro" ? "accent" : workspace.plan_tier === "enterprise" ? "warning" : workspace.plan_tier === "trial" ? "warning" : "neutral"} />
                  </div>
                ))}
                {!audiencePreview.length ? <AdminEmptyState title="No recipients" description="Adjust the target mode or pick one or more specific workspaces." /> : null}
              </div>
            </div>
          </AdminSectionCard>
        </div>

        <AdminSectionCard title="Notification feed" description="Review sent and draft notifications, then resend, duplicate, or remove them from the outbound queue.">
          <AdminFilterBar>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, message, target..." style={adminInputStyle({ flex: 1.8, minWidth: "240px" })} />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} style={adminInputStyle({ flex: 1, minWidth: "150px" })}>
              <option value="all">All types</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <select value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value)} style={adminInputStyle({ flex: 1, minWidth: "150px" })}>
              <option value="all">All delivery</option>
              <option value="sent">Sent</option>
              <option value="draft">Drafts</option>
            </select>
          </AdminFilterBar>

          {filteredItems.length ? (
            <AdminDataTable>
              <AdminTableHead columns={[
                <span key="message">Message</span>,
                <span key="type">Type</span>,
                <span key="target">Target</span>,
                <span key="delivery">Delivery</span>,
                <span key="created">Created</span>,
                <span key="actions">Actions</span>,
              ]} />
              {filteredItems.map((item) => (
                <AdminTableRow key={item.id} style={{ gridTemplateColumns: "1.6fr 0.8fr 0.95fr 0.95fr 0.85fr 1fr" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      style={{ background: "none", border: 0, padding: 0, margin: 0, textAlign: "left", cursor: "pointer", color: "var(--text-primary)", fontWeight: 700, fontSize: "15px" }}
                    >
                      {item.title}
                    </button>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.55 }}>
                      {item.message.length > 120 ? `${item.message.slice(0, 120)}…` : item.message}
                    </div>
                  </div>
                  <AdminPill label={item.type} tone={tone(item.type)} />
                  <div style={{ display: "grid", gap: "6px" }}>
                    <AdminPill label={item.target.replaceAll("_", " ")} tone="neutral" />
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{item.target_value || "All workspaces"}</span>
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <AdminPill label={item.is_sent ? "Sent" : "Draft"} tone={item.is_sent ? "success" : "warning"} />
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{item.recipient_count} recipients</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{formatDateTime(item.created_at)}</div>
                  <AdminActionMenu>
                    {!item.is_sent ? <button type="button" style={adminButtonStyle("primary", { minHeight: "36px", padding: "0 10px" })} onClick={() => void sendExisting(item)}><Send size={14} /> Send</button> : null}
                    <button type="button" style={adminButtonStyle("secondary", { minHeight: "36px", padding: "0 10px" })} onClick={() => duplicateIntoComposer(item)}><CopyPlus size={14} /> Duplicate</button>
                    <button type="button" style={adminButtonStyle("danger", { minHeight: "36px", padding: "0 10px" })} onClick={() => void deleteNotification(item)}><Trash2 size={14} /> Delete</button>
                  </AdminActionMenu>
                </AdminTableRow>
              ))}
            </AdminDataTable>
          ) : (
            <AdminEmptyState title={loading ? "Loading notifications..." : "No notifications match these filters"} description="Create a draft or widen the filter scope to inspect more outbound communications." />
          )}
        </AdminSectionCard>
      </div>

      <AdminDrawer
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.title || "Notification detail"}
        description={selectedItem ? `${selectedItem.target.replaceAll("_", " ")} · ${selectedItem.recipient_count} recipients` : undefined}
        width={560}
      >
        {selectedItem ? (
          <div style={{ display: "grid", gap: "16px" }}>
            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <AdminPill label={selectedItem.type} tone={tone(selectedItem.type)} />
                <AdminPill label={selectedItem.is_sent ? "Sent" : "Draft"} tone={selectedItem.is_sent ? "success" : "warning"} />
              </div>
              <div style={{ fontSize: "13px", lineHeight: 1.65, color: "var(--text-primary)" }}>{selectedItem.message}</div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Created {formatDateTime(selectedItem.created_at)}</div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Sent {formatDateTime(selectedItem.sent_at)}</div>
            </div>
            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Audience configuration</div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Target mode: {selectedItem.target}</div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Target value: {selectedItem.target_value || "All workspaces"}</div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Recipients reached: {selectedItem.recipient_count}</div>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {!selectedItem.is_sent ? <button type="button" style={adminButtonStyle("primary")} onClick={() => void sendExisting(selectedItem)}><Send size={16} /> Send now</button> : null}
              <button type="button" style={adminButtonStyle("secondary")} onClick={() => duplicateIntoComposer(selectedItem)}><CopyPlus size={16} /> Duplicate into composer</button>
              <button type="button" style={adminButtonStyle("danger")} onClick={() => void deleteNotification(selectedItem)}><Trash2 size={16} /> Delete</button>
            </div>
          </div>
        ) : null}
      </AdminDrawer>
    </div>
  );
}
