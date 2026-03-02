"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/types";
import { Sparkles, Bell, TrendingUp, TrendingDown, RefreshCcw } from "lucide-react";
import FinancePage from "./FinancePage";
import HRPage from "./HRPage";
import ProjectsPage from "./ProjectsPage";
import MarketplacePage from "./MarketplacePage";
import { getClientWorkspaceId } from "@/lib/client-settings";
import { getUnreadNotificationCount } from "@/lib/notifications";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  activeSection: Section;
  aiPanelOpen: boolean;
  onToggleAI: () => void;
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

type DashboardOverview = {
  cards: DashboardCard[];
  modules: DashboardRow[];
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
};

const SECTION_TITLES: Partial<Record<Section, { title: string; subtitle: string }>> = {
  dashboard: { title: "Dashboard", subtitle: "Business overview across all modules" },
  finance: { title: "Finance", subtitle: "Transactions, P&L, invoices and cash flow" },
  hr: { title: "Human Resources", subtitle: "Employees, roles, hiring and performance" },
  projects: { title: "Projects", subtitle: "Kanban boards, tasks and team collaboration" },
  settings: { title: "Settings", subtitle: "Account, workspace and preferences" },
  marketplace: { title: "Marketplace", subtitle: "Integrations and add-ons" },
};

export default function Dashboard({ activeSection, aiPanelOpen, onToggleAI }: Props) {
  const router = useRouter();
  const data = DATA[activeSection] ?? DATA.dashboard;
  const overrideTitle = SECTION_TITLES[activeSection];

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const workspaceId = getClientWorkspaceId();
      const res = await fetch(
        `${API}/dashboard/overview?workspace_id=${encodeURIComponent(workspaceId)}`
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setOverviewError(payload?.detail || "Failed to load live dashboard data.");
        setOverview(null);
        return;
      }
      const payload = (await res.json()) as DashboardOverview;
      setOverview(payload);
    } catch (e) {
      console.error("Failed to load dashboard overview", e);
      setOverviewError("Could not connect to the backend service.");
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadUnreadNotifications = useCallback(async () => {
    try {
      const workspaceId = getClientWorkspaceId();
      const res = await fetch(
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
    const t = setTimeout(() => {
      void loadOverview();
    }, 0);
    return () => clearTimeout(t);
  }, [activeSection, loadOverview]);

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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-canvas)" }}>
      <div
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
        <div>
          <h1 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
            {overrideTitle?.title ?? data.title}
          </h1>
          <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "1px" }}>
            {overrideTitle?.subtitle ?? data.subtitle}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {activeSection === "dashboard" && (
            <button
              onClick={() => void loadOverview()}
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
              }}
            >
              <RefreshCcw size={12} />
              {overviewLoading ? "Loading..." : "Refresh"}
            </button>
          )}
          <button
            onClick={onToggleAI}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 14px",
              borderRadius: "10px",
              cursor: "pointer",
              background: aiPanelOpen ? "rgba(124,106,255,0.15)" : "rgba(124,106,255,0.08)",
              border: aiPanelOpen ? "1px solid rgba(124,106,255,0.4)" : "1px solid rgba(124,106,255,0.2)",
              color: "#a89aff",
              fontSize: "13px",
              fontWeight: 500,
              transition: "all 0.2s ease",
            }}
          >
            <Sparkles size={14} />
            Ask AI
          </button>
          <button
            onClick={() => router.push("/notifications")}
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
            title="Notifications"
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

      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeSection === "finance" ? (
          <FinancePage />
        ) : activeSection === "hr" ? (
          <HRPage />
        ) : activeSection === "projects" ? (
          <ProjectsPage />
        ) : activeSection === "marketplace" ? (
          <MarketplacePage />
        ) : activeSection === "dashboard" ? (
          <DashboardOverviewPanel overview={overview} fallback={data} error={overviewError} />
        ) : (
          <GenericPanel activeSection={activeSection} data={data} />
        )}
      </div>
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

  return (
    <div style={{ padding: "24px" }}>
      {error ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid rgba(248,113,113,0.25)",
            background: "rgba(248,113,113,0.08)",
            color: "#f87171",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
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
              {card.up ? <TrendingUp size={11} color="#34d399" /> : <TrendingDown size={11} color="#f87171" />}
              <span style={{ fontSize: "11px", color: card.up ? "#34d399" : "#f87171" }}>{card.change}</span>
              <span style={{ fontSize: "11px", color: "var(--text-quiet)" }}>vs last month</span>
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
        title="Module Overview"
        columns={["Module", "Status", "Tasks Today", "Alerts", "Last Activity"]}
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
  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
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
              {card.up ? <TrendingUp size={11} color="#34d399" /> : <TrendingDown size={11} color="#f87171" />}
              <span style={{ fontSize: "11px", color: card.up ? "#34d399" : "#f87171" }}>{card.change}</span>
              <span style={{ fontSize: "11px", color: "var(--text-quiet)" }}>vs last month</span>
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
        title={activeSection === "dashboard" ? "Module Overview" : "Records"}
        columns={data.table.columns}
        rows={data.table.rows}
      />
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
              borderBottom: i < rows.length - 1 ? "1px solid #141414" : "none",
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
