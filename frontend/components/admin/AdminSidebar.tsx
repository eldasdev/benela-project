"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  DollarSign,
  Bell,
  TrendingUp,
  Settings,
  LogOut,
  ArrowLeft,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const NAV = [
  { href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/clients", label: "Clients", icon: Building2 },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/payments", label: "Payments", icon: DollarSign },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

export default function AdminSidebar() {
  const pathname = usePathname();
  const [quickStats, setQuickStats] = useState<{
    monthly_recurring_revenue?: number;
    total_clients?: number;
    trials_active?: number;
  }>({});

  useEffect(() => {
    fetch(`${API}/admin/summary`)
      .then((r) => r.ok ? r.json() : {})
      .then((d) => setQuickStats(d))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await getSupabase().auth.signOut();
    window.location.href = "/admin/login";
  };

  return (
    <aside
      style={{
        width: "240px",
        minWidth: "240px",
        height: "100vh",
        background: "#0a0a0f",
        borderRight: "1px solid #1e1e2a",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "18px 16px", borderBottom: "1px solid #1e1e2a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #ef4444, #b91c1c)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <LayoutDashboard size={16} color="white" />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#f0f0f5" }}>BENELA ADMIN</div>
            <div
              style={{
                fontSize: "9px",
                color: "#ef4444",
                fontFamily: "monospace",
                letterSpacing: "0.1em",
              }}
            >
              OWNER
            </div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "12px", overflowY: "auto" }}>
        <div
          style={{
            fontSize: "9px",
            color: "#3a3a4a",
            letterSpacing: "0.12em",
            padding: "6px 10px 10px",
            fontFamily: "monospace",
          }}
        >
          NAVIGATION
        </div>
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: "8px",
                marginBottom: "2px",
                background: isActive ? "#141418" : "transparent",
                border: isActive ? "1px solid #1e1e2a" : "1px solid transparent",
                cursor: "pointer",
                textDecoration: "none",
                transition: "all 0.15s ease",
                position: "relative",
                color: "inherit",
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "2px",
                    height: "14px",
                    borderRadius: "0 2px 2px 0",
                    background: "#ef4444",
                  }}
                />
              )}
              <Icon size={14} color={isActive ? "#ef4444" : "#555"} />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "#e0e0e0" : "#6a6a7a",
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        <div
          style={{
            fontSize: "9px",
            color: "#3a3a4a",
            letterSpacing: "0.12em",
            padding: "16px 10px 8px",
            fontFamily: "monospace",
          }}
        >
          QUICK STATS
        </div>
        <div
          style={{
            padding: "10px 12px",
            background: "#0e0e14",
            border: "1px solid #1e1e2a",
            borderRadius: "8px",
            fontSize: "11px",
            color: "#666",
          }}
        >
          <div style={{ marginBottom: "6px" }}>
            MRR:{" "}
            <span style={{ color: "#34d399", fontWeight: 600 }}>
              ${typeof quickStats.monthly_recurring_revenue === "number" ? quickStats.monthly_recurring_revenue.toLocaleString() : "—"}
            </span>
          </div>
          <div style={{ marginBottom: "6px" }}>
            Clients:{" "}
            <span style={{ color: "#60a5fa", fontWeight: 600 }}>
              {quickStats.total_clients ?? "—"}
            </span>
          </div>
          <div>
            Trials:{" "}
            <span style={{ color: "#fbbf24", fontWeight: 600 }}>
              {quickStats.trials_active ?? "—"}
            </span>
          </div>
        </div>
      </nav>

      <div style={{ padding: "12px", borderTop: "1px solid #1e1e2a" }}>
        <Link
          href="/dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#666",
            textDecoration: "none",
            marginBottom: "6px",
            transition: "background 0.15s",
          }}
        >
          <ArrowLeft size={14} />
          Back to Platform
        </Link>
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid #1e1e2a",
            background: "transparent",
            color: "#f87171",
            fontSize: "12px",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </aside>
  );
}
