"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/types";
import {
  Sparkles,
  MessageCircle,
  Bell,
  TrendingUp,
  TrendingDown,
  RefreshCcw,
  Users,
  BriefcaseBusiness,
  Gavel,
  Megaphone,
  DollarSign,
  Activity,
  Clock3,
  PanelLeft,
  PieChart,
  BarChart3,
  Gauge,
  ListTodo,
} from "lucide-react";
import FinancePage from "./FinancePage";
import SalesPage from "./SalesPage";
import SupportPage from "./SupportPage";
import SupplyChainPage from "./SupplyChainPage";
import ProcurementPage from "./ProcurementPage";
import InsightsPage from "./InsightsPage";
import HRPage from "./HRPage";
import ProjectsPage from "./ProjectsPage";
import MarketplacePage from "./MarketplacePage";
import MarketingPage from "./MarketingPage";
import LegalPage from "./LegalPage";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { authFetch } from "@/lib/auth-fetch";
import { getClientWorkspaceId, hasClientWorkspaceId } from "@/lib/client-settings";
import { getUnreadNotificationCount } from "@/lib/notifications";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

interface Props {
  activeSection: Section;
  aiPanelOpen: boolean;
  onToggleAI: () => void;
  isMobile?: boolean;
  onToggleSidebar?: () => void;
}

type DashboardCard = {
  label: string;
  value: string;
  change: string;
  up: boolean;
  color: string;
};

type DashboardRow = {
  module: string;
  status: string;
  tasks_today: string;
  alerts: string;
  last_activity: string;
};

type ModuleOverviewVisualRow = {
  module: string;
  status: string;
  tasks: number;
  alerts: number;
  lastActivity: string;
  score: number | null;
};

type DashboardOverview = {
  cards: DashboardCard[];
  modules: DashboardRow[];
  generated_at: string;
};

type DashboardHeadlineItem = {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
};

type ModuleScore = {
  module: string;
  score: number;
  status: "Healthy" | "Warning" | "Critical";
  summary: string;
};

type PriorityAction = {
  title: string;
  owner: string;
  severity: "low" | "medium" | "high";
  detail: string;
};

type CashflowPoint = {
  month: string;
  income: number;
  expense: number;
  net: number;
};

type ActivityItem = {
  module: string;
  title: string;
  detail: string;
  at?: string | null;
  ago: string;
};

type DepartmentBreakdownItem = {
  department: string;
  headcount: number;
  payroll: number;
};

type FinanceMixItem = {
  category: string;
  amount: number;
  share_percent: number;
};

type DashboardCommandCenter = {
  overview: DashboardOverview;
  headline: DashboardHeadlineItem[];
  finance: {
    revenue_total: number;
    expense_total: number;
    net_total: number;
    revenue_month: number;
    expense_month: number;
    net_month: number;
    gross_margin_percent: number;
    pending_receivables: number;
    overdue_invoice_count: number;
    overdue_invoice_amount: number;
  };
  workforce: {
    active: number;
    on_leave: number;
    terminated: number;
    hires_last_30_days: number;
    average_salary: number;
    open_positions: number;
  };
  department_breakdown: DepartmentBreakdownItem[];
  operations: {
    projects_total: number;
    projects_active: number;
    projects_on_hold: number;
    projects_completed: number;
    projects_overdue: number;
    tasks_total: number;
    tasks_due_7_days: number;
    tasks_overdue: number;
    tasks_critical_priority: number;
    project_completion_percent: number;
  };
  marketing: {
    campaigns_active: number;
    pipeline_leads: number;
    opportunities: number;
    customers: number;
    spend: number;
    revenue: number;
    roas: number;
    cost_per_lead: number;
  };
  finance_mix: {
    income: FinanceMixItem[];
    expenses: FinanceMixItem[];
  };
  legal: {
    high_risk_contracts: number;
    expiring_contracts_30_days: number;
    open_compliance_tasks: number;
    overdue_compliance_tasks: number;
    review_due_documents: number;
  };
  module_scores: ModuleScore[];
  priority_actions: PriorityAction[];
  insights: string[];
  cashflow_trend: CashflowPoint[];
  recent_activity: ActivityItem[];
  generated_at: string;
};

type NotificationFeedItem = {
  id: number;
};

type DataShape = {
  title: string;
  subtitle: string;
  cards: DashboardCard[];
  table: { columns: string[]; rows: Record<string, string>[] };
};

const GENERIC = (title: string, subtitle: string): DataShape => ({
  title,
  subtitle,
  cards: [
    { label: "Total Items", value: "—", change: "—", up: true, color: "var(--accent)" },
    { label: "Active", value: "—", change: "—", up: true, color: "#34d399" },
    { label: "Pending", value: "—", change: "—", up: false, color: "#fbbf24" },
    { label: "Completed", value: "—", change: "—", up: true, color: "#60a5fa" },
  ],
  table: {
    columns: ["ID", "Name", "Status", "Date", "Actions"],
    rows: [{ id: "—", name: "No data yet", status: "—", date: "—", actions: "—" }],
  },
});

const DATA: Record<string, DataShape> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Business overview across all modules",
    cards: [
      { label: "Total Revenue", value: "—", change: "—", up: true, color: "#34d399" },
      { label: "Net Profit", value: "—", change: "—", up: true, color: "#60a5fa" },
      { label: "Active Employees", value: "—", change: "—", up: true, color: "#a78bfa" },
      { label: "Active Projects", value: "—", change: "—", up: true, color: "#fbbf24" },
    ],
    table: {
      columns: ["Module", "Status", "Tasks Today", "Alerts", "Last Activity"],
      rows: [{ module: "No data yet", status: "—", tasks: "—", alerts: "—", last: "—" }],
    },
  },
  sales: GENERIC("Sales & CRM", "Pipeline, deals, and revenue forecasting"),
  support: GENERIC("Customer Support", "Tickets, resolutions and knowledge base"),
  legal: GENERIC("Legal & Compliance", "Contracts, compliance and risk management"),
  marketing: GENERIC("Marketing", "Campaigns, content and performance analytics"),
  supply_chain: GENERIC("Supply Chain", "Inventory, vendors and logistics"),
  procurement: GENERIC("Procurement", "Purchase orders, vendors and approvals"),
  insights: GENERIC("Insights & BI", "Cross-module analytics and reporting"),
  settings: GENERIC("Settings", "Account, workspace and preferences"),
  marketplace: GENERIC("Marketplace", "Integrations and add-ons"),
};

const STATUS_COLORS: Record<string, string> = {
  Healthy: "#34d399",
  Warning: "#fbbf24",
  Critical: "#f87171",
  Active: "#34d399",
  Pending: "#fbbf24",
  Paid: "#34d399",
  Received: "#34d399",
  high: "#f87171",
  medium: "#fbbf24",
  low: "#34d399",
};

const SECTION_TITLES: Partial<Record<Section, { title: string; subtitle: string }>> = {
  dashboard: { title: "Dashboard", subtitle: "Executive command center for your company" },
  finance: { title: "Finance", subtitle: "Transactions, P&L, invoices and cash flow" },
  sales: { title: "Sales", subtitle: "Products, sold orders, inventory and lifecycle reporting" },
  hr: { title: "Human Resources", subtitle: "Employees, roles, hiring and performance" },
  projects: { title: "Projects", subtitle: "Kanban boards, tasks and team collaboration" },
  marketing: { title: "Marketing", subtitle: "Campaigns, content, leads, attribution and benchmark analytics" },
  support: { title: "Support", subtitle: "Customer tickets, SLA operations and service quality" },
  supply_chain: { title: "Supply Chain", subtitle: "Inventory flow, logistics and fulfillment control" },
  procurement: { title: "Procurement", subtitle: "Purchase request lifecycle, spend and approvals" },
  insights: { title: "Insights", subtitle: "Cross-module reporting, analytics and performance intelligence" },
  settings: { title: "Settings", subtitle: "Account, workspace and preferences" },
  marketplace: { title: "Marketplace", subtitle: "Integrations and add-ons" },
  legal: { title: "Legal", subtitle: "Legal research, contracts and compliance workflows" },
};

const toneStyles: Record<DashboardHeadlineItem["tone"], { fg: string; bg: string; border: string }> = {
  success: {
    fg: "#34d399",
    bg: "color-mix(in srgb, #34d399 12%, var(--bg-surface))",
    border: "color-mix(in srgb, #34d399 30%, var(--border-default))",
  },
  warning: {
    fg: "#fbbf24",
    bg: "color-mix(in srgb, #fbbf24 12%, var(--bg-surface))",
    border: "color-mix(in srgb, #fbbf24 30%, var(--border-default))",
  },
  danger: {
    fg: "#f87171",
    bg: "color-mix(in srgb, #f87171 12%, var(--bg-surface))",
    border: "color-mix(in srgb, #f87171 30%, var(--border-default))",
  },
  info: {
    fg: "#60a5fa",
    bg: "color-mix(in srgb, #60a5fa 12%, var(--bg-surface))",
    border: "color-mix(in srgb, #60a5fa 30%, var(--border-default))",
  },
};

const MODULE_STATUS_STYLE: Record<string, { color: string; soft: string; border: string }> = {
  Healthy: {
    color: "#34d399",
    soft: "color-mix(in srgb, #34d399 14%, var(--bg-surface))",
    border: "color-mix(in srgb, #34d399 34%, var(--border-default))",
  },
  Warning: {
    color: "#fbbf24",
    soft: "color-mix(in srgb, #fbbf24 14%, var(--bg-surface))",
    border: "color-mix(in srgb, #fbbf24 34%, var(--border-default))",
  },
  Critical: {
    color: "#f87171",
    soft: "color-mix(in srgb, #f87171 14%, var(--bg-surface))",
    border: "color-mix(in srgb, #f87171 34%, var(--border-default))",
  },
  default: {
    color: "var(--text-subtle)",
    soft: "var(--bg-elevated)",
    border: "var(--border-soft)",
  },
};

function parseMetricCount(value: string) {
  const cleaned = String(value || "").replace(/[^\d-]/g, "");
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeModuleStatus(status: string) {
  const value = status.trim().toLowerCase();
  if (value.includes("healthy") || value.includes("active") || value === "ok") return "Healthy";
  if (value.includes("critical") || value.includes("high")) return "Critical";
  if (value.includes("warning") || value.includes("risk") || value.includes("pending")) return "Warning";
  return "default";
}

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function Dashboard({
  activeSection,
  aiPanelOpen,
  onToggleAI,
  isMobile = false,
  onToggleSidebar,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const data = DATA[activeSection] ?? DATA.dashboard;
  const overrideTitle = SECTION_TITLES[activeSection];
  const sectionTitle = t(`dashboard.sectionTitles.${activeSection}.title`, {}, overrideTitle?.title ?? data.title);
  const sectionSubtitle = t(
    `dashboard.sectionTitles.${activeSection}.subtitle`,
    {},
    overrideTitle?.subtitle ?? data.subtitle,
  );

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [commandCenter, setCommandCenter] = useState<DashboardCommandCenter | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const dashboardHasData = Boolean(commandCenter || overview);
  const showInitialDashboardLoading =
    activeSection === "dashboard" && !dashboardHasData && !dashboardError;

  const loadDashboard = useCallback(async () => {
    if (!hasClientWorkspaceId()) {
      setOverview(null);
      setCommandCenter(null);
      setDashboardError("Client workspace is not ready yet.");
      setDashboardLoading(false);
      return;
    }
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const workspaceId = getClientWorkspaceId();
      const [overviewRes, commandRes] = await Promise.all([
        authFetch(`${API}/dashboard/overview?workspace_id=${encodeURIComponent(workspaceId)}`),
        authFetch(`${API}/dashboard/command-center?workspace_id=${encodeURIComponent(workspaceId)}`),
      ]);

      if (!overviewRes.ok && !commandRes.ok) {
        const payload = await commandRes.json().catch(() => null);
        setDashboardError(payload?.detail || t("dashboard.failedLoadCompany"));
        setOverview(null);
        setCommandCenter(null);
        return;
      }

      if (overviewRes.ok) {
        setOverview((await overviewRes.json()) as DashboardOverview);
      } else {
        setOverview(null);
      }

      if (commandRes.ok) {
        setCommandCenter((await commandRes.json()) as DashboardCommandCenter);
      } else {
        setCommandCenter(null);
        if (!overviewRes.ok) {
          setDashboardError(t("dashboard.failedLoadCommandCenter"));
        }
      }
    } catch (e) {
      console.error("Failed to load dashboard", e);
      setDashboardError(t("dashboard.backendUnavailable"));
      setOverview(null);
      setCommandCenter(null);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadUnreadNotifications = useCallback(async () => {
    if (!hasClientWorkspaceId()) {
      setUnreadCount(0);
      return;
    }
    try {
      const workspaceId = getClientWorkspaceId();
      const res = await authFetch(
        `${API}/notifications?workspace_id=${encodeURIComponent(workspaceId)}&limit=100`
      );
      if (!res.ok) {
        setUnreadCount(0);
        return;
      }
      const payload = (await res.json()) as NotificationFeedItem[];
      const ids = payload.map((item) => item.id);
      setUnreadCount(getUnreadNotificationCount(ids));
    } catch {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    if (activeSection !== "dashboard") return;
    void loadDashboard();
  }, [activeSection, loadDashboard]);

  useEffect(() => {
    void loadUnreadNotifications();

    const onFocus = () => {
      void loadUnreadNotifications();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadUnreadNotifications();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadUnreadNotifications]);

  return (
    <div className="dashboard-shell" style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-canvas)" }}>
      <div
        className="dashboard-topbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: "56px",
          flexShrink: 0,
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div className="dashboard-title-block" style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          {isMobile && onToggleSidebar ? (
            <button
              onClick={onToggleSidebar}
              title={t("dashboard.openMenu")}
              aria-label={t("dashboard.openMenu")}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "9px",
                border: "1px solid var(--border-default)",
                background: "var(--bg-elevated)",
                color: "var(--text-muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <PanelLeft size={14} />
            </button>
          ) : null}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
              {sectionTitle}
            </h1>
            <p className="dashboard-title-subtitle" style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "1px" }}>
              {sectionSubtitle}
            </p>
          </div>
        </div>
        <div className="dashboard-topbar-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {activeSection === "dashboard" && (
            <button
              onClick={() => void loadDashboard()}
              className="dashboard-btn-refresh"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 12px",
                borderRadius: "9px",
                cursor: "pointer",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                color: "var(--text-muted)",
                fontSize: "12px",
                whiteSpace: "nowrap",
              }}
            >
              <RefreshCcw size={12} />
              <span className="dashboard-btn-label">{dashboardLoading ? t("dashboard.loading") : t("dashboard.refresh")}</span>
            </button>
          )}
          <button
            onClick={onToggleAI}
            className="dashboard-btn-ai"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 14px",
              borderRadius: "10px",
              cursor: "pointer",
              background: aiPanelOpen
                ? "color-mix(in srgb, var(--accent) 22%, transparent)"
                : "var(--accent-soft)",
              border: aiPanelOpen
                ? "1px solid color-mix(in srgb, var(--accent) 48%, var(--border-default))"
                : "1px solid color-mix(in srgb, var(--accent) 30%, var(--border-default))",
              color: "var(--accent)",
              fontSize: "13px",
              fontWeight: 500,
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            <Sparkles size={14} />
            <span className="dashboard-btn-label">{t("dashboard.askAi")}</span>
          </button>
          <button
            onClick={() => router.push("/notifications")}
            className="dashboard-btn-notify"
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "9px",
              background: "var(--bg-elevated)",
              border: unreadCount > 0 ? "1px solid var(--accent)" : "1px solid var(--border-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
            }}
            title={t("sidebar.notifications")}
          >
            <Bell size={14} color={unreadCount > 0 ? "var(--accent)" : "var(--text-subtle)"} />
            {unreadCount > 0 ? (
              <div
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  minWidth: "16px",
                  height: "16px",
                  padding: "0 4px",
                  borderRadius: "999px",
                  background: "var(--accent)",
                  color: "white",
                  fontSize: "10px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </div>
            ) : null}
          </button>
        </div>
      </div>

      <div className="dashboard-content-scroll" style={{ flex: 1, overflowY: "auto" }}>
        {activeSection === "finance" ? (
          <FinancePage />
        ) : activeSection === "sales" ? (
          <SalesPage />
        ) : activeSection === "support" ? (
          <SupportPage />
        ) : activeSection === "supply_chain" ? (
          <SupplyChainPage />
        ) : activeSection === "procurement" ? (
          <ProcurementPage />
        ) : activeSection === "insights" ? (
          <InsightsPage />
        ) : activeSection === "hr" ? (
          <HRPage />
        ) : activeSection === "projects" ? (
          <ProjectsPage />
        ) : activeSection === "marketing" ? (
          <MarketingPage />
        ) : activeSection === "legal" ? (
          <LegalPage />
        ) : activeSection === "marketplace" ? (
          <MarketplacePage />
        ) : activeSection === "dashboard" ? (
          showInitialDashboardLoading ? (
            <DashboardLoadingPanel />
          ) : commandCenter ? (
            <DashboardCommandCenterPanel data={commandCenter} error={dashboardError} />
          ) : overview ? (
            <DashboardOverviewPanel overview={overview} fallback={data} error={dashboardError} />
          ) : dashboardError ? (
            <DashboardOverviewPanel overview={null} fallback={data} error={dashboardError} />
          ) : (
            <DashboardLoadingPanel />
          )
        ) : (
          <GenericPanel activeSection={activeSection} data={data} />
        )}
      </div>
    </div>
  );
}

function DashboardCommandCenterPanel({
  data,
  error,
}: {
  data: DashboardCommandCenter;
  error?: string;
}) {
  const { t } = useI18n();
  const openJudithWorkspace = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("benela:open-internal-chat", {
        detail: { scope: "judith" },
      })
    );
  }, []);
  const maxAbsNet = useMemo(() => {
    const values = data.cashflow_trend.map((point) => Math.abs(point.net));
    return Math.max(...values, 1);
  }, [data.cashflow_trend]);
  const maxDeptHeadcount = useMemo(() => {
    const values = data.department_breakdown.map((item) => item.headcount);
    return Math.max(...values, 1);
  }, [data.department_breakdown]);
  const maxFinanceMixAmount = useMemo(() => {
    const values = [...data.finance_mix.income, ...data.finance_mix.expenses].map((item) => item.amount);
    return Math.max(...values, 1);
  }, [data.finance_mix.expenses, data.finance_mix.income]);
  const generatedAtLabel = useMemo(() => {
    if (!data.generated_at) return "—";
    const ts = new Date(data.generated_at);
    return Number.isNaN(ts.getTime()) ? "—" : ts.toLocaleString();
  }, [data.generated_at]);
  const healthyModules = useMemo(
    () => data.module_scores.filter((item) => item.status === "Healthy").length,
    [data.module_scores]
  );

  const moduleVisualRows = useMemo<ModuleOverviewVisualRow[]>(() => {
    const scoreMap = new Map(
      data.module_scores.map((score) => [score.module.trim().toLowerCase(), score.score])
    );
    return data.overview.modules.map((row) => {
      const moduleKey = row.module.trim().toLowerCase();
      return {
        module: row.module,
        status: row.status,
        tasks: parseMetricCount(row.tasks_today),
        alerts: parseMetricCount(row.alerts),
        lastActivity: row.last_activity,
        score: scoreMap.get(moduleKey) ?? null,
      };
    });
  }, [data.overview.modules, data.module_scores]);

  const moduleRows = moduleVisualRows.map((row) => ({
    module: row.module,
    status: row.status,
    tasks: String(row.tasks),
    alerts: String(row.alerts),
    last: row.lastActivity,
  }));

  return (
    <div style={{ padding: "24px", display: "grid", gap: "12px" }}>
      {error ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid var(--danger-soft-border)",
            background: "var(--danger-soft-bg)",
            color: "var(--danger)",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
        {data.headline.map((item, index) => {
          const tone = toneStyles[item.tone] || toneStyles.info;
          return (
            <div
              key={`${item.label}-${index}`}
              style={{
                border: `1px solid ${tone.border}`,
                background: tone.bg,
                borderRadius: "12px",
                padding: "12px 14px",
                display: "grid",
                gap: "6px",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{item.label}</span>
              <span style={{ fontSize: "24px", fontWeight: 600, color: tone.fg, lineHeight: 1 }}>{item.value}</span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          flexWrap: "wrap",
          border: "1px solid var(--border-soft)",
          borderRadius: "10px",
          padding: "8px 12px",
          background: "var(--bg-surface)",
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
          {t("dashboard.dataRefreshed")}: <span style={{ color: "var(--text-primary)" }}>{generatedAtLabel}</span>
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
          {t("dashboard.moduleHealth")}:{" "}
          <span style={{ color: "var(--success)" }}>{healthyModules}</span> {t("dashboard.healthy")} /{" "}
          <span style={{ color: "var(--text-primary)" }}>{data.module_scores.length}</span> {t("dashboard.tracked")}
        </span>
      </div>

      <div
        style={{
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          background: "var(--bg-surface)",
          padding: "14px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
              <Sparkles size={14} color="var(--accent)" />
              {t("dashboard.judithCommandCenterTitle")}
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-subtle)", maxWidth: "760px", lineHeight: 1.55 }}>
              {t("dashboard.judithCommandCenterBody")}
            </span>
          </div>
          <button
            type="button"
            onClick={openJudithWorkspace}
            style={{
              height: "34px",
              padding: "0 14px",
              borderRadius: "10px",
              border: "1px solid color-mix(in srgb, var(--accent) 40%, var(--border-default))",
              background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 20%, var(--bg-surface)), color-mix(in srgb, var(--accent-2) 24%, var(--bg-surface)))",
              color: "var(--text-primary)",
              fontSize: "12px",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              cursor: "pointer",
            }}
          >
            <MessageCircle size={13} />
            {t("dashboard.openJudith")}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "9px" }}>
          <MetricRow
            icon={<ListTodo size={13} color="var(--accent)" />}
            label={t("dashboard.openTasks")}
            value={t("dashboard.activeTasksValue", { count: Math.max(0, data.operations.tasks_total - data.operations.tasks_overdue) })}
          />
          <MetricRow
            icon={<Clock3 size={13} color="#fbbf24" />}
            label={t("dashboard.dueIn7Days")}
            value={t("dashboard.scheduledTasksValue", { count: data.operations.tasks_due_7_days })}
          />
          <MetricRow
            icon={<Bell size={13} color="#f87171" />}
            label={t("dashboard.overdue")}
            value={t("dashboard.needActionTasksValue", { count: data.operations.tasks_overdue })}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "12px" }}>
        <Card title={t("dashboard.executiveSnapshotTitle")} subtitle={t("dashboard.executiveSnapshotSubtitle")}>
          <div style={{ display: "grid", gap: "8px" }}>
            <MetricRow
              icon={<DollarSign size={13} color="#34d399" />}
              label={t("dashboard.financeLabel")}
              value={t("dashboard.financeSummary", {
                income: formatMoney(data.finance.revenue_month),
                expense: formatMoney(data.finance.expense_month),
                margin: data.finance.gross_margin_percent,
              })}
            />
            <MetricRow
              icon={<Users size={13} color="#60a5fa" />}
              label={t("dashboard.peopleLabel")}
              value={t("dashboard.peopleSummary", {
                active: data.workforce.active,
                openRoles: data.workforce.open_positions,
                hires: data.workforce.hires_last_30_days,
              })}
            />
            <MetricRow
              icon={<BriefcaseBusiness size={13} color="#fbbf24" />}
              label={t("dashboard.operationsLabel")}
              value={t("dashboard.operationsSummary", {
                projects: data.operations.projects_active,
                overdue: data.operations.tasks_overdue,
                completion: data.operations.project_completion_percent,
              })}
            />
            <MetricRow
              icon={<Gavel size={13} color="#f87171" />}
              label={t("dashboard.legalLabel")}
              value={t("dashboard.legalSummary", {
                highRisk: data.legal.high_risk_contracts,
                overdue: data.legal.overdue_compliance_tasks,
              })}
            />
            <MetricRow
              icon={<Megaphone size={13} color="#a78bfa" />}
              label={t("dashboard.growthLabel")}
              value={t("dashboard.growthSummary", {
                campaigns: data.marketing.campaigns_active,
                roas: data.marketing.roas,
                cpl: formatMoney(data.marketing.cost_per_lead),
              })}
            />
          </div>
        </Card>

        <Card title={t("dashboard.moduleHealthTitle")} subtitle={t("dashboard.moduleHealthSubtitle")}>
          <div style={{ display: "grid", gap: "10px" }}>
            {data.module_scores.map((score) => {
              const statusColor = STATUS_COLORS[score.status] || "var(--text-muted)";
              const statusLabel =
                score.status === "Healthy"
                  ? t("dashboard.healthy")
                  : score.status === "Warning"
                    ? t("dashboard.warning")
                    : score.status === "Critical"
                      ? t("dashboard.critical")
                      : score.status;
              return (
                <div key={score.module} style={{ display: "grid", gap: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>{score.module}</span>
                    <span style={{ fontSize: "11px", color: statusColor }}>{score.score}/100 · {statusLabel}</span>
                  </div>
                  <div style={{ height: "7px", borderRadius: "999px", background: "var(--bg-panel)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(score.score, 100))}%`,
                        height: "100%",
                        borderRadius: "999px",
                        background: statusColor,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{score.summary}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "12px" }}>
        <Card title={t("dashboard.departmentFootprintTitle")} subtitle={t("dashboard.departmentFootprintSubtitle")}>
          <div style={{ display: "grid", gap: "8px" }}>
            {data.department_breakdown.length ? (
              data.department_breakdown.map((item) => (
                <div key={item.department} style={{ display: "grid", gap: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>{item.department}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                      {item.headcount} employees · {formatMoney(item.payroll)}
                    </span>
                  </div>
                  <div style={{ height: "7px", borderRadius: "999px", background: "var(--bg-panel)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.max(8, Math.round((item.headcount / maxDeptHeadcount) * 100))}%`,
                        height: "100%",
                        borderRadius: "999px",
                        background: "linear-gradient(90deg, #60a5fa, #34d399)",
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{t("dashboard.noWorkforceRecords")}</span>
            )}
          </div>
        </Card>

        <Card title={t("dashboard.revenueExpenseMixTitle")} subtitle={t("dashboard.revenueExpenseMixSubtitle")}>
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "11px", color: "var(--success)", fontWeight: 600 }}>{t("dashboard.revenueMix")}</span>
              {data.finance_mix.income.length ? (
                data.finance_mix.income.map((item) => (
                  <MixRow key={`income-${item.category}`} item={item} maxAmount={maxFinanceMixAmount} tone="income" />
                ))
              ) : (
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{t("dashboard.noIncomeTransactions")}</span>
              )}
            </div>
            <div style={{ borderTop: "1px solid var(--border-soft)" }} />
            <div style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "11px", color: "var(--danger)", fontWeight: 600 }}>{t("dashboard.expenseMix")}</span>
              {data.finance_mix.expenses.length ? (
                data.finance_mix.expenses.map((item) => (
                  <MixRow key={`expense-${item.category}`} item={item} maxAmount={maxFinanceMixAmount} tone="expense" />
                ))
              ) : (
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{t("dashboard.noExpenseTransactions")}</span>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "12px" }}>
        <Card title={t("dashboard.cashflowTrendTitle")} subtitle={t("dashboard.cashflowTrendSubtitle")}>
          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "end", gap: "8px", minHeight: "120px" }}>
              {data.cashflow_trend.map((point) => {
                const normalized = Math.max(8, Math.round((Math.abs(point.net) / maxAbsNet) * 90));
                const positive = point.net >= 0;
                return (
                  <div key={point.month} style={{ flex: 1, display: "grid", justifyItems: "center", gap: "6px" }}>
                    <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "end", minHeight: "96px" }}>
                      <div
                        style={{
                          width: "75%",
                          height: `${normalized}px`,
                          borderRadius: "8px",
                          background: positive
                            ? "linear-gradient(180deg, #34d399, color-mix(in srgb, #34d399 35%, #0b1118))"
                            : "linear-gradient(180deg, #f87171, color-mix(in srgb, #f87171 35%, #0b1118))",
                          opacity: 0.92,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "10px", color: "var(--text-quiet)" }}>{point.month.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
              {data.cashflow_trend.slice(-3).map((point) => (
                <div key={`${point.month}-meta`} style={{ border: "1px solid var(--border-soft)", borderRadius: "9px", padding: "8px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-quiet)", marginBottom: "4px" }}>{point.month}</div>
                  <div style={{ fontSize: "12px", color: "var(--success)" }}>In {formatMoney(point.income)}</div>
                  <div style={{ fontSize: "12px", color: "var(--danger)" }}>Out {formatMoney(point.expense)}</div>
                  <div style={{ fontSize: "12px", color: point.net >= 0 ? "var(--success)" : "var(--danger)" }}>
                    Net {formatMoney(point.net)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title={t("dashboard.priorityActionsTitle")} subtitle={t("dashboard.priorityActionsSubtitle")}>
          <div style={{ display: "grid", gap: "8px" }}>
            {data.priority_actions.map((action, idx) => {
              const badgeColor = STATUS_COLORS[action.severity] || "var(--text-muted)";
              return (
                <div
                  key={`${action.title}-${idx}`}
                  style={{
                    border: "1px solid var(--border-soft)",
                    borderRadius: "10px",
                    padding: "9px 10px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>{action.title}</span>
                    <span
                      style={{
                        fontSize: "10px",
                        color: badgeColor,
                        border: `1px solid ${badgeColor}55`,
                        borderRadius: "999px",
                        padding: "1px 7px",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {action.severity}
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{action.detail}</span>
                  <span style={{ fontSize: "10px", color: "var(--text-quiet)" }}>{t("dashboard.ownerLabel")}: {action.owner}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "12px" }}>
        <Card title={t("dashboard.strategicInsightsTitle")} subtitle={t("dashboard.strategicInsightsSubtitle")}>
          <div style={{ display: "grid", gap: "8px" }}>
            {data.insights.map((insight, idx) => (
              <div
                key={`${insight}-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  border: "1px solid var(--border-soft)",
                  borderRadius: "10px",
                  padding: "8px 10px",
                }}
              >
                <Activity size={12} color="var(--accent)" style={{ marginTop: "2px", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.5 }}>{insight}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t("dashboard.recentActivityTitle")} subtitle={t("dashboard.recentActivitySubtitle")}>
          <div style={{ display: "grid", gap: "6px", maxHeight: "280px", overflowY: "auto", paddingRight: "2px" }}>
            {data.recent_activity.length ? (
              data.recent_activity.map((event, idx) => (
                <div
                  key={`${event.module}-${event.title}-${idx}`}
                  style={{
                    border: "1px solid var(--border-soft)",
                    borderRadius: "10px",
                    padding: "8px 10px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--accent)" }}>{event.module}</span>
                    <span style={{ fontSize: "10px", color: "var(--text-quiet)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Clock3 size={10} />
                      {event.ago}
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>{event.title}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{event.detail}</span>
                </div>
              ))
            ) : (
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{t("dashboard.noActivityRecorded")}</span>
            )}
          </div>
        </Card>
      </div>

      <ModuleOverviewVisuals rows={moduleVisualRows} />

      <DataTable
        title={t("dashboard.moduleOverview")}
        columns={[
          t("dashboard.moduleOverviewColumns.module"),
          t("dashboard.moduleOverviewColumns.status"),
          t("dashboard.moduleOverviewColumns.tasksToday"),
          t("dashboard.moduleOverviewColumns.alerts"),
          t("dashboard.moduleOverviewColumns.lastActivity"),
        ]}
        rows={moduleRows}
      />
    </div>
  );
}

function DashboardLoadingPanel() {
  const { t } = useI18n();
  return (
    <div style={{ padding: "24px", display: "grid", gap: "12px" }}>
      <div
        style={{
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "12px 14px",
          background: "var(--bg-surface)",
          color: "var(--text-subtle)",
          fontSize: "12px",
        }}
      >
        {t("dashboard.loadingCompany", {}, "Loading company dashboard...")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            style={{
              height: "96px",
              borderRadius: "12px",
              border: "1px solid var(--border-default)",
              background: "color-mix(in srgb, var(--bg-elevated) 86%, var(--bg-surface))",
            }}
          />
        ))}
      </div>
      <div
        style={{
          height: "300px",
          borderRadius: "12px",
          border: "1px solid var(--border-default)",
          background: "color-mix(in srgb, var(--bg-elevated) 86%, var(--bg-surface))",
        }}
      />
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)", display: "grid", gap: "4px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
        <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{subtitle}</span>
      </div>
      <div style={{ padding: "12px" }}>{children}</div>
    </div>
  );
}

function MetricRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div style={{ border: "1px solid var(--border-soft)", borderRadius: "9px", padding: "8px 10px", display: "grid", gap: "3px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {icon}
        <span style={{ fontSize: "11px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </span>
      </div>
      <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function DashboardOverviewPanel({
  overview,
  fallback,
  error,
}: {
  overview: DashboardOverview | null;
  fallback: DataShape;
  error?: string;
}) {
  const { t } = useI18n();
  const cards = overview?.cards?.length ? overview.cards : fallback.cards;
  const rows = overview?.modules?.length
    ? overview.modules.map((r) => ({
        module: r.module,
        status: r.status,
        tasks: r.tasks_today,
        alerts: r.alerts,
        last: r.last_activity,
      }))
    : fallback.table.rows;
  const moduleVisualRows = useMemo<ModuleOverviewVisualRow[]>(() => {
    return rows.map((row) => ({
      module: row["module"] || "—",
      status: row["status"] || "—",
      tasks: parseMetricCount(row["tasks"] || "0"),
      alerts: parseMetricCount(row["alerts"] || "0"),
      lastActivity: row["last"] || "—",
      score: null,
    }));
  }, [rows]);

  return (
    <div style={{ padding: "24px" }}>
      {error ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid var(--danger-soft-border)",
            background: "var(--danger-soft-bg)",
            color: "var(--danger)",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        {cards.map((card, i) => (
          <div
            key={i}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "12px",
              padding: "18px 20px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginBottom: "10px", fontWeight: 500 }}>{card.label}</p>
            <p style={{ fontSize: "28px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1, marginBottom: "8px" }}>{card.value}</p>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {card.up ? <TrendingUp size={11} color="var(--success)" /> : <TrendingDown size={11} color="var(--danger)" />}
              <span style={{ fontSize: "11px", color: card.up ? "var(--success)" : "var(--danger)" }}>{card.change}</span>
              <span style={{ fontSize: "11px", color: "var(--text-quiet)" }}>{t("dashboard.vsLastMonth", {}, "vs last month")}</span>
            </div>
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "1px",
                background: `linear-gradient(90deg, transparent, ${card.color}40, transparent)`,
              }}
            />
          </div>
        ))}
      </div>

      <ModuleOverviewVisuals rows={moduleVisualRows} />

      <DataTable
        title={t("dashboard.moduleOverview")}
        columns={[
          t("dashboard.moduleOverviewColumns.module"),
          t("dashboard.moduleOverviewColumns.status"),
          t("dashboard.moduleOverviewColumns.tasksToday"),
          t("dashboard.moduleOverviewColumns.alerts"),
          t("dashboard.moduleOverviewColumns.lastActivity"),
        ]}
        rows={rows}
      />
    </div>
  );
}

function GenericPanel({
  activeSection,
  data,
}: {
  activeSection: Section;
  data: DataShape;
}) {
  const { t } = useI18n();
  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        {data.cards.map((card, i) => (
          <div
            key={i}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "12px",
              padding: "18px 20px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginBottom: "10px", fontWeight: 500 }}>{card.label}</p>
            <p style={{ fontSize: "28px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1, marginBottom: "8px" }}>{card.value}</p>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {card.up ? <TrendingUp size={11} color="var(--success)" /> : <TrendingDown size={11} color="var(--danger)" />}
              <span style={{ fontSize: "11px", color: card.up ? "var(--success)" : "var(--danger)" }}>{card.change}</span>
              <span style={{ fontSize: "11px", color: "var(--text-quiet)" }}>{t("dashboard.vsLastMonth", {}, "vs last month")}</span>
            </div>
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "1px",
                background: `linear-gradient(90deg, transparent, ${card.color}40, transparent)`,
              }}
            />
          </div>
        ))}
      </div>

      <DataTable
        title={activeSection === "dashboard" ? t("dashboard.moduleOverview") : t("dashboard.records")}
        columns={data.table.columns}
        rows={data.table.rows}
      />
    </div>
  );
}

function ModuleOverviewVisuals({
  rows,
}: {
  rows: ModuleOverviewVisualRow[];
}) {
  const { t } = useI18n();
  const activeRows = rows.filter(
    (row) =>
      row.module &&
      row.module !== "—" &&
      row.module.toLowerCase() !== "no data yet"
  );

  if (!activeRows.length) return null;

  const healthCount = activeRows.filter((row) => normalizeModuleStatus(row.status) === "Healthy").length;
  const warningCount = activeRows.filter((row) => normalizeModuleStatus(row.status) === "Warning").length;
  const criticalCount = activeRows.filter((row) => normalizeModuleStatus(row.status) === "Critical").length;
  const totalModules = activeRows.length;
  const totalTasks = activeRows.reduce((sum, row) => sum + row.tasks, 0);
  const totalAlerts = activeRows.reduce((sum, row) => sum + row.alerts, 0);
  const maxPressure = Math.max(
    ...activeRows.map((row) => row.tasks + row.alerts * 2),
    1
  );
  const maxStack = Math.max(
    ...activeRows.map((row) => row.tasks + row.alerts),
    1
  );

  const healthyPct = Math.round((healthCount / totalModules) * 100);
  const warningPct = Math.round((warningCount / totalModules) * 100);
  const criticalPct = Math.max(0, 100 - healthyPct - warningPct);
  const donutFill = `conic-gradient(
    #34d399 0 ${healthyPct}%,
    #fbbf24 ${healthyPct}% ${healthyPct + warningPct}%,
    #f87171 ${healthyPct + warningPct}% ${healthyPct + warningPct + criticalPct}%,
    color-mix(in srgb, var(--border-soft) 58%, transparent) ${healthyPct + warningPct + criticalPct}% 100%
  )`;

  const pressureRows = [...activeRows].sort(
    (a, b) => b.tasks + b.alerts * 2 - (a.tasks + a.alerts * 2)
  );

  return (
    <div style={{ display: "grid", gap: "12px", marginBottom: "12px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "12px",
        }}
      >
        <Card
          title={t("dashboard.moduleHealthDistributionTitle")}
          subtitle={t("dashboard.moduleHealthDistributionSubtitle")}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
            <div style={{ position: "relative", width: "112px", height: "112px" }}>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  background: donutFill,
                  border: "1px solid var(--border-soft)",
                  padding: "12px",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-soft)",
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                  }}
                >
                  <span style={{ fontSize: "19px", fontWeight: 700, lineHeight: 1 }}>
                    {totalModules}
                  </span>
                </div>
              </div>
              <div
                style={{
                  position: "absolute",
                  right: "-6px",
                  bottom: "-6px",
                  width: "26px",
                  height: "26px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-soft)",
                  background: "var(--bg-elevated)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <PieChart size={13} color="var(--accent)" />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: "8px",
                flex: 1,
                minWidth: "170px",
              }}
            >
              <LegendItem label={t("dashboard.healthy")} count={healthCount} color="#34d399" />
              <LegendItem label={t("dashboard.warning")} count={warningCount} color="#fbbf24" />
              <LegendItem label={t("dashboard.critical")} count={criticalCount} color="#f87171" />
              <div
                style={{
                  marginTop: "2px",
                  paddingTop: "8px",
                  borderTop: "1px solid var(--border-soft)",
                  display: "grid",
                  gap: "4px",
                  fontSize: "11px",
                  color: "var(--text-subtle)",
                }}
              >
                <span>{t("dashboard.tasksOpenSummary", { count: totalTasks })}</span>
                <span>{t("dashboard.alertsOpenSummary", { count: totalAlerts })}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card
          title={t("dashboard.operationalPressureMapTitle")}
          subtitle={t("dashboard.operationalPressureMapSubtitle")}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            {pressureRows.map((row) => {
              const normalizedStatus = normalizeModuleStatus(row.status);
              const statusStyle =
                MODULE_STATUS_STYLE[normalizedStatus] || MODULE_STATUS_STYLE.default;
              const pressure = row.tasks + row.alerts * 2;
              const width = Math.max(
                pressure > 0 ? 10 : 6,
                Math.round((pressure / maxPressure) * 100)
              );
              return (
                <div key={`pressure-${row.module}`} style={{ display: "grid", gap: "4px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--text-primary)",
                        fontWeight: 600,
                      }}
                    >
                      {row.module}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "2px 7px",
                        borderRadius: "999px",
                        border: `1px solid ${statusStyle.border}`,
                        background: statusStyle.soft,
                        color: statusStyle.color,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Gauge size={10} />
                      {t("dashboard.pressureLoad", { count: pressure })}
                    </span>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      borderRadius: "999px",
                      background: "var(--bg-panel)",
                      border: "1px solid var(--border-soft)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${width}%`,
                        height: "100%",
                        borderRadius: "999px",
                        background: `linear-gradient(90deg, color-mix(in srgb, ${statusStyle.color} 86%, #ffffff 14%), ${statusStyle.color})`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card
        title={t("dashboard.tasksVsAlertsMatrixTitle")}
        subtitle={t("dashboard.tasksVsAlertsMatrixSubtitle")}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-subtle)" }}>
              <BarChart3 size={12} color="var(--accent)" />
              {t("dashboard.stackedLoadLanes")}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "10px", color: "var(--text-quiet)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#34d399" }} />
                {t("dashboard.moduleOverviewColumns.tasksToday")}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f87171" }} />
                {t("dashboard.moduleOverviewColumns.alerts")}
              </span>
            </div>
          </div>

          {activeRows.map((row) => {
            const combined = row.tasks + row.alerts;
            const rowWidth = Math.max(
              combined > 0 ? 14 : 8,
              Math.round((combined / maxStack) * 100)
            );
            const tasksWidth = combined > 0 ? (row.tasks / combined) * 100 : 0;
            const alertsWidth = combined > 0 ? (row.alerts / combined) * 100 : 0;
            return (
              <div
                key={`matrix-${row.module}`}
                style={{
                  border: "1px solid var(--border-soft)",
                  borderRadius: "10px",
                  padding: "8px 10px",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>
                    {row.module}
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--text-quiet)" }}>{row.lastActivity}</span>
                </div>
                <div
                  style={{
                    width: `${rowWidth}%`,
                    minWidth: "40px",
                    height: "10px",
                    borderRadius: "999px",
                    overflow: "hidden",
                    border: "1px solid var(--border-soft)",
                    background: "var(--bg-panel)",
                    display: "flex",
                  }}
                >
                  <div style={{ width: `${tasksWidth}%`, background: "#34d399" }} />
                  <div style={{ width: `${alertsWidth}%`, background: "#f87171" }} />
                </div>
                <div style={{ display: "inline-flex", gap: "8px", fontSize: "10px", color: "var(--text-subtle)" }}>
                  <span>{t("dashboard.tasksValue", { count: row.tasks })}</span>
                  <span>{t("dashboard.alertsValue", { count: row.alerts })}</span>
                  {row.score !== null ? <span>{t("dashboard.scoreValue", { count: row.score })}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function LegendItem({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        border: "1px solid var(--border-soft)",
        borderRadius: "9px",
        padding: "6px 8px",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          color: "var(--text-subtle)",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color }} />
        {label}
      </span>
      <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>{count}</span>
    </div>
  );
}

function DataTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: Record<string, string>[];
}) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: "var(--accent)" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
          padding: "10px 20px",
          borderBottom: "1px solid var(--border-soft)",
          background: "var(--bg-panel)",
        }}
      >
        {columns.map((col) => (
          <span
            key={col}
            style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--text-quiet)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontFamily: "monospace",
            }}
          >
            {col}
          </span>
        ))}
      </div>

      {rows.map((row, i) => {
        const vals = Object.values(row);
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
              padding: "13px 20px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--table-row-divider)" : "none",
              transition: "background 0.1s ease",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            {vals.map((val, j) => {
              const statusColor = STATUS_COLORS[val];
              return (
                <span key={j} style={{ fontSize: "13px", display: "flex", alignItems: "center" }}>
                  {statusColor ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 500,
                        background: `${statusColor}12`,
                        color: statusColor,
                        border: `1px solid ${statusColor}20`,
                      }}
                    >
                      <span
                        style={{
                          width: "5px",
                          height: "5px",
                          borderRadius: "50%",
                          background: statusColor,
                          flexShrink: 0,
                        }}
                      />
                      {val}
                    </span>
                  ) : (
                    <span style={{ color: j === 0 ? "var(--text-muted)" : "var(--text-subtle)" }}>{val}</span>
                  )}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function MixRow({
  item,
  maxAmount,
  tone,
}: {
  item: FinanceMixItem;
  maxAmount: number;
  tone: "income" | "expense";
}) {
  const color = tone === "income" ? "#34d399" : "#f87171";
  const width = Math.max(8, Math.round((item.amount / Math.max(maxAmount, 1)) * 100));

  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{item.category}</span>
        <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
          {formatMoney(item.amount)} · {item.share_percent}%
        </span>
      </div>
      <div style={{ height: "7px", borderRadius: "999px", background: "var(--bg-panel)", overflow: "hidden" }}>
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            borderRadius: "999px",
            background: color,
          }}
        />
      </div>
    </div>
  );
}
