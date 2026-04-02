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
  ShieldCheck,
  TrendingUp,
  Store,
  BrainCircuit,
  Settings,
  FileText,
  Newspaper,
  LogOut,
  X,
} from "lucide-react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { authFetch, signOutAndRedirect } from "@/lib/auth-fetch";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

const NAV = [
  { href: "/admin/dashboard", labelKey: "adminSidebar.overview", icon: LayoutDashboard },
  { href: "/admin/clients", labelKey: "adminSidebar.clients", icon: Building2 },
  { href: "/admin/subscriptions", labelKey: "adminSidebar.subscriptions", icon: CreditCard },
  { href: "/admin/payments", labelKey: "adminSidebar.payments", icon: DollarSign },
  { href: "/admin/notifications", labelKey: "adminSidebar.notificationsNav", icon: Bell },
  { href: "/admin/site-compliances", labelKey: "adminSidebar.siteCompliances", icon: ShieldCheck },
  { href: "/admin/marketplace", labelKey: "adminSidebar.marketplaceNav", icon: Store },
  { href: "/admin/analytics", labelKey: "adminSidebar.analyticsNav", icon: TrendingUp },
  { href: "/admin/blog", labelKey: "adminSidebar.blogStudio", icon: Newspaper },
  { href: "/admin/about", labelKey: "adminSidebar.aboutPage", icon: FileText },
  { href: "/admin/ai-trainer", labelKey: "adminSidebar.aiTrainer", icon: BrainCircuit },
  { href: "/admin/settings", labelKey: "adminSidebar.settingsNav", icon: Settings },
] as const;

export default function AdminSidebar({
  isMobile = false,
  mobileOpen = false,
  onCloseMobile,
}: {
  isMobile?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [quickStats, setQuickStats] = useState<{
    monthly_recurring_revenue?: number;
    total_clients?: number;
    trials_active?: number;
  }>({});

  useEffect(() => {
    authFetch(`${API}/admin/summary`)
      .then((r) => r.ok ? r.json() : {})
      .then((d) => setQuickStats(d))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await signOutAndRedirect("/admin/login");
  };

  const closeDrawer = () => {
    if (isMobile) onCloseMobile?.();
  };
  const navItems = NAV.map((item) => ({
    ...item,
    label: t(item.labelKey),
  }));

  return (
    <aside
      className={isMobile ? "admin-sidebar admin-sidebar-mobile" : "admin-sidebar"}
      style={{
        width: isMobile ? "min(86vw, 340px)" : "240px",
        minWidth: isMobile ? "unset" : "240px",
        height: "100vh",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--bg-panel) 84%, var(--accent-soft) 16%) 0%, color-mix(in srgb, var(--bg-panel) 94%, transparent) 100%)",
        borderRight: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        position: isMobile ? "fixed" : "relative",
        top: 0,
        left: 0,
        zIndex: isMobile ? 90 : "auto",
        transform: isMobile ? (mobileOpen ? "translateX(0)" : "translateX(-105%)") : "none",
        transition: isMobile ? "transform 0.22s ease" : "none",
        boxShadow: isMobile ? "0 28px 58px rgba(0, 0, 0, 0.38)" : "none",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div
        style={{
          padding: "18px 16px",
          borderBottom: "1px solid var(--border-default)",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 86%, var(--accent-soft) 14%), color-mix(in srgb, var(--bg-surface) 94%, transparent))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "11px",
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 78%, #fff 22%), var(--accent-2))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 14px 26px color-mix(in srgb, var(--accent) 30%, transparent)",
            }}
          >
            <LayoutDashboard size={16} color="white" />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.04em" }}>BENELA ADMIN</div>
            <div
              style={{
                fontSize: "9px",
                color: "var(--accent)",
                fontFamily: "monospace",
                letterSpacing: "0.1em",
              }}
            >
                {t("adminSidebar.controlCenter")}
              </div>
            </div>
          {isMobile ? (
            <button
              onClick={closeDrawer}
              aria-label={t("adminSidebar.closeMenu")}
              style={{
                marginLeft: "auto",
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                border: "1px solid var(--border-default)",
                background: "var(--bg-surface)",
                color: "var(--text-subtle)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <nav style={{ flex: 1, padding: "12px", overflowY: "auto" }}>
        <div
          style={{
            fontSize: "9px",
            color: "var(--text-quiet)",
            letterSpacing: "0.12em",
            padding: "6px 10px 10px",
            fontFamily: "monospace",
          }}
        >
          {t("adminSidebar.navigation")}
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeDrawer}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: "10px",
                marginBottom: "2px",
                background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                border: isActive ? "1px solid var(--sidebar-active-border)" : "1px solid transparent",
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
                    background: "var(--accent)",
                  }}
                />
              )}
              <Icon size={14} color={isActive ? "var(--accent)" : "var(--text-subtle)"} />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--sidebar-active-text)" : "var(--text-muted)",
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
            color: "var(--text-quiet)",
            letterSpacing: "0.12em",
            padding: "16px 10px 8px",
            fontFamily: "monospace",
          }}
        >
          {t("adminSidebar.quickStats")}
        </div>
        <div
          style={{
            padding: "10px 12px",
            background: "color-mix(in srgb, var(--bg-surface) 84%, var(--accent-soft) 16%)",
            border: "1px solid var(--border-default)",
            borderRadius: "10px",
            fontSize: "11px",
            color: "var(--text-muted)",
            boxShadow: "0 12px 28px rgba(5, 10, 24, 0.25)",
          }}
        >
          <div style={{ marginBottom: "6px" }}>
            {t("adminSidebar.mrr")}:{" "}
            <span style={{ color: "#34d399", fontWeight: 600 }}>
              ${typeof quickStats.monthly_recurring_revenue === "number" ? quickStats.monthly_recurring_revenue.toLocaleString() : "—"}
            </span>
          </div>
          <div style={{ marginBottom: "6px" }}>
            {t("adminSidebar.clients")}:{" "}
            <span style={{ color: "#60a5fa", fontWeight: 600 }}>
              {quickStats.total_clients ?? "—"}
            </span>
          </div>
          <div>
            {t("adminSidebar.trials")}:{" "}
            <span style={{ color: "#fbbf24", fontWeight: 600 }}>
              {quickStats.trials_active ?? "—"}
            </span>
          </div>
        </div>
      </nav>

      <div style={{ padding: "12px", borderTop: "1px solid var(--border-default)" }}>
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid color-mix(in srgb, var(--danger) 35%, var(--border-default) 65%)",
            background: "color-mix(in srgb, var(--danger) 10%, transparent)",
            color: "var(--danger)",
            fontSize: "12px",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          <LogOut size={14} />
            {t("adminSidebar.logout")}
          </button>
      </div>
    </aside>
  );
}
