"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowUpRight, CreditCard, RefreshCcw, TrendingDown, TrendingUp } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { type AdminWorkspaceRow } from "@/lib/admin-client-workspaces";
import { formatCompactMoney, formatDate, splitMonthLabel } from "@/lib/admin-utils";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminMetricCard,
  AdminMetricGrid,
  AdminPageHero,
  AdminPill,
  AdminSectionCard,
  AdminTableHead,
  AdminTableRow,
  adminButtonStyle,
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

type ActivityItem = {
  id: number;
  client_id: number;
  action: string;
  actor: string | null;
  created_at: string;
};

function accessTone(status: string): "accent" | "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "payment_required":
      return "warning";
    case "suspended":
      return "danger";
    case "setup_pending":
      return "accent";
    default:
      return "neutral";
  }
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenueChart, setRevenueChart] = useState<RevenuePoint[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [clients, setClients] = useState<AdminWorkspaceRow[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [summaryRes, revenueRes, activityRes, clientsRes] = await Promise.all([
      authFetch(`${API}/admin/summary`),
      authFetch(`${API}/admin/analytics/revenue`),
      authFetch(`${API}/admin/activity?limit=12`),
      authFetch(`${API}/admin/client-workspaces?limit=8`),
    ]);

    if ([summaryRes, revenueRes, activityRes, clientsRes].some((response) => response.status === 401 || response.status === 403)) {
      setError("Admin session is not available. Sign in again.");
      router.replace("/admin/login");
      return;
    }

    if (!summaryRes.ok || !revenueRes.ok || !activityRes.ok || !clientsRes.ok) {
      setError("Could not load admin overview data.");
    } else {
      setError("");
    }

    setSummary(summaryRes.ok ? ((await summaryRes.json()) as Summary) : null);
    setRevenueChart(revenueRes.ok ? ((await revenueRes.json()) as RevenuePoint[]) : []);
    setActivity(activityRes.ok ? ((await activityRes.json()) as ActivityItem[]) : []);
    setClients(clientsRes.ok ? ((await clientsRes.json()) as AdminWorkspaceRow[]) : []);
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const maxRevenue = Math.max(1, ...revenueChart.map((point) => point.revenue));
  const activeRate = summary?.total_clients ? Math.round((summary.active_clients / summary.total_clients) * 100) : 0;
  const paidCoverage = summary?.monthly_recurring_revenue ? Math.round((summary.paid_this_month / summary.monthly_recurring_revenue) * 100) : 0;
  const planMix = useMemo(() => {
    if (!summary?.plan_breakdown) return [];
    return Object.entries(summary.plan_breakdown).sort((a, b) => b[1] - a[1]);
  }, [summary]);

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1540px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <AdminPageHero
        eyebrow="Control Center"
        title="Overview"
        subtitle="Cross-platform KPIs, revenue visibility, live activity, and the most recent client workspaces entering or moving through the system."
        actions={
          <>
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => void load()}>
              <RefreshCcw size={16} /> Refresh
            </button>
            <Link href="/admin/marketplace" style={adminButtonStyle("primary")}>
              Open Marketplace Manager <ArrowUpRight size={16} />
            </Link>
          </>
        }
      />

      <AdminMetricGrid>
        <AdminMetricCard label="MRR" value={formatCompactMoney(summary?.monthly_recurring_revenue || 0)} detail="Recurring monthly revenue" tone="accent" />
        <AdminMetricCard label="Total clients" value={summary?.total_clients || 0} detail={`${summary?.active_clients || 0} active`} tone="accent" />
        <AdminMetricCard label="Active rate" value={`${activeRate}%`} detail="Healthy active client ratio" tone="success" />
        <AdminMetricCard label="Trials" value={summary?.trials_active || 0} detail={`${summary?.plan_breakdown?.trial || 0} trial workspaces`} tone="warning" />
        <AdminMetricCard label="Paid this month" value={formatCompactMoney(summary?.paid_this_month || 0)} detail={`${paidCoverage}% of current MRR`} tone="success" />
        <AdminMetricCard label="Suspended" value={summary?.suspended || 0} detail={(summary?.suspended || 0) === 0 ? "All clear" : "Needs admin review"} tone={(summary?.suspended || 0) === 0 ? "success" : "danger"} />
      </AdminMetricGrid>

      {error ? (
        <div className="admin-ui-surface" style={{ padding: "14px 16px", borderColor: "color-mix(in srgb, var(--danger) 42%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, var(--bg-surface) 90%)", color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}

      <div className="admin-responsive-split admin-responsive-split-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px", alignItems: "start" }}>
        <AdminSectionCard title="Plan mix" description="Current workspace distribution by plan tier.">
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {planMix.map(([plan, count]) => (
              <AdminPill key={plan} label={`${plan} · ${count}`} tone={plan === "pro" ? "accent" : plan === "enterprise" ? "warning" : plan === "trial" ? "warning" : "neutral"} />
            ))}
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Operational backlog" description="Signals that should get reviewed before they spill into retention or billing issues.">
          <div className="admin-responsive-four-up" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
            {[
              { label: "Setup pending", value: summary?.setup_pending_count || 0, tone: "accent" as const },
              { label: "Payment required", value: summary?.payment_required_count || 0, tone: "warning" as const },
              { label: "Pending docs", value: summary?.pending_documents_count || 0, tone: "warning" as const },
              { label: "Open reports", value: summary?.open_reports_count || 0, tone: "danger" as const },
            ].map((card) => (
              <div key={card.label} className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{card.label}</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>{card.value}</div>
                <AdminPill label={card.value > 0 ? "Attention" : "Healthy"} tone={card.value > 0 ? card.tone : "success"} />
              </div>
            ))}
          </div>
        </AdminSectionCard>
      </div>

      <div className="admin-responsive-split admin-responsive-split-wide" style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: "18px", alignItems: "start" }}>
        <AdminSectionCard title="Monthly revenue" description="Recent revenue trend with shared-baseline columns so leadership can scan momentum quickly.">
          {revenueChart.length ? (
            <div className="admin-mobile-slider-shell">
              <div className="admin-revenue-slider-track" style={{ display: "grid", gridTemplateColumns: `repeat(${revenueChart.length}, minmax(0, 1fr))`, gap: "10px", alignItems: "end" }}>
              {revenueChart.map((point, index) => {
                const label = splitMonthLabel(point.month);
                const previousLabel = index > 0 ? splitMonthLabel(revenueChart[index - 1].month) : null;
                const showYear = index === revenueChart.length - 1 || !previousLabel || previousLabel.year !== label.year;
                return (
                  <div
                    key={point.month}
                    className="admin-revenue-slider-item"
                    data-highlight={index === revenueChart.length - 1 ? "true" : "false"}
                    style={{ display: "grid", gridTemplateRows: "auto 168px 40px", gap: "8px" }}
                  >
                    <span
                      className="admin-revenue-slider-value"
                      data-zero={point.revenue <= 0 ? "true" : "false"}
                      style={{ fontSize: "11px", color: "var(--text-subtle)", textAlign: "center" }}
                    >
                      {formatCompactMoney(point.revenue)}
                    </span>
                    <div className="admin-revenue-slider-bar-area" style={{ display: "flex", alignItems: "end", justifyContent: "center", height: "168px", borderBottom: "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)" }}>
                      <div className="admin-revenue-slider-bar" style={{ width: "min(32px, 80%)", height: `${Math.max(6, (point.revenue / maxRevenue) * 160)}px`, borderRadius: "12px 12px 4px 4px", background: "linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent-2) 72%, var(--accent) 28%))", boxShadow: "0 16px 28px color-mix(in srgb, var(--accent) 26%, transparent)" }} />
                    </div>
                    <div className="admin-revenue-slider-label" style={{ fontSize: "11px", color: "var(--text-subtle)", textAlign: "center", lineHeight: 1.35 }}>
                      <div className="admin-revenue-slider-month">{label.month}</div>
                      {showYear ? <div className="admin-revenue-slider-year">{label.year}</div> : null}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          ) : <AdminEmptyState title="No revenue data yet" description="Revenue points will appear here after the first paid billing cycle is recorded." />}
        </AdminSectionCard>

        <AdminSectionCard title="Recent activity" description="Latest platform events flowing through the admin activity feed.">
          {activity.length ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {activity.slice(0, 8).map((item) => (
                <div key={item.id} className="admin-ui-surface" style={{ padding: "12px 14px", display: "flex", gap: "12px", alignItems: "center" }}>
                  <div style={{ width: "34px", height: "34px", borderRadius: "12px", background: "color-mix(in srgb, var(--accent-soft) 80%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Activity size={16} color="var(--accent)" />
                  </div>
                  <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                    <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "13px" }}>{item.action}</div>
                    <div style={{ color: "var(--text-subtle)", fontSize: "12px" }}>Client #{item.client_id} · {formatDate(item.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <AdminEmptyState title="No activity recorded" description="The admin activity feed will populate as subscriptions, payments, client changes, and reports are processed." />}
        </AdminSectionCard>
      </div>

      <AdminSectionCard title="Recent clients" description="Workspace-first client list with direct links into the stronger admin client console.">
        {clients.length ? (
          <AdminDataTable>
            <AdminTableHead columns={[
              <span key="company">Company</span>,
              <span key="owner">Owner</span>,
              <span key="plan">Plan</span>,
              <span key="access">Access</span>,
              <span key="mrr">MRR</span>,
              <span key="joined">Joined</span>,
              <span key="actions">Actions</span>,
            ]} />
            {clients.map((client) => (
              <AdminTableRow key={client.id} style={{ gridTemplateColumns: "1.35fr 1fr 0.7fr 0.8fr 0.7fr 0.8fr 0.9fr" }}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{client.business_name}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{client.workspace_id}</span>
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{client.owner_name || "Unassigned"}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{client.user_email || "No email"}</span>
                </div>
                <AdminPill label={client.plan_tier} tone={client.plan_tier === "pro" ? "accent" : client.plan_tier === "enterprise" ? "warning" : client.plan_tier === "trial" ? "warning" : "neutral"} />
                <AdminPill label={client.access_status.replaceAll("_", " ")} tone={accessTone(client.access_status)} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{formatCompactMoney(client.current_mrr)}</span>
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{formatDate(client.created_at)}</span>
                <Link href={`/admin/clients/${client.id}`} style={adminButtonStyle("secondary", { minHeight: "36px", padding: "0 10px" })}>Open client</Link>
              </AdminTableRow>
            ))}
          </AdminDataTable>
        ) : <AdminEmptyState title="No client workspaces yet" description="Client rows will appear once onboarding or workspace bootstrap has created tenant records." />}
      </AdminSectionCard>
    </div>
  );
}
