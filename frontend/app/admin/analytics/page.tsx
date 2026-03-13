"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCcw, TrendingDown, TrendingUp } from "lucide-react";

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
type GrowthPoint = { month: string; new_clients: number; cumulative: number };
type ChurnPoint = { month: string; churned: number };

function formatCompactCurrency(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [churn, setChurn] = useState<ChurnPoint[]>([]);
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async (monthsWindow: number) => {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, revenueRes, growthRes, churnRes] = await Promise.all([
        fetch(`${API}/admin/summary`),
        fetch(`${API}/admin/analytics/revenue`),
        fetch(`${API}/admin/analytics/growth?months=${monthsWindow}`),
        fetch(`${API}/admin/analytics/churn?months=${monthsWindow}`),
      ]);

      setSummary(summaryRes.ok ? ((await summaryRes.json()) as Summary) : null);
      setRevenue(revenueRes.ok ? ((await revenueRes.json()) as RevenuePoint[]) : []);
      setGrowth(growthRes.ok ? ((await growthRes.json()) as GrowthPoint[]) : []);
      setChurn(churnRes.ok ? ((await churnRes.json()) as ChurnPoint[]) : []);
    } catch {
      setSummary(null);
      setRevenue([]);
      setGrowth([]);
      setChurn([]);
      setError("Could not load analytics data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadAnalytics(months);
    }, 0);
    return () => clearTimeout(t);
  }, [loadAnalytics, months]);

  const revenueMax = Math.max(1, ...revenue.map((point) => point.revenue));
  const growthMax = Math.max(1, ...growth.map((point) => point.new_clients));
  const churnMax = Math.max(1, ...churn.map((point) => point.churned));

  const metrics = useMemo(() => {
    const annualRevenue = revenue.reduce((sum, point) => sum + point.revenue, 0);
    const avgMonthlyRevenue = revenue.length ? annualRevenue / revenue.length : 0;
    const newClients = growth.reduce((sum, point) => sum + point.new_clients, 0);
    const churned = churn.reduce((sum, point) => sum + point.churned, 0);
    const activeRate =
      summary?.total_clients && summary.total_clients > 0
        ? Math.round((summary.active_clients / summary.total_clients) * 100)
        : 0;

    return {
      annualRevenue,
      avgMonthlyRevenue,
      newClients,
      churned,
      netGrowth: newClients - churned,
      activeRate,
    };
  }, [revenue, growth, churn, summary]);

  const monthlyRows = useMemo(() => {
    const growthByMonth = new Map(growth.map((point) => [point.month, point]));
    const churnByMonth = new Map(churn.map((point) => [point.month, point]));
    return revenue.map((point) => ({
      month: point.month,
      revenue: point.revenue,
      new_clients: growthByMonth.get(point.month)?.new_clients ?? 0,
      churned: churnByMonth.get(point.month)?.churned ?? 0,
    }));
  }, [revenue, growth, churn]);

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1450px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Analytics</h1>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
            Revenue, growth, churn, and operational performance across client organizations.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <select value={String(months)} onChange={(e) => setMonths(Number(e.target.value))} style={inputStyle}>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
            <option value="24">Last 24 months</option>
          </select>
          <button type="button" style={secondaryBtn} onClick={() => void loadAnalytics(months)}>
            <RefreshCcw size={12} /> Refresh
          </button>
          <Link href="/admin/dashboard" style={secondaryLinkBtn}>
            Back to Overview
          </Link>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "9px",
            border: "1px solid rgba(248,113,113,0.25)",
            background: "rgba(248,113,113,0.08)",
            color: "#f87171",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "10px", marginBottom: "14px" }}>
        {[
          { label: "MRR", value: formatCompactCurrency(summary?.monthly_recurring_revenue || 0), color: "#34d399" },
          { label: "Paid This Month", value: formatCompactCurrency(summary?.paid_this_month || 0), color: "#60a5fa" },
          { label: "Total Revenue", value: formatCompactCurrency(metrics.annualRevenue), color: "var(--accent)" },
          { label: "Avg Monthly Revenue", value: formatCompactCurrency(metrics.avgMonthlyRevenue), color: "#fbbf24" },
          { label: "Net Client Growth", value: metrics.netGrowth, color: metrics.netGrowth >= 0 ? "#34d399" : "#f87171" },
          { label: "Active Client Rate", value: `${metrics.activeRate}%`, color: "#a78bfa" },
        ].map((card) => (
          <div key={card.label} style={{ ...kpiCard, boxShadow: `inset 0 -1px 0 ${card.color}45` }}>
            <div style={{ fontSize: "10px", color: "var(--text-subtle)", marginBottom: "6px" }}>{card.label}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <section style={panelStyle}>
          <div style={panelHeader}>Revenue Trend</div>
          <div style={{ padding: "12px", display: "flex", alignItems: "flex-end", gap: "8px", minHeight: "220px" }}>
            {revenue.map((point) => (
              <div key={point.month} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "10px", color: "var(--text-subtle)" }}>{formatCompactCurrency(point.revenue)}</span>
                <div
                  style={{
                    width: "100%",
                    maxWidth: "28px",
                    height: `${Math.max(4, (point.revenue / revenueMax) * 150)}px`,
                    borderRadius: "5px 5px 0 0",
                    background: "linear-gradient(180deg, var(--accent), var(--accent-2))",
                  }}
                />
                <span style={{ fontSize: "10px", color: "var(--text-quiet)" }}>{point.month}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={panelStyle}>
          <div style={panelHeader}>Client Growth</div>
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px", minHeight: "220px" }}>
            {growth.map((point) => (
              <div key={point.month} style={{ display: "grid", gridTemplateColumns: "70px 1fr auto", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{point.month}</span>
                <div style={{ height: "8px", borderRadius: "99px", background: "var(--bg-elevated)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.max(2, (point.new_clients / growthMax) * 100)}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #34d399, #22c55e)",
                    }}
                  />
                </div>
                <span style={{ fontSize: "11px", color: "#34d399", fontWeight: 600 }}>+{point.new_clients}</span>
              </div>
            ))}
            {!growth.length && !loading && <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>No growth data.</span>}
          </div>
        </section>

        <section style={panelStyle}>
          <div style={panelHeader}>Churn</div>
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px", minHeight: "220px" }}>
            {churn.map((point) => (
              <div key={point.month} style={{ display: "grid", gridTemplateColumns: "70px 1fr auto", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{point.month}</span>
                <div style={{ height: "8px", borderRadius: "99px", background: "var(--bg-elevated)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.max(2, (point.churned / churnMax) * 100)}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, color-mix(in srgb, var(--danger) 74%, #fff 26%), var(--danger))",
                    }}
                  />
                </div>
                <span style={{ fontSize: "11px", color: "#f87171", fontWeight: 600 }}>-{point.churned}</span>
              </div>
            ))}
            {!churn.length && !loading && <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>No churn data.</span>}
          </div>
        </section>
      </div>

      <section style={panelStyle}>
        <div style={panelHeader}>Monthly Breakdown</div>
        <div style={tableHeadStyle}>
          {["Month", "Revenue", "New Clients", "Churned", "Net"].map((h) => (
            <span key={h} style={thStyle}>
              {h}
            </span>
          ))}
        </div>
        {monthlyRows.map((row) => {
          const net = row.new_clients - row.churned;
          return (
            <div key={row.month} style={tableRowStyle}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.month}</span>
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{formatCompactCurrency(row.revenue)}</span>
              <span style={{ fontSize: "12px", color: "#34d399", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <TrendingUp size={12} />
                {row.new_clients}
              </span>
              <span style={{ fontSize: "12px", color: "#f87171", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <TrendingDown size={12} />
                {row.churned}
              </span>
              <span style={{ fontSize: "12px", color: net >= 0 ? "#34d399" : "#f87171", fontWeight: 600 }}>
                {net >= 0 ? "+" : ""}
                {net}
              </span>
            </div>
          );
        })}
        {!monthlyRows.length && !loading && (
          <div style={{ padding: "14px", fontSize: "12px", color: "var(--text-muted)" }}>
            No monthly analytics data available.
          </div>
        )}
      </section>
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
