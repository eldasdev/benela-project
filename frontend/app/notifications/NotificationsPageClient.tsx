"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  RefreshCcw,
  ShieldAlert,
  Info,
  AlertTriangle,
  CircleCheck,
} from "lucide-react";

import Sidebar from "@/components/Sidebar";
import { getSupabase } from "@/lib/supabase";
import { getClientWorkspaceId } from "@/lib/client-settings";
import {
  markNotificationsAsRead,
  readSeenNotificationIds,
  writeSeenNotificationIds,
} from "@/lib/notifications";
import { Section } from "@/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type NotificationType = "info" | "warning" | "success" | "critical";

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: NotificationType;
  target: string;
  target_value?: string | null;
  sent_at?: string | null;
  created_at: string;
};

type Filter = "all" | "unread" | NotificationType;

const TYPE_META: Record<
  NotificationType,
  { label: string; color: string; bg: string; Icon: typeof Info }
> = {
  info: { label: "Info", color: "#60a5fa", bg: "rgba(96,165,250,0.14)", Icon: Info },
  warning: {
    label: "Warning",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.14)",
    Icon: AlertTriangle,
  },
  success: {
    label: "Success",
    color: "#34d399",
    bg: "rgba(52,211,153,0.14)",
    Icon: CircleCheck,
  },
  critical: {
    label: "Critical",
    color: "#f87171",
    bg: "rgba(248,113,113,0.14)",
    Icon: ShieldAlert,
  },
};

export default function NotificationsPage() {
  const router = useRouter();

  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [seenIds, setSeenIds] = useState<number[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const loadNotifications = useCallback(async () => {
    const workspaceId = getClientWorkspaceId();
    const res = await fetch(
      `${API}/notifications?workspace_id=${encodeURIComponent(workspaceId)}&limit=100`
    );
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.detail || "Failed to load notifications.");
    }
    const data = (await res.json()) as NotificationItem[];
    setItems(data);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data } = await getSupabase().auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }

      setAuthed(true);
      const seen = readSeenNotificationIds();
      setSeenIds(Array.from(seen));

      try {
        await loadNotifications();
        setError("");
      } catch (e) {
        setError(readErrorMessage(e, "Unable to load notifications."));
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [loadNotifications, router]);

  const unreadCount = useMemo(() => {
    const seen = new Set(seenIds);
    return items.filter((item) => !seen.has(item.id)).length;
  }, [items, seenIds]);

  const filteredItems = useMemo(() => {
    const seen = new Set(seenIds);
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((item) => !seen.has(item.id));
    return items.filter((item) => item.type === filter);
  }, [items, seenIds, filter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadNotifications();
      setError("");
    } catch (e) {
      setError(readErrorMessage(e, "Unable to refresh notifications."));
    } finally {
      setRefreshing(false);
    }
  };

  const markOneRead = (id: number) => {
    const next = new Set(seenIds);
    next.add(id);
    setSeenIds(Array.from(next));
    writeSeenNotificationIds(next);
  };

  const markAllRead = () => {
    const ids = items.map((item) => item.id);
    markNotificationsAsRead(ids);
    setSeenIds(Array.from(readSeenNotificationIds()));
  };

  const handleSectionChange = (section: Section) => {
    if (section === "settings") {
      router.push("/settings");
      return;
    }
    const target =
      section === "dashboard" ? "/dashboard" : `/dashboard?section=${encodeURIComponent(section)}`;
    router.push(target);
  };

  const handleLogout = async () => {
    await getSupabase().auth.signOut();
    router.push("/login");
  };

  if (!authed || loading) {
    return (
      <div style={centerStyle}>
        <div style={spinnerStyle} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-canvas)" }}>
      <Sidebar onSectionChange={handleSectionChange} onLogout={handleLogout} />

      <main style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px" }}>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "14px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                Notifications
              </h1>
              <p style={{ marginTop: "4px", fontSize: "12px", color: "var(--text-subtle)" }}>
                Platform announcements, security alerts, and operational updates.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button onClick={handleRefresh} style={secondaryBtn} disabled={refreshing}>
                <RefreshCcw size={13} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button onClick={markAllRead} style={primaryBtn} disabled={items.length === 0}>
                <CheckCheck size={13} />
                Mark All Read
              </button>
            </div>
          </header>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginBottom: "14px" }}>
            <StatCard label="Total" value={String(items.length)} />
            <StatCard label="Unread" value={String(unreadCount)} />
            <StatCard
              label="Critical"
              value={String(items.filter((item) => item.type === "critical").length)}
            />
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
            {(["all", "unread", "critical", "warning", "success", "info"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                style={{
                  padding: "7px 12px",
                  borderRadius: "9px",
                  border: filter === value ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                  background: filter === value ? "var(--accent-soft)" : "var(--bg-surface)",
                  color: filter === value ? "var(--text-primary)" : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                  textTransform: value === "all" ? "none" : "capitalize",
                }}
              >
                {value}
              </button>
            ))}
          </div>

          {error ? (
            <div style={errorStyle}>{error}</div>
          ) : null}

          <section
            style={{
              border: "1px solid var(--border-default)",
              borderRadius: "14px",
              background: "var(--bg-surface)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 14px",
                borderBottom: "1px solid var(--border-default)",
              }}
            >
              <Bell size={14} color="var(--accent)" />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                Notification Feed
              </span>
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-subtle)", fontSize: "13px" }}>
                No notifications for the selected filter.
              </div>
            ) : (
              <div>
                {filteredItems.map((item, index) => {
                  const meta = TYPE_META[item.type] ?? TYPE_META.info;
                  const isUnread = !seenIds.includes(item.id);
                  const Icon = meta.Icon;

                  return (
                    <button
                      key={item.id}
                      onClick={() => markOneRead(item.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        borderBottom:
                          index === filteredItems.length - 1
                            ? "none"
                            : "1px solid var(--border-default)",
                        background: isUnread ? "var(--bg-elevated)" : "transparent",
                        cursor: "pointer",
                        padding: "14px 16px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "8px",
                          background: meta.bg,
                          color: meta.color,
                          border: `1px solid ${meta.color}44`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: "1px",
                        }}
                      >
                        <Icon size={14} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            marginBottom: "5px",
                          }}
                        >
                          <p
                            style={{
                              fontSize: "14px",
                              fontWeight: isUnread ? 700 : 600,
                              color: "var(--text-primary)",
                              margin: 0,
                              lineHeight: 1.35,
                            }}
                          >
                            {item.title}
                          </p>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                            <span
                              style={{
                                fontSize: "10px",
                                color: meta.color,
                                background: meta.bg,
                                borderRadius: "999px",
                                padding: "2px 8px",
                                border: `1px solid ${meta.color}44`,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                fontWeight: 700,
                              }}
                            >
                              {meta.label}
                            </span>
                            {isUnread ? (
                              <span
                                style={{
                                  width: "7px",
                                  height: "7px",
                                  borderRadius: "50%",
                                  background: "var(--accent)",
                                }}
                              />
                            ) : (
                              <CheckCircle2 size={13} color="var(--text-subtle)" />
                            )}
                          </div>
                        </div>

                        <p
                          style={{
                            fontSize: "13px",
                            color: "var(--text-muted)",
                            margin: 0,
                            lineHeight: 1.55,
                          }}
                        >
                          {item.message}
                        </p>

                        <p
                          style={{
                            marginTop: "8px",
                            fontSize: "11px",
                            color: "var(--text-subtle)",
                          }}
                        >
                          Sent {formatDateTime(item.sent_at || item.created_at)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        background: "var(--bg-surface)",
        padding: "12px 14px",
      }}
    >
      <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginBottom: "7px" }}>{label}</p>
      <p style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{value}</p>
    </div>
  );
}

function formatDateTime(raw: string): string {
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return raw;
  }
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const centerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "var(--bg-canvas)",
};

const spinnerStyle: React.CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  border: "2px solid var(--border-default)",
  borderTopColor: "var(--accent)",
  animation: "spin 0.8s linear infinite",
};

const primaryBtn: React.CSSProperties = {
  height: "34px",
  padding: "0 12px",
  borderRadius: "9px",
  border: "1px solid var(--accent)",
  background: "var(--accent-soft)",
  color: "var(--text-primary)",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  height: "34px",
  padding: "0 12px",
  borderRadius: "9px",
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
  color: "var(--text-muted)",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  marginBottom: "14px",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(248,113,113,0.25)",
  background: "rgba(248,113,113,0.08)",
  color: "#f87171",
  fontSize: "12px",
};
