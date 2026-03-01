"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  CreditCard,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  pro: "#7c6aff",
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

  const kpiCards = summary
    ? [
        {
          label: "MRR",
          value: formatMRR(summary.monthly_recurring_revenue),
          sub: "+8%",
          up: true,
          color: "#34d399",
        },
        {
          label: "Total Clients",
          value: String(summary.total_clients),
          sub: "+3",
          up: true,
          color: "#60a5fa",
        },
        {
          label: "Active",
          value: String(summary.active_clients),
          sub: `${summary.total_clients ? Math.round((summary.active_clients / summary.total_clients) * 100) : 0}%`,
          up: true,
          color: "#7c6aff",
        },
        {
          label: "Trials",
          value: String(summary.trials_active),
          sub: "→ 3 pro",
          up: true,
          color: "#fbbf24",
        },
        {
          label: "Paid This Month",
          value: formatMRR(summary.paid_this_month),
          sub: "",
          up: true,
          color: "#34d399",
        },
        {
          label: "Suspended",
          value: String(summary.suspended),
          sub: "⚠",
          up: false,
          color: "#f87171",
        },
      ]
    : [];

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f0f0f5", margin: 0 }}>
          Overview
        </h1>
        <p style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
          Platform KPIs and recent activity
        </p>
      </div>

      {/* KPI Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        {kpiCards.map((card) => (
          <div
            key={card.label}
            style={{
              background: "#0e0e14",
              border: "1px solid #1e1e2a",
              borderRadius: "12px",
              padding: "16px 18px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <p style={{ fontSize: "11px", color: "#555", marginBottom: "8px", fontWeight: 500 }}>
              {card.label}
            </p>
            <p style={{ fontSize: "22px", fontWeight: 700, color: "#f0f0f5", lineHeight: 1 }}>
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
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "10px",
            marginBottom: "24px",
          }}
        >
          {(["trial", "starter", "pro", "enterprise"] as const).map((tier) => (
            <div
              key={tier}
              style={{
                background: "#0e0e14",
                border: "1px solid #1e1e2a",
                borderLeft: `3px solid ${PLAN_COLORS[tier] || "#555"}`,
                borderRadius: "8px",
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: "11px", color: "#666", textTransform: "capitalize" }}>
                {tier}
              </span>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "#f0f0f5" }}>
                {summary.plan_breakdown[tier] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Two-column: Revenue chart + Activity */}
      <div style={{ display: "flex", gap: "24px", marginBottom: "24px" }}>
        <div
          style={{
            flex: "0 0 60%",
            background: "#0e0e14",
            border: "1px solid #1e1e2a",
            borderRadius: "14px",
            padding: "20px",
          }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0", marginBottom: "16px" }}>
            Monthly Revenue
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "8px",
              justifyContent: "space-between",
              height: "180px",
            }}
          >
            {revenueChart.map((d) => (
              <div
                key={d.month}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  flex: 1,
                }}
              >
                <span style={{ fontSize: "10px", color: "#555" }}>
                  ${(d.revenue / 1000).toFixed(1)}k
                </span>
                <div
                  style={{
                    width: "100%",
                    maxWidth: "32px",
                    height: `${(d.revenue / maxRevenue) * 160}px`,
                    minHeight: "4px",
                    background: "linear-gradient(180deg, #7c6aff, #4f3de8)",
                    borderRadius: "4px 4px 0 0",
                    transition: "opacity 0.15s",
                  }}
                />
                <span style={{ fontSize: "10px", color: "#333" }}>{d.month}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            flex: "0 0 40%",
            background: "#0e0e14",
            border: "1px solid #1e1e2a",
            borderRadius: "14px",
            padding: "20px",
          }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0", marginBottom: "14px" }}>
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
                  background: "#0a0a0f",
                  border: "1px solid #1a1a24",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: "rgba(124,106,255,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <CreditCard size={12} color="#7c6aff" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "12px", color: "#ccc", margin: 0 }}>{item.action}</p>
                  <p style={{ fontSize: "10px", color: "#444", marginTop: "2px" }}>
                    Client #{item.client_id} · {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/admin/dashboard"
            style={{
              display: "block",
              marginTop: "12px",
              fontSize: "12px",
              color: "#7c6aff",
              textDecoration: "none",
            }}
          >
            View all activity →
          </Link>
        </div>
      </div>

      {/* Recent clients table */}
      <div
        style={{
          background: "#0e0e14",
          border: "1px solid #1e1e2a",
          borderRadius: "14px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #1e1e2a",
          }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0", margin: 0 }}>
            Recent Clients
          </h2>
          <Link
            href="/admin/clients"
            style={{
              fontSize: "12px",
              color: "#7c6aff",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            View all →
          </Link>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.9fr 100px",
            padding: "10px 20px",
            background: "#0a0a0f",
            borderBottom: "1px solid #1e1e2a",
          }}
        >
          {["Company", "Owner", "Plan", "Status", "MRR", "Joined", ""].map((h) => (
            <span
              key={h}
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#444",
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
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.9fr 100px",
              padding: "12px 20px",
              borderBottom: "1px solid #1a1a24",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "13px", color: "#e0e0e0", fontWeight: 500 }}>
              {row.client.name}
            </span>
            <span style={{ fontSize: "12px", color: "#888" }}>{row.client.owner_name}</span>
            <span
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "6px",
                background: `${PLAN_COLORS[row.subscription?.plan_tier || "trial"] || "#555"}18`,
                color: PLAN_COLORS[row.subscription?.plan_tier || "trial"] || "#888",
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
            <span style={{ fontSize: "12px", color: "#666" }}>
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
                background: "rgba(124,106,255,0.15)",
                color: "#a78bfa",
                textDecoration: "none",
                border: "1px solid rgba(124,106,255,0.25)",
              }}
            >
              View
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
