"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, TrendingDown, TrendingUp, Users } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { clampPercent, formatCompactMoney, formatMoney, splitMonthLabel } from "@/lib/admin-utils";
import {
  AdminChartSurface,
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

type Summary = {
  total_clients: number;
  active_clients: number;
  suspended: number;
  monthly_recurring_revenue: number;
  paid_this_month: number;
  trials_active: number;
  payment_required_count?: number;
  setup_pending_count?: number;
  open_reports_count?: number;
  pending_documents_count?: number;
  plan_breakdown: Record<string, number>;
};

type RevenuePoint = { month: string; revenue: number };
type GrowthPoint = { month: string; new_clients: number; cumulative: number };
type ChurnPoint = { month: string; churned: number };

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [churn, setChurn] = useState<ChurnPoint[]>([]);
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async (windowMonths: number) => {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, revenueRes, growthRes, churnRes] = await Promise.all([
        authFetch(`${API}/admin/summary`),
        authFetch(`${API}/admin/analytics/revenue`),
        authFetch(`${API}/admin/analytics/growth?months=${windowMonths}`),
        authFetch(`${API}/admin/analytics/churn?months=${windowMonths}`),
      ]);
      if (!summaryRes.ok || !revenueRes.ok || !growthRes.ok || !churnRes.ok) {
        throw new Error("Failed to load analytics");
      }
      setSummary((await summaryRes.json()) as Summary);
      setRevenue((await revenueRes.json()) as RevenuePoint[]);
      setGrowth((await growthRes.json()) as GrowthPoint[]);
      setChurn((await churnRes.json()) as ChurnPoint[]);
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
    const timer = setTimeout(() => {
      void loadAnalytics(months);
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAnalytics, months]);

  const revenueWindow = useMemo(() => revenue.slice(-months), [months, revenue]);
  const revenueMax = Math.max(1, ...revenueWindow.map((point) => point.revenue));
  const growthMax = Math.max(1, ...growth.map((point) => point.new_clients));
  const churnMax = Math.max(1, ...churn.map((point) => point.churned));

  const metrics = useMemo(() => {
    const windowRevenue = revenueWindow.reduce((sum, point) => sum + point.revenue, 0);
    const avgMonthlyRevenue = revenueWindow.length ? windowRevenue / revenueWindow.length : 0;
    const newClients = growth.reduce((sum, point) => sum + point.new_clients, 0);
    const churnedClients = churn.reduce((sum, point) => sum + point.churned, 0);
    const netGrowth = newClients - churnedClients;
    const activeRate = summary?.total_clients ? Math.round((summary.active_clients / summary.total_clients) * 100) : 0;
    return { windowRevenue, avgMonthlyRevenue, newClients, churnedClients, netGrowth, activeRate };
  }, [growth, churn, revenueWindow, summary]);

  const planMix = useMemo(() => {
    if (!summary?.plan_breakdown) return [];
    const total = Object.values(summary.plan_breakdown).reduce((sum, count) => sum + count, 0) || 1;
    return Object.entries(summary.plan_breakdown)
      .map(([plan, count]) => ({ plan, count, percent: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [summary]);

  const backlogCards = [
    { label: "Setup pending", value: summary?.setup_pending_count ?? 0, tone: "accent" as const },
    { label: "Payment required", value: summary?.payment_required_count ?? 0, tone: "warning" as const },
    { label: "Pending documents", value: summary?.pending_documents_count ?? 0, tone: "warning" as const },
    { label: "Open reports", value: summary?.open_reports_count ?? 0, tone: "danger" as const },
  ];

  const monthlyRows = useMemo(() => {
    const growthByMonth = new Map(growth.map((point) => [point.month, point.new_clients]));
    const churnByMonth = new Map(churn.map((point) => [point.month, point.churned]));
    return revenueWindow.map((point) => ({
      month: point.month,
      revenue: point.revenue,
      newClients: growthByMonth.get(point.month) ?? 0,
      churned: churnByMonth.get(point.month) ?? 0,
    }));
  }, [growth, churn, revenueWindow]);

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1540px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <AdminPageHero
        eyebrow="Platform Intelligence"
        title="Analytics"
        subtitle="Revenue, growth, churn, onboarding friction, and operational backlog across all live client workspaces."
        actions={
          <>
            <select value={String(months)} onChange={(event) => setMonths(Number(event.target.value))} style={adminInputStyle({ width: "180px" })}>
              <option value="6">Last 6 months</option>
              <option value="12">Last 12 months</option>
              <option value="24">Last 24 months</option>
            </select>
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => void loadAnalytics(months)}>
              <RefreshCcw size={16} /> Refresh
            </button>
          </>
        }
      />

      {error ? (
        <div className="admin-ui-surface" style={{ padding: "14px 16px", borderColor: "color-mix(in srgb, var(--danger) 42%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, var(--bg-surface) 90%)", color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}

      <AdminMetricGrid>
        <AdminMetricCard label="MRR" value={formatCompactMoney(summary?.monthly_recurring_revenue || 0)} detail="Recurring monthly revenue" tone="accent" />
        <AdminMetricCard label="Paid this month" value={formatCompactMoney(summary?.paid_this_month || 0)} detail="Cash collected in the current month" tone="success" />
        <AdminMetricCard label="Revenue window" value={formatCompactMoney(metrics.windowRevenue)} detail={`Last ${months} months`} tone="accent" />
        <AdminMetricCard label="Average monthly revenue" value={formatCompactMoney(metrics.avgMonthlyRevenue)} detail="Window average" tone="warning" />
        <AdminMetricCard label="Net client growth" value={`${metrics.netGrowth >= 0 ? "+" : ""}${metrics.netGrowth}`} detail={`${metrics.newClients} new / ${metrics.churnedClients} churned`} tone={metrics.netGrowth >= 0 ? "success" : "danger"} />
        <AdminMetricCard label="Active client rate" value={`${metrics.activeRate}%`} detail={`${summary?.active_clients || 0} of ${summary?.total_clients || 0} active`} tone="success" />
      </AdminMetricGrid>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "18px", alignItems: "start" }}>
        <AdminSectionCard title="Revenue trend" description="Shared-baseline monthly revenue trend for the selected analytics window.">
          <AdminChartSurface style={{ display: "grid", gap: "16px", minHeight: "320px" }}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(revenueWindow.length, 1)}, minmax(0, 1fr))`, gap: "10px", alignItems: "end" }}>
              {revenueWindow.map((point) => {
                const label = splitMonthLabel(point.month);
                return (
                  <div key={point.month} style={{ display: "grid", gridTemplateRows: "auto 168px 40px", gap: "8px", alignItems: "end" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-subtle)", textAlign: "center" }}>{formatCompactMoney(point.revenue)}</span>
                    <div style={{ height: "100%", display: "flex", alignItems: "end", justifyContent: "center", borderBottom: "1px solid color-mix(in srgb, var(--border-default) 68%, transparent)" }}>
                      <div style={{ width: "min(32px, 80%)", height: `${Math.max(6, (point.revenue / revenueMax) * 156)}px`, borderRadius: "12px 12px 4px 4px", background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 82%, #fff 18%), color-mix(in srgb, var(--accent-2) 76%, var(--accent) 24%))", boxShadow: "0 16px 26px color-mix(in srgb, var(--accent) 26%, transparent)" }} />
                    </div>
                    <div style={{ textAlign: "center", fontSize: "11px", color: "var(--text-subtle)", lineHeight: 1.35 }}>
                      <div>{label.month}</div>
                      <div>{label.year}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </AdminChartSurface>
        </AdminSectionCard>

        <AdminSectionCard title="Client growth" description="New client additions by month across the selected window.">
          <div style={{ display: "grid", gap: "10px" }}>
            {growth.map((point) => (
              <div key={point.month} style={{ display: "grid", gridTemplateColumns: "78px 1fr auto", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{point.month}</span>
                <div style={{ height: "9px", borderRadius: "999px", background: "color-mix(in srgb, var(--border-default) 42%, transparent)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(4, clampPercent((point.new_clients / growthMax) * 100))}%`, height: "100%", background: "linear-gradient(90deg, #34d399, #22c55e)" }} />
                </div>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#34d399" }}>+{point.new_clients}</span>
              </div>
            ))}
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Churn" description="Monthly churn count for the same analytics window.">
          <div style={{ display: "grid", gap: "10px" }}>
            {churn.map((point) => (
              <div key={point.month} style={{ display: "grid", gridTemplateColumns: "78px 1fr auto", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{point.month}</span>
                <div style={{ height: "9px", borderRadius: "999px", background: "color-mix(in srgb, var(--border-default) 42%, transparent)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(4, clampPercent((point.churned / churnMax) * 100))}%`, height: "100%", background: "linear-gradient(90deg, color-mix(in srgb, var(--danger) 72%, transparent), var(--danger))" }} />
                </div>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--danger)" }}>-{point.churned}</span>
              </div>
            ))}
          </div>
        </AdminSectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr 0.9fr", gap: "18px", alignItems: "start" }}>
        <AdminSectionCard title="Plan mix" description="Current workspace distribution across active plan tiers.">
          <div style={{ display: "grid", gap: "12px" }}>
            {planMix.map((item) => (
              <div key={item.plan} style={{ display: "grid", gridTemplateColumns: "90px 1fr auto", gap: "12px", alignItems: "center" }}>
                <AdminPill label={item.plan} tone={item.plan === "pro" ? "accent" : item.plan === "enterprise" ? "warning" : item.plan === "trial" ? "warning" : "neutral"} />
                <div style={{ height: "10px", borderRadius: "999px", background: "color-mix(in srgb, var(--border-default) 42%, transparent)", overflow: "hidden" }}>
                  <div style={{ width: `${clampPercent(item.percent)}%`, height: "100%", background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 70%, #34d399 30%), color-mix(in srgb, var(--accent) 38%, #fbbf24 62%))" }} />
                </div>
                <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 700 }}>{item.count}</span>
              </div>
            ))}
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Onboarding funnel" description="High-level client setup progression from summary metrics.">
          <div style={{ display: "grid", gap: "12px" }}>
            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Total clients</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>{summary?.total_clients || 0}</div>
            </div>
            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Setup pending</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>{summary?.setup_pending_count || 0}</div>
            </div>
            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Active clients</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>{summary?.active_clients || 0}</div>
            </div>
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Backlog health" description="Operational friction that leadership should clear quickly.">
          <div style={{ display: "grid", gap: "10px" }}>
            {backlogCards.map((card) => (
              <div key={card.label} className="admin-ui-surface" style={{ padding: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{card.label}</div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>{card.value}</div>
                </div>
                <AdminPill label={card.value > 0 ? "Attention" : "Healthy"} tone={card.value > 0 ? card.tone : "success"} />
              </div>
            ))}
          </div>
        </AdminSectionCard>
      </div>

      <AdminSectionCard title="Monthly breakdown" description="Readable operational table for revenue, growth, churn, and monthly net movement.">
        {monthlyRows.length ? (
          <div className="admin-ui-table">
            <AdminTableHead columns={[
              <span key="month">Month</span>,
              <span key="revenue">Revenue</span>,
              <span key="new">New clients</span>,
              <span key="churned">Churned</span>,
              <span key="net">Net</span>,
            ]} />
            {monthlyRows.map((row) => {
              const net = row.newClients - row.churned;
              return (
                <AdminTableRow key={row.month} style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{row.month}</span>
                  <span style={{ color: "var(--text-primary)" }}>{formatMoney(row.revenue)}</span>
                  <span style={{ color: "#34d399", display: "inline-flex", alignItems: "center", gap: "6px" }}><TrendingUp size={14} /> {row.newClients}</span>
                  <span style={{ color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: "6px" }}><TrendingDown size={14} /> {row.churned}</span>
                  <span style={{ color: net >= 0 ? "#34d399" : "var(--danger)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}>{net >= 0 ? <Users size={14} /> : <TrendingDown size={14} />}{net >= 0 ? `+${net}` : net}</span>
                </AdminTableRow>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{loading ? "Loading analytics rows..." : "No analytics rows available for this window."}</div>
        )}
      </AdminSectionCard>
    </div>
  );
}
