"use client";

import { Section } from "@/app/page";
import { Sparkles, Bell, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  activeSection: Section;
  aiPanelOpen: boolean;
  onToggleAI: () => void;
}

const MODULE_DATA: Record<string, { title: string; subtitle: string; cards: { label: string; value: string; change: string; up: boolean; color: string }[]; table: { columns: string[]; rows: Record<string, string>[] } }> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Business overview across all modules",
    cards: [
      { label: "Total Revenue", value: "$284,500", change: "+12%", up: true, color: "#34d399" },
      { label: "Active Employees", value: "124", change: "+3", up: true, color: "#60a5fa" },
      { label: "Open Deals", value: "38", change: "-5", up: false, color: "#a78bfa" },
      { label: "Support Tickets", value: "17", change: "-8", up: true, color: "#fbbf24" },
    ],
    table: {
      columns: ["Module", "Status", "Tasks Today", "Alerts", "Last Activity"],
      rows: [
        { module: "💰 Finance", status: "Healthy", tasks: "12", alerts: "1", last: "2 min ago" },
        { module: "👥 HR", status: "Healthy", tasks: "8", alerts: "0", last: "5 min ago" },
        { module: "📈 Sales", status: "Warning", tasks: "15", alerts: "3", last: "1 min ago" },
        { module: "🎧 Support", status: "Healthy", tasks: "24", alerts: "0", last: "Just now" },
        { module: "⚖️ Legal", status: "Healthy", tasks: "4", alerts: "1", last: "1 hour ago" },
        { module: "📣 Marketing", status: "Healthy", tasks: "7", alerts: "0", last: "3 min ago" },
        { module: "🚚 Supply Chain", status: "Critical", tasks: "6", alerts: "5", last: "30 min ago" },
        { module: "🛒 Procurement", status: "Healthy", tasks: "3", alerts: "0", last: "2 hours ago" },
        { module: "📊 Insights", status: "Healthy", tasks: "2", alerts: "0", last: "10 min ago" },
      ],
    },
  },
  finance: {
    title: "Finance",
    subtitle: "Transactions, P&L, invoices and cash flow",
    cards: [
      { label: "Revenue (MTD)", value: "$92,400", change: "+8%", up: true, color: "#34d399" },
      { label: "Expenses (MTD)", value: "$61,200", change: "+3%", up: false, color: "#f87171" },
      { label: "Net Profit", value: "$31,200", change: "+15%", up: true, color: "#34d399" },
      { label: "Pending Invoices", value: "14", change: "-2", up: true, color: "#fbbf24" },
    ],
    table: {
      columns: ["Date", "Description", "Category", "Amount", "Status"],
      rows: [
        { date: "Feb 28", desc: "AWS Infrastructure", cat: "Operations", amount: "-$4,200", status: "Paid" },
        { date: "Feb 28", desc: "Client Payment — Acme", cat: "Revenue", amount: "+$18,500", status: "Received" },
        { date: "Feb 27", desc: "Payroll — Feb", cat: "HR", amount: "-$42,000", status: "Paid" },
        { date: "Feb 27", desc: "Office Supplies", cat: "Admin", amount: "-$380", status: "Paid" },
        { date: "Feb 26", desc: "Client Payment — XYZ", cat: "Revenue", amount: "+$9,800", status: "Received" },
        { date: "Feb 26", desc: "Software Licenses", cat: "Tech", amount: "-$1,200", status: "Pending" },
        { date: "Feb 25", desc: "Marketing Campaign", cat: "Marketing", amount: "-$5,500", status: "Paid" },
      ],
    },
  },
  hr: {
    title: "Human Resources",
    subtitle: "Employees, roles, hiring and performance",
    cards: [
      { label: "Total Employees", value: "124", change: "+3", up: true, color: "#60a5fa" },
      { label: "Open Positions", value: "8", change: "+2", up: false, color: "#fbbf24" },
      { label: "On Leave", value: "6", change: "-1", up: true, color: "#a78bfa" },
      { label: "New This Month", value: "3", change: "+3", up: true, color: "#34d399" },
    ],
    table: {
      columns: ["Employee", "Department", "Role", "Status", "Start Date"],
      rows: [
        { name: "Sarah Chen", dept: "Engineering", role: "Sr. Engineer", status: "Active", date: "Jan 2022" },
        { name: "Marcus Johnson", dept: "Sales", role: "Account Exec", status: "Active", date: "Mar 2023" },
        { name: "Priya Sharma", dept: "Finance", role: "Analyst", status: "On Leave", date: "Jun 2021" },
        { name: "Tom Williams", dept: "HR", role: "HR Manager", status: "Active", date: "Nov 2020" },
        { name: "Lisa Park", dept: "Marketing", role: "CMO", status: "Active", date: "Aug 2019" },
        { name: "David Kim", dept: "Engineering", role: "Lead Dev", status: "Active", date: "Feb 2022" },
        { name: "Anna Müller", dept: "Legal", role: "Counsel", status: "Active", date: "Apr 2023" },
      ],
    },
  },
  sales: {
    title: "Sales & CRM",
    subtitle: "Pipeline, deals, and revenue forecasting",
    cards: [
      { label: "Pipeline Value", value: "$1.2M", change: "+18%", up: true, color: "#a78bfa" },
      { label: "Deals Closing", value: "12", change: "+4", up: true, color: "#34d399" },
      { label: "At Risk", value: "3", change: "+3", up: false, color: "#f87171" },
      { label: "Won This Month", value: "7", change: "+2", up: true, color: "#fbbf24" },
    ],
    table: {
      columns: ["Company", "Contact", "Value", "Stage", "Close Date"],
      rows: [
        { company: "Acme Corp", contact: "John Doe", value: "$120,000", stage: "Negotiation", close: "Mar 15" },
        { company: "TechStart", contact: "Jane Smith", value: "$85,000", stage: "Proposal", close: "Mar 22" },
        { company: "GlobalCo", contact: "Mike Brown", value: "$340,000", stage: "Discovery", close: "Apr 5" },
        { company: "FastGrow", contact: "Amy Lee", value: "$62,000", stage: "Closed Won", close: "Feb 20" },
        { company: "MegaCorp", contact: "Bob Wilson", value: "$210,000", stage: "At Risk", close: "Mar 10" },
        { company: "Innovate Ltd", contact: "Sara Jones", value: "$95,000", stage: "Proposal", close: "Mar 30" },
      ],
    },
  },
};

const GENERIC = (title: string, subtitle: string) => ({
  title,
  subtitle,
  cards: [
    { label: "Total Items", value: "—", change: "—", up: true, color: "#7c6aff" },
    { label: "Active", value: "—", change: "—", up: true, color: "#34d399" },
    { label: "Pending", value: "—", change: "—", up: false, color: "#fbbf24" },
    { label: "Completed", value: "—", change: "—", up: true, color: "#60a5fa" },
  ],
  table: {
    columns: ["ID", "Name", "Status", "Date", "Actions"],
    rows: [{ id: "—", name: "No data yet", status: "—", date: "—", actions: "—" }],
  },
});

const DATA: Record<string, (typeof MODULE_DATA.dashboard)> = {
  ...MODULE_DATA,
  support: GENERIC("Customer Support", "Tickets, resolutions and knowledge base"),
  legal: GENERIC("Legal & Compliance", "Contracts, compliance and risk management"),
  marketing: GENERIC("Marketing", "Campaigns, content and performance analytics"),
  supply_chain: GENERIC("Supply Chain", "Inventory, vendors and logistics"),
  procurement: GENERIC("Procurement", "Purchase orders, vendors and approvals"),
  insights: GENERIC("Insights & BI", "Cross-module analytics and reporting"),
};

const STATUS_COLORS: Record<string, string> = {
  Healthy: "#34d399", Warning: "#fbbf24", Critical: "#f87171",
  Active: "#34d399", "On Leave": "#fbbf24", Pending: "#fbbf24",
  Paid: "#34d399", Received: "#34d399", "Closed Won": "#34d399",
  Negotiation: "#a78bfa", Proposal: "#60a5fa", Discovery: "#fbbf24",
  "At Risk": "#f87171",
};

export default function Dashboard({ activeSection, aiPanelOpen, onToggleAI }: Props) {
  const data = DATA[activeSection] ?? DATA.dashboard;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#080808" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: "56px", flexShrink: 0,
        background: "#0a0a0a", borderBottom: "1px solid #1c1c1c",
      }}>
        <div>
          <h1 style={{ fontSize: "16px", fontWeight: 600, color: "#f0f0f5" }}>{data.title}</h1>
          <p style={{ fontSize: "11px", color: "#444", marginTop: "1px" }}>{data.subtitle}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={onToggleAI}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "7px 14px", borderRadius: "10px", cursor: "pointer",
              background: aiPanelOpen ? "rgba(124,106,255,0.15)" : "rgba(124,106,255,0.08)",
              border: aiPanelOpen ? "1px solid rgba(124,106,255,0.4)" : "1px solid rgba(124,106,255,0.2)",
              color: "#a89aff", fontSize: "13px", fontWeight: 500, transition: "all 0.2s ease",
            }}
          >
            <Sparkles size={14} />
            Ask AI
          </button>
          <button style={{
            width: "34px", height: "34px", borderRadius: "9px",
            background: "#111", border: "1px solid #1c1c1c",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", position: "relative",
          }}>
            <Bell size={14} color="#555" />
            <div style={{
              position: "absolute", top: "7px", right: "7px",
              width: "6px", height: "6px", borderRadius: "50%", background: "#f87171",
            }} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
          {data.cards.map((card, i) => (
            <div key={i} style={{
              background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "12px",
              padding: "18px 20px", position: "relative", overflow: "hidden",
            }}>
              <p style={{ fontSize: "11px", color: "#444", marginBottom: "10px", fontWeight: 500 }}>{card.label}</p>
              <p style={{ fontSize: "28px", fontWeight: 600, color: "#f0f0f5", lineHeight: 1, marginBottom: "8px" }}>{card.value}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                {card.up ? <TrendingUp size={11} color="#34d399" /> : <TrendingDown size={11} color="#f87171" />}
                <span style={{ fontSize: "11px", color: card.up ? "#34d399" : "#f87171" }}>{card.change}</span>
                <span style={{ fontSize: "11px", color: "#333" }}>vs last month</span>
              </div>
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: "1px",
                background: `linear-gradient(90deg, transparent, ${card.color}40, transparent)`,
              }} />
            </div>
          ))}
        </div>
        <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "14px", overflow: "hidden" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderBottom: "1px solid #1c1c1c",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: "#7c6aff" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0" }}>
                {activeSection === "dashboard" ? "Module Overview" : "Records"}
              </span>
            </div>
            <button style={{
              fontSize: "12px", color: "#555", background: "#111",
              border: "1px solid #1c1c1c", borderRadius: "8px",
              padding: "5px 12px", cursor: "pointer",
            }}>
              + Add New
            </button>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${data.table.columns.length}, 1fr)`,
            padding: "10px 20px",
            borderBottom: "1px solid #161616",
            background: "#0a0a0a",
          }}>
            {data.table.columns.map((col) => (
              <span key={col} style={{
                fontSize: "10px", fontWeight: 600, color: "#333",
                textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace",
              }}>
                {col}
              </span>
            ))}
          </div>
          {data.table.rows.map((row, i) => {
            const vals = Object.values(row) as string[];
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${data.table.columns.length}, 1fr)`,
                  padding: "13px 20px",
                  borderBottom: i < data.table.rows.length - 1 ? "1px solid #141414" : "none",
                  transition: "background 0.1s ease",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#0f0f0f"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {vals.map((val, j) => {
                  const statusColor = STATUS_COLORS[val];
                  return (
                    <span key={j} style={{ fontSize: "13px", display: "flex", alignItems: "center" }}>
                      {statusColor ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "5px",
                          padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 500,
                          background: `${statusColor}12`, color: statusColor, border: `1px solid ${statusColor}20`,
                        }}>
                          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                          {val}
                        </span>
                      ) : (
                        <span style={{ color: j === 0 ? "#ccc" : "#555" }}>{val}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
