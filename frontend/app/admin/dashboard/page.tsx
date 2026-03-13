"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  CreditCard,
  Clock3,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `/api` : "http://localhost:8000");

type Summary = {
  total_clients: number;
  active_clients: number;
  suspended: number;
  monthly_recurring_revenue: number;
  paid_this_month: number;
  trials_active: number;
  plan_breakdown: Record<string, number>;
};

type RevenuePoint = { month: string; revenue: number };

type ActivityItem = {
  id: number;
  client_id: number;
  action: string;
  actor: string | null;
  created_at: string;
};

type ClientRow = {
  client: {
    id: number;
    name: string;
    slug: string;
    owner_name: string;
    owner_email: string;
    is_active: boolean;
    is_suspended: boolean;
    created_at: string;
  };
  subscription: {
    id: number;
    plan_tier: string;
    status: string;
    price_monthly: number;
  } | null;
};

const PLAN_COLORS: Record<string, string> = {
  trial: "#fbbf24",
  starter: "#60a5fa",
  pro: "var(--accent)",
  enterprise: "#f59e0b",
};

function formatMRR(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n}`;
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenueChart, setRevenueChart] = useState<RevenuePoint[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/admin/summary`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API}/admin/analytics/revenue`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/admin/activity?limit=15`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/admin/clients`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([s, rev, act, cl]) => {
      setSummary(s || null);
      setRevenueChart(Array.isArray(rev) ? rev : []);
      setActivity(Array.isArray(act) ? act : []);
      setClients(Array.isArray(cl) ? cl.slice(0, 10) : []);
    });
  }, []);

  const maxRevenue = revenueChart.length ? Math.max(...revenueChart.map((d) => d.revenue), 1) : 1;
  const activeRatio = summary?.total_clients
    ? Math.round((summary.active_clients / summary.total_clients) * 100)
    : 0;
  const paidCoverage = summary?.monthly_recurring_revenue
    ? Math.round((summary.paid_this_month / summary.monthly_recurring_revenue) * 100)
    : 0;
  const trialCount = summary?.plan_breakdown?.trial ?? 0;

  const kpiCards = summary
    ? [
        {
          label: "MRR",
          value: formatMRR(summary.monthly_recurring_revenue),
          sub: "Recurring monthly revenue",
          up: summary.monthly_recurring_revenue > 0,
          color: "#34d399",
        },
        {
          label: "Total Clients",
          value: String(summary.total_clients),
          sub: `${summary.active_clients} active`,
          up: summary.active_clients >= summary.suspended,
          color: "#60a5fa",
        },
        {
          label: "Active",
          value: String(summary.active_clients),
          sub: `${activeRatio}% of all clients`,
          up: activeRatio >= 80,
          color: "var(--accent)",
        },
        {
          label: "Trials",
          value: String(summary.trials_active),
          sub: `${trialCount} trial orgs`,
          up: summary.trials_active > 0,
          color: "#fbbf24",
        },
        {
          label: "Paid This Month",
          value: formatMRR(summary.paid_this_month),
          sub: `${paidCoverage}% of MRR`,
          up: paidCoverage >= 100,
          color: "#34d399",
        },
        {
          label: "Suspended",
          value: String(summary.suspended),
          sub: summary.suspended === 0 ? "All clear" : "Needs review",
          up: summary.suspended === 0,
          color: "#f87171",
        },
      ]
    : [];

  const panelBorder = "1px solid color-mix(in srgb, var(--border-default) 84%, transparent)";
  const rowBorder = "1px solid color-mix(in srgb, var(--border-default) 74%, transparent)";
  const panelBg =
    "linear-gradient(142deg, color-mix(in srgb, var(--bg-surface) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-surface) 94%, transparent))";
  const subtleBg =
    "linear-gradient(142deg, color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%), color-mix(in srgb, var(--bg-panel) 94%, transparent))";
  const chartPlotHeight = 160;

  return (
    <div
      className="admin-page-shell"
      style={{
        maxWidth: "1400px",
        margin: "0 auto",
        display: "grid",
        alignContent: "start",
        gap: "24px",
      }}
    >
      <div
        style={{
          padding: "16px 18px",
          borderRadius: "14px",
          border: panelBorder,
          background: panelBg,
          boxShadow: "0 20px 38px rgba(5, 10, 24, 0.16)",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Overview
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
            Platform KPIs and recent activity
          </p>
        </div>
        <Link
          href="/admin/marketplace"
          style={{
            whiteSpace: "nowrap",
            fontSize: "12px",
            color: "var(--accent)",
            border: "1px solid color-mix(in srgb, var(--accent) 34%, var(--border-default) 66%)",
            background: "linear-gradient(132deg, color-mix(in srgb, var(--accent-soft) 80%, transparent), color-mix(in srgb, var(--accent-soft) 52%, transparent))",
            borderRadius: "10px",
            padding: "9px 13px",
            textDecoration: "none",
            fontWeight: 600,
            boxShadow: "0 10px 22px rgba(5, 10, 24, 0.2)",
          }}
        >
          Open Marketplace Manager
        </Link>
      </div>

      {/* KPI Row */}
      <div
        className="admin-overview-kpis"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "12px",
        }}
      >
        {kpiCards.map((card) => (
          <div
            key={card.label}
            style={{
              background: panelBg,
              border: panelBorder,
              borderRadius: "12px",
              padding: "16px 18px",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 14px 34px rgba(5, 10, 24, 0.12)",
            }}
          >
            <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginBottom: "8px", fontWeight: 500 }}>
              {card.label}
            </p>
            <p style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
              {card.value}
            </p>
            {card.sub && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "6px" }}>
                {card.up ? (
                  <TrendingUp size={11} color="#34d399" />
                ) : (
                  <TrendingDown size={11} color="#f87171" />
                )}
                <span style={{ fontSize: "11px", color: card.up ? "#34d399" : "#f87171" }}>
                  {card.sub}
                </span>
              </div>
            )}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "2px",
                background: `linear-gradient(90deg, transparent, ${card.color}50, transparent)`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Plan breakdown */}
      {summary?.plan_breakdown && (
        <div
          className="admin-overview-plans"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
          }}
        >
          {(["trial", "starter", "pro", "enterprise"] as const).map((tier) => (
            <div
              key={tier}
              style={{
                background: panelBg,
                border: panelBorder,
                borderLeft: `3px solid ${PLAN_COLORS[tier] || "var(--text-subtle)"}`,
                borderRadius: "8px",
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "capitalize" }}>
                {tier}
              </span>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                {summary.plan_breakdown[tier] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Two-column: Revenue chart + Activity */}
      <div
        className="admin-overview-split"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 1fr)",
          gap: "24px",
        }}
      >
        <div
          style={{
            minWidth: 0,
            background: panelBg,
            border: panelBorder,
            borderRadius: "14px",
            padding: "20px",
            boxShadow: "0 16px 34px rgba(5, 10, 24, 0.12)",
          }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
            Monthly Revenue
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(revenueChart.length, 1)}, minmax(0, 1fr))`,
              gap: "8px",
              minHeight: "220px",
              alignItems: "end",
            }}
          >
            {revenueChart.map((d) => (
              <div
                key={d.month}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--text-subtle)",
                    minHeight: "14px",
                    lineHeight: 1.2,
                    marginBottom: "6px",
                  }}
                >
                  ${(d.revenue / 1000).toFixed(1)}k
                </span>
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: "36px",
                    height: `${chartPlotHeight}px`,
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: "1px",
                      background: "color-mix(in srgb, var(--border-default) 70%, transparent)",
                    }}
                  />
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "32px",
                      height: `${Math.max(4, Math.round((d.revenue / maxRevenue) * chartPlotHeight))}px`,
                      minHeight: "4px",
                      background: "linear-gradient(180deg, var(--accent), var(--accent-2))",
                      borderRadius: "4px 4px 0 0",
                      transition: "opacity 0.15s",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--text-quiet)",
                    lineHeight: 1.25,
                    minHeight: "28px",
                    textAlign: "center",
                  }}
                >
                  {d.month}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            minWidth: 0,
            background: panelBg,
            border: panelBorder,
            borderRadius: "14px",
            padding: "20px",
            boxShadow: "0 16px 34px rgba(5, 10, 24, 0.12)",
          }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>
            Recent Activity
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {activity.slice(0, 8).map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  background: subtleBg,
                  border: rowBorder,
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: "color-mix(in srgb, var(--accent-soft) 82%, transparent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <CreditCard size={12} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>{item.action}</p>
                  <p style={{ fontSize: "10px", color: "var(--text-subtle)", marginTop: "2px" }}>
                    Client #{item.client_id} · {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/admin/analytics"
            style={{
              display: "block",
              marginTop: "12px",
              fontSize: "12px",
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            Open full analytics →
          </Link>
        </div>
      </div>

      {/* Recent clients table */}
      <div
        style={{
          background: panelBg,
          border: panelBorder,
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 18px 34px rgba(5, 10, 24, 0.12)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: rowBorder,
          }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Recent Clients
          </h2>
          <Link
            href="/admin/clients"
            style={{
              fontSize: "12px",
              color: "var(--accent)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            View all →
          </Link>
        </div>
        <div
          style={{
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            style={{
              minWidth: "930px",
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.9fr 100px",
              padding: "10px 20px",
              background: subtleBg,
              borderBottom: rowBorder,
            }}
          >
            {["Company", "Owner", "Plan", "Status", "MRR", "Joined", ""].map((h) => (
              <span
                key={h}
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "var(--text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {h}
              </span>
            ))}
          </div>
          {clients.map((row) => (
            <div
              key={row.client.id}
              style={{
                minWidth: "930px",
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.9fr 100px",
                padding: "12px 20px",
                borderBottom: rowBorder,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                {row.client.name}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.client.owner_name}</span>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: `${PLAN_COLORS[row.subscription?.plan_tier || "trial"] || "var(--text-subtle)"}18`,
                  color: PLAN_COLORS[row.subscription?.plan_tier || "trial"] || "var(--text-muted)",
                  width: "fit-content",
                }}
              >
                {(row.subscription?.plan_tier || "—").toUpperCase()}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: row.client.is_suspended ? "#f8717118" : "#34d39918",
                  color: row.client.is_suspended ? "#f87171" : "#34d399",
                  width: "fit-content",
                }}
              >
                {row.client.is_suspended ? "Suspended" : "Active"}
              </span>
              <span style={{ fontSize: "12px", color: "#34d399" }}>
                {row.subscription ? `$${row.subscription.price_monthly}/mo` : "—"}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {row.client.created_at
                  ? new Date(row.client.created_at).toLocaleDateString()
                  : "—"}
              </span>
              <Link
                href={`/admin/clients/${row.client.id}`}
                style={{
                  fontSize: "12px",
                  padding: "6px 10px",
                  borderRadius: "8px",
                  background: "color-mix(in srgb, var(--accent-soft) 80%, transparent)",
                  color: "var(--accent)",
                  textDecoration: "none",
                  border: "1px solid color-mix(in srgb, var(--accent) 26%, transparent)",
                  width: "fit-content",
                }}
              >
                View
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "14px",
        }}
      >
        <div
          style={{
            background: panelBg,
            border: panelBorder,
            borderRadius: "14px",
            padding: "16px",
            boxShadow: "0 14px 28px rgba(5, 10, 24, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <ShieldAlert size={14} color="var(--accent)" />
            <h3 style={{ margin: 0, fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>Risk Watch</h3>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
            Suspended clients: <strong style={{ color: "var(--text-primary)" }}>{summary?.suspended ?? 0}</strong>
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
            Active trial organizations:{" "}
            <strong style={{ color: "var(--text-primary)" }}>{summary?.trials_active ?? 0}</strong>
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
            Paid coverage: <strong style={{ color: "var(--text-primary)" }}>{paidCoverage || 0}%</strong> of MRR.
          </p>
        </div>

        <div
          style={{
            background: panelBg,
            border: panelBorder,
            borderRadius: "14px",
            padding: "16px",
            boxShadow: "0 14px 28px rgba(5, 10, 24, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <Sparkles size={14} color="var(--accent)" />
            <h3 style={{ margin: 0, fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>Plan Mix</h3>
          </div>
          {(["trial", "starter", "pro", "enterprise"] as const).map((tier) => (
            <div
              key={tier}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "7px 0",
                borderBottom: "1px dashed color-mix(in srgb, var(--border-default) 70%, transparent)",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "capitalize" }}>{tier}</span>
              <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>
                {summary?.plan_breakdown?.[tier] ?? 0}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            background: panelBg,
            border: panelBorder,
            borderRadius: "14px",
            padding: "16px",
            boxShadow: "0 14px 28px rgba(5, 10, 24, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <Clock3 size={14} color="var(--accent)" />
            <h3 style={{ margin: 0, fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>Action Queue</h3>
          </div>
          {activity.slice(0, 4).map((item) => (
            <div
              key={`queue-${item.id}`}
              style={{
                padding: "8px 0",
                borderBottom: "1px dashed color-mix(in srgb, var(--border-default) 70%, transparent)",
              }}
            >
              <p style={{ margin: 0, fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.5 }}>{item.action}</p>
              <p style={{ margin: "3px 0 0", fontSize: "10px", color: "var(--text-subtle)" }}>
                {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
          ))}
          {!activity.length ? (
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>No pending actions.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
