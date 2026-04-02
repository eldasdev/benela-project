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
type ProductAnalyticsSummary = {
  active_users: number;
  pageviews: number;
  module_views: number;
  ai_prompts: number;
  logins: number;
  signups: number;
  workspace_bootstraps: number;
  business_profiles_saved: number;
  activation_rate_percent: number;
  workspace_ready_rate_percent: number;
};
type ProductTrendPoint = { day: string; active_users: number; pageviews: number; ai_prompts: number };
type ProductBreakdownItem = { label: string; value: number };
type ProductFunnelStep = { step: string; value: number; percent_of_previous: number; percent_of_signups: number };
type ProductAnalytics = {
  enabled: boolean;
  configured: boolean;
  host?: string | null;
  project_id?: string | null;
  window_days: number;
  generated_at: string;
  error?: string | null;
  summary: ProductAnalyticsSummary;
  daily_activity: ProductTrendPoint[];
  top_pages: ProductBreakdownItem[];
  top_modules: ProductBreakdownItem[];
  role_breakdown: ProductBreakdownItem[];
  activation_funnel: ProductFunnelStep[];
};

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [churn, setChurn] = useState<ChurnPoint[]>([]);
  const [months, setMonths] = useState(12);
  const [productDays, setProductDays] = useState(30);
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [productError, setProductError] = useState("");

  const loadAnalytics = useCallback(async (windowMonths: number, productWindowDays: number) => {
    setLoading(true);
    setError("");
    setProductError("");
    try {
      const [summaryRes, revenueRes, growthRes, churnRes, productRes] = await Promise.all([
        authFetch(`${API}/admin/summary`),
        authFetch(`${API}/admin/analytics/revenue`),
        authFetch(`${API}/admin/analytics/growth?months=${windowMonths}`),
        authFetch(`${API}/admin/analytics/churn?months=${windowMonths}`),
        authFetch(`${API}/admin/analytics/product?days=${productWindowDays}`),
      ]);
      if (!summaryRes.ok || !revenueRes.ok || !growthRes.ok || !churnRes.ok) {
        throw new Error("Failed to load analytics");
      }
      setSummary((await summaryRes.json()) as Summary);
      setRevenue((await revenueRes.json()) as RevenuePoint[]);
      setGrowth((await growthRes.json()) as GrowthPoint[]);
      setChurn((await churnRes.json()) as ChurnPoint[]);
      if (productRes.ok) {
        setProductAnalytics((await productRes.json()) as ProductAnalytics);
      } else {
        setProductAnalytics(null);
        setProductError("Could not load PostHog product analytics.");
      }
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
      void loadAnalytics(months, productDays);
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAnalytics, months, productDays]);

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

  const productSummary = productAnalytics?.summary;
  const productTrend = useMemo(() => productAnalytics?.daily_activity.slice(-10) ?? [], [productAnalytics]);
  const productActivityMax = Math.max(1, ...productTrend.map((point) => point.pageviews));
  const topPagesMax = Math.max(1, ...(productAnalytics?.top_pages ?? []).map((item) => item.value));
  const topModulesMax = Math.max(1, ...(productAnalytics?.top_modules ?? []).map((item) => item.value));
  const roleMixMax = Math.max(1, ...(productAnalytics?.role_breakdown ?? []).map((item) => item.value));

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
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => void loadAnalytics(months, productDays)}>
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

      <AdminSectionCard
        title="PostHog product analytics"
        eyebrow="Feature Adoption"
        description="Live product usage across authentication, activation, module navigation, and AI interactions."
        actions={
          <>
            <select value={String(productDays)} onChange={(event) => setProductDays(Number(event.target.value))} style={adminInputStyle({ width: "168px" })}>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            <AdminPill
              label={
                productAnalytics?.configured
                  ? productAnalytics.error
                    ? "Query issue"
                    : "Live"
                  : "Needs setup"
              }
              tone={
                productAnalytics?.configured
                  ? productAnalytics.error
                    ? "warning"
                    : "success"
                  : "warning"
              }
            />
          </>
        }
      >
        {productError ? (
          <div className="admin-ui-surface" style={{ padding: "14px 16px", borderColor: "color-mix(in srgb, var(--danger) 42%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, var(--bg-surface) 90%)", color: "var(--danger)", marginBottom: "16px" }}>
            {productError}
          </div>
        ) : null}
        {loading && !productAnalytics ? (
          <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>Loading PostHog product analytics...</div>
        ) : !productAnalytics ? (
          <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>PostHog product analytics are unavailable right now.</div>
        ) : !productAnalytics.configured ? (
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>PostHog is not configured for this deployment.</div>
            <div style={{ fontSize: "13px", color: "var(--text-subtle)", lineHeight: 1.7 }}>
              Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` on the frontend, plus `POSTHOG_API_HOST`, `POSTHOG_PROJECT_ID`, and `POSTHOG_PERSONAL_API_KEY` on the backend.
            </div>
          </div>
        ) : productAnalytics.error ? (
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ fontSize: "14px", color: "var(--danger)", fontWeight: 600 }}>PostHog query failed</div>
            <div style={{ fontSize: "13px", color: "var(--text-subtle)", lineHeight: 1.7 }}>{productAnalytics.error}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "18px" }}>
            <AdminMetricGrid columns="repeat(auto-fit, minmax(168px, 1fr))">
              <AdminMetricCard label="Active users" value={String(productSummary?.active_users || 0)} detail={`Last ${productDays} days`} tone="accent" />
              <AdminMetricCard label="Page views" value={String(productSummary?.pageviews || 0)} detail="Tracked route views" tone="success" />
              <AdminMetricCard label="Module views" value={String(productSummary?.module_views || 0)} detail="Dashboard section switches" tone="warning" />
              <AdminMetricCard label="AI prompts" value={String(productSummary?.ai_prompts || 0)} detail="Assistant prompt submissions" tone="accent" />
              <AdminMetricCard label="Login successes" value={String(productSummary?.logins || 0)} detail="Password + OAuth" tone="success" />
              <AdminMetricCard label="Activation rate" value={`${Math.round(productSummary?.activation_rate_percent || 0)}%`} detail={`${productSummary?.business_profiles_saved || 0} business profiles saved`} tone="warning" />
            </AdminMetricGrid>

            <div className="admin-responsive-triple admin-responsive-triple-analytics-product" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: "18px", alignItems: "start" }}>
              <AdminSectionCard title="Daily engagement" description="Recent activity from PostHog events for pages, users, and AI usage.">
                <div style={{ display: "grid", gap: "10px" }}>
                  {productTrend.length ? (
                    productTrend.map((point) => (
                      <div key={point.day} style={{ display: "grid", gridTemplateColumns: "88px 1fr auto auto", gap: "10px", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{point.day.slice(5)}</span>
                        <div style={{ height: "10px", borderRadius: "999px", background: "color-mix(in srgb, var(--border-default) 42%, transparent)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.max(5, clampPercent((point.pageviews / productActivityMax) * 100))}%`, height: "100%", background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 78%, #fff 22%), color-mix(in srgb, var(--accent-2) 72%, var(--accent) 28%))" }} />
                        </div>
                        <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 700 }}>{point.active_users} users</span>
                        <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{point.ai_prompts} AI</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>No PostHog activity yet for this window.</div>
                  )}
                </div>
              </AdminSectionCard>

              <AdminSectionCard title="Activation funnel" description="Client setup progression based on tracked signup and onboarding events.">
                <div style={{ display: "grid", gap: "10px" }}>
                  {(productAnalytics.activation_funnel || []).map((step) => (
                    <div key={step.step} className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 700 }}>{step.step}</div>
                        <div style={{ fontSize: "18px", color: "var(--text-primary)", fontWeight: 700 }}>{step.value}</div>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>
                        {Math.round(step.percent_of_signups)}% of signups
                        {step.step !== "Signups" ? ` · ${Math.round(step.percent_of_previous)}% of previous` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </AdminSectionCard>

              <AdminSectionCard title="Role mix" description="Page-view volume by identified role captured on route events.">
                <div style={{ display: "grid", gap: "10px" }}>
                  {(productAnalytics.role_breakdown || []).length ? (
                    productAnalytics.role_breakdown.map((item) => (
                      <div key={item.label} style={{ display: "grid", gridTemplateColumns: "92px 1fr auto", gap: "10px", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{item.label}</span>
                        <div style={{ height: "9px", borderRadius: "999px", background: "color-mix(in srgb, var(--border-default) 42%, transparent)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.max(6, clampPercent((item.value / roleMixMax) * 100))}%`, height: "100%", background: "linear-gradient(90deg, #34d399, #22c55e)" }} />
                        </div>
                        <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 700 }}>{item.value}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>No role signals captured yet.</div>
                  )}
                </div>
              </AdminSectionCard>
            </div>

            <div className="admin-responsive-triple admin-responsive-triple-analytics-product-breakdown" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px", alignItems: "start" }}>
              <AdminSectionCard title="Top pages" description="Most visited routes captured by the Benela page-view tracker.">
                <div style={{ display: "grid", gap: "10px" }}>
                  {(productAnalytics.top_pages || []).length ? (
                    productAnalytics.top_pages.map((item) => (
                      <div key={item.label} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr auto", gap: "10px", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                        <div style={{ height: "9px", borderRadius: "999px", background: "color-mix(in srgb, var(--border-default) 42%, transparent)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.max(6, clampPercent((item.value / topPagesMax) * 100))}%`, height: "100%", background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 72%, #fff 28%), color-mix(in srgb, var(--accent-2) 76%, var(--accent) 24%))" }} />
                        </div>
                        <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 700 }}>{item.value}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>No page-view events yet.</div>
                  )}
                </div>
              </AdminSectionCard>

              <AdminSectionCard title="Top modules" description="Most used dashboard sections from the explicit module-view tracker.">
                <div style={{ display: "grid", gap: "10px" }}>
                  {(productAnalytics.top_modules || []).length ? (
                    productAnalytics.top_modules.map((item) => (
                      <div key={item.label} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>{item.label}</span>
                        <div style={{ height: "9px", borderRadius: "999px", background: "color-mix(in srgb, var(--border-default) 42%, transparent)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.max(6, clampPercent((item.value / topModulesMax) * 100))}%`, height: "100%", background: "linear-gradient(90deg, #60a5fa, color-mix(in srgb, var(--accent) 44%, #60a5fa 56%))" }} />
                        </div>
                        <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 700 }}>{item.value}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>No module-view events yet.</div>
                  )}
                </div>
              </AdminSectionCard>
            </div>

            <div style={{ fontSize: "12px", color: "var(--text-quiet)" }}>
              Generated from PostHog at {new Date(productAnalytics.generated_at).toLocaleString()}.
            </div>
          </div>
        )}
      </AdminSectionCard>

      <AdminMetricGrid>
        <AdminMetricCard label="MRR" value={formatCompactMoney(summary?.monthly_recurring_revenue || 0)} detail="Recurring monthly revenue" tone="accent" />
        <AdminMetricCard label="Paid this month" value={formatCompactMoney(summary?.paid_this_month || 0)} detail="Cash collected in the current month" tone="success" />
        <AdminMetricCard label="Revenue window" value={formatCompactMoney(metrics.windowRevenue)} detail={`Last ${months} months`} tone="accent" />
        <AdminMetricCard label="Average monthly revenue" value={formatCompactMoney(metrics.avgMonthlyRevenue)} detail="Window average" tone="warning" />
        <AdminMetricCard label="Net client growth" value={`${metrics.netGrowth >= 0 ? "+" : ""}${metrics.netGrowth}`} detail={`${metrics.newClients} new / ${metrics.churnedClients} churned`} tone={metrics.netGrowth >= 0 ? "success" : "danger"} />
        <AdminMetricCard label="Active client rate" value={`${metrics.activeRate}%`} detail={`${summary?.active_clients || 0} of ${summary?.total_clients || 0} active`} tone="success" />
      </AdminMetricGrid>

      <div className="admin-responsive-triple admin-responsive-triple-analytics-top" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "18px", alignItems: "start" }}>
        <AdminSectionCard title="Revenue trend" description="Shared-baseline monthly revenue trend for the selected analytics window.">
          <AdminChartSurface style={{ display: "grid", gap: "16px", minHeight: "320px" }}>
            <div className="admin-mobile-slider-shell">
              <div className="admin-revenue-slider-track" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(revenueWindow.length, 1)}, minmax(0, 1fr))`, gap: "10px", alignItems: "end" }}>
              {revenueWindow.map((point, index) => {
                const label = splitMonthLabel(point.month);
                const previousLabel = index > 0 ? splitMonthLabel(revenueWindow[index - 1].month) : null;
                const showYear = index === revenueWindow.length - 1 || !previousLabel || previousLabel.year !== label.year;
                return (
                  <div
                    key={point.month}
                    className="admin-revenue-slider-item"
                    data-highlight={index === revenueWindow.length - 1 ? "true" : "false"}
                    style={{ display: "grid", gridTemplateRows: "auto 168px 40px", gap: "8px", alignItems: "end" }}
                  >
                    <span
                      className="admin-revenue-slider-value"
                      data-zero={point.revenue <= 0 ? "true" : "false"}
                      style={{ fontSize: "11px", color: "var(--text-subtle)", textAlign: "center" }}
                    >
                      {formatCompactMoney(point.revenue)}
                    </span>
                    <div className="admin-revenue-slider-bar-area" style={{ height: "100%", display: "flex", alignItems: "end", justifyContent: "center", borderBottom: "1px solid color-mix(in srgb, var(--border-default) 68%, transparent)" }}>
                      <div className="admin-revenue-slider-bar" style={{ width: "min(32px, 80%)", height: `${Math.max(6, (point.revenue / revenueMax) * 156)}px`, borderRadius: "12px 12px 4px 4px", background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 82%, #fff 18%), color-mix(in srgb, var(--accent-2) 76%, var(--accent) 24%))", boxShadow: "0 16px 26px color-mix(in srgb, var(--accent) 26%, transparent)" }} />
                    </div>
                    <div className="admin-revenue-slider-label" style={{ textAlign: "center", fontSize: "11px", color: "var(--text-subtle)", lineHeight: 1.35 }}>
                      <div className="admin-revenue-slider-month">{label.month}</div>
                      {showYear ? <div className="admin-revenue-slider-year">{label.year}</div> : null}
                    </div>
                  </div>
                );
              })}
              </div>
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

      <div className="admin-responsive-triple admin-responsive-triple-analytics-bottom" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr 0.9fr", gap: "18px", alignItems: "start" }}>
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
