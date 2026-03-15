"use client";

import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Wallet,
  Users,
  TrendingUp,
  Headset,
  Scale,
  Megaphone,
  Truck,
  ShoppingCart,
  ShoppingBag,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Bell,
  AlertTriangle,
  LifeBuoy,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Section } from "@/types";
import { getSupabase } from "@/lib/supabase";
import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  createClientPlatformReport,
  fetchClientSidebarSummary,
  type ClientSidebarSummary,
} from "@/lib/client-account";

interface SidebarProps {
  activeSection?: Section;
  onSectionChange: (s: Section) => void;
  onLogout?: () => void;
  isMobile?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const NAV = [
  { id: "dashboard", labelKey: "common.sections.dashboard", icon: LayoutDashboard },
  { id: "projects", labelKey: "common.sections.projects", icon: FolderKanban },
  { id: "finance", labelKey: "common.sections.finance", icon: Wallet },
  { id: "hr", labelKey: "common.sections.hr", icon: Users },
  { id: "sales", labelKey: "common.sections.sales", icon: TrendingUp },
  { id: "support", labelKey: "common.sections.support", icon: Headset },
  { id: "legal", labelKey: "common.sections.legal", icon: Scale },
  { id: "marketing", labelKey: "common.sections.marketing", icon: Megaphone },
  { id: "supply_chain", labelKey: "common.sections.supply_chain", icon: Truck },
  { id: "procurement", labelKey: "common.sections.procurement", icon: ShoppingCart },
  { id: "insights", labelKey: "common.sections.insights", icon: BarChart3 },
] as const;

export default function Sidebar({
  activeSection,
  onSectionChange,
  onLogout,
  isMobile = false,
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [summary, setSummary] = useState<ClientSidebarSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [reportSaving, setReportSaving] = useState(false);
  const [reportNotice, setReportNotice] = useState("");
  const [reportError, setReportError] = useState("");
  const [authUser, setAuthUser] = useState<{ id: string; email?: string | null } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const drawerMode = isMobile;
  const planName = (tier?: string | null) =>
    tier ? t(`common.planTiers.${tier}`, {}, tier) : t("sidebar.enterprisePlan");
  const navItems = NAV.map((item) => ({
    ...item,
    label: t(item.labelKey),
  }));

  const reloadSidebarSummary = async (userId: string) => {
    setSummaryLoading(true);
    try {
      const next = await fetchClientSidebarSummary(userId);
      setSummary(next);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileMenuOpen]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data } = await getSupabase().auth.getUser();
        if (!mounted || !data.user) return;
        const user = { id: data.user.id, email: data.user.email };
        setAuthUser(user);
        await reloadSidebarSummary(user.id);
      } catch {
        if (mounted) setSummary(null);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profileMenuOpen || !authUser?.id) return;
    void reloadSidebarSummary(authUser.id);
  }, [profileMenuOpen, authUser?.id]);

  useEffect(() => {
    if (!reportTitle.trim()) setReportTitle(t("sidebar.issueTitleDefault"));
  }, [reportTitle, t]);

  const trialProgress = Math.min(100, Math.max(0, summary?.trial_progress_percent || 0));
  const showTrialSummary = Boolean(summary?.exists);
  const remainingSetupItems = summary?.missing_setup_fields?.length || 0;
  const trialTitle = summary?.payment_required
    ? t("sidebar.paymentRequired")
    : showTrialSummary && !summary?.onboarding_completed
    ? `Workspace setup · ${Math.round(summary?.setup_progress_percent || 0)}%`
    : `${planName(summary?.plan_tier)} · ${t("sidebar.trial")}`;
  const trialSubtitle = summary?.payment_required
    ? t("auth.signup.paymentRequiredNotice")
    : showTrialSummary && !summary?.onboarding_completed
    ? `${remainingSetupItems} required item${remainingSetupItems === 1 ? "" : "s"} remaining · ${summary?.documents_uploaded_count || 0} document${summary?.documents_uploaded_count === 1 ? "" : "s"} uploaded`
    : summary?.trial_label || t("sidebar.loadingPlanStatus");
  const profileName = (summary?.owner_name || t("sidebar.profileFallback")).trim() || t("sidebar.profileFallback");
  const profilePlanLabel = summary?.plan_tier ? `${planName(summary.plan_tier)} ${t("sidebar.plan")}` : t("sidebar.enterprisePlan");
  const profileInitial = profileName.charAt(0).toUpperCase();

  const closeDrawer = () => {
    if (drawerMode) onCloseMobile?.();
  };

  const handleRouteChange = (section: Section) => {
    onSectionChange(section);
    closeDrawer();
  };

  return (
    <aside
      className={drawerMode ? "client-sidebar client-sidebar-mobile" : "client-sidebar"}
      style={{
        width: drawerMode ? "min(86vw, 320px)" : "220px",
        minWidth: drawerMode ? "unset" : "220px",
        height: "100vh",
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        position: drawerMode ? "fixed" : "relative",
        top: 0,
        left: 0,
        zIndex: drawerMode ? 90 : "auto",
        transform: drawerMode ? (mobileOpen ? "translateX(0)" : "translateX(-105%)") : "none",
        transition: drawerMode ? "transform 0.22s ease" : "none",
        boxShadow: drawerMode ? "0 22px 48px rgba(0, 0, 0, 0.28)" : "none",
      }}
    >
      <div style={{ padding: "20px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", boxShadow: "0 0 16px var(--brand-glow)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5L12.5 4.75V9.25L7 12.5L1.5 9.25V4.75L7 1.5Z" stroke="white" strokeWidth="1.5" fill="none" />
              <circle cx="7" cy="7" r="1.8" fill="white" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Benela AI</div>
            <div style={{ fontSize: "10px", color: "var(--accent)", fontFamily: "monospace", letterSpacing: "0.08em" }}>Enterprise ERP</div>
          </div>
          {drawerMode ? (
            <button
              onClick={closeDrawer}
              aria-label={t("sidebar.closeMenu")}
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
        <div style={{ fontSize: "9px", color: "var(--text-quiet)", letterSpacing: "0.15em", padding: "4px 8px 8px", fontFamily: "monospace" }}>{t("sidebar.modules")}</div>
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => handleRouteChange(item.id as Section)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 12px", borderRadius: "10px", marginBottom: "2px",
                background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                border: isActive ? "1px solid var(--sidebar-active-border)" : "1px solid transparent",
                cursor: "pointer", textAlign: "left", transition: "all 0.15s ease", position: "relative",
                color: isActive ? "var(--sidebar-active-text)" : "var(--text-muted)",
              }}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"; }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {isActive && (
                <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: "2px", height: "16px", borderRadius: "0 2px 2px 0", background: "var(--accent)" }} />
              )}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "20px",
                  lineHeight: 1,
                }}
              >
                <Icon size={15} strokeWidth={1.9} />
              </span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--sidebar-active-text)" : "var(--text-muted)",
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
      <div style={{ padding: "12px", borderTop: "1px solid var(--border-default)" }} ref={menuRef}>
        <button
          onClick={() => setProfileMenuOpen((o) => !o)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 12px",
            borderRadius: "10px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
          }}
          onMouseLeave={(e) => {
            if (!profileMenuOpen) {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
            }
          }}
        >
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "white", flexShrink: 0 }}>{profileInitial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profileName}</div>
            <div style={{ fontSize: "10px", color: "var(--text-quiet)" }}>{profilePlanLabel}</div>
          </div>
          <ChevronDown
            size={14}
            color="var(--text-subtle)"
            style={{ transform: profileMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
          />
        </button>

        {profileMenuOpen && (
          <div
            style={{
              marginTop: "6px",
              padding: "6px",
              borderRadius: "10px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
            }}
          >
            <button
              onClick={() => {
                router.push("/settings");
                setProfileMenuOpen(false);
                closeDrawer();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--text-muted)",
                fontSize: "13px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}
            >
              <Settings size={14} color="var(--text-muted)" />
              {t("sidebar.settings")}
            </button>
            <button
              onClick={() => {
                handleRouteChange("marketplace");
                setProfileMenuOpen(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--text-muted)",
                fontSize: "13px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}
            >
              <ShoppingBag size={14} color="var(--text-muted)" />
              {t("sidebar.marketplace")}
            </button>
            <button
              onClick={() => {
                router.push("/notifications");
                setProfileMenuOpen(false);
                closeDrawer();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--text-muted)",
                fontSize: "13px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}
            >
              <Bell size={14} color="var(--text-muted)" />
              {t("sidebar.notifications")}
            </button>
            <button
              onClick={() => {
                setReportOpen((prev) => !prev);
                setReportNotice("");
                setReportError("");
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: reportOpen ? "var(--accent)" : "var(--text-muted)",
                fontSize: "13px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                if (!reportOpen) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = reportOpen ? "var(--accent)" : "var(--text-muted)";
              }}
            >
              <LifeBuoy size={14} color={reportOpen ? "var(--accent)" : "var(--text-muted)"} />
              {t("sidebar.reportPlatformIssue")}
            </button>
            {reportOpen ? (
              <div
                style={{
                  marginTop: "6px",
                  borderRadius: "9px",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-elevated)",
                  padding: "9px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <input
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder={t("sidebar.issueTitlePlaceholder")}
                  style={{
                    width: "100%",
                    borderRadius: "8px",
                    border: "1px solid var(--border-soft)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "12px",
                    padding: "7px 8px",
                    outline: "none",
                  }}
                />
                <textarea
                  value={reportMessage}
                  onChange={(e) => setReportMessage(e.target.value)}
                  placeholder={t("sidebar.issueDescriptionPlaceholder")}
                  rows={3}
                  style={{
                    width: "100%",
                    borderRadius: "8px",
                    border: "1px solid var(--border-soft)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "12px",
                    lineHeight: 1.4,
                    padding: "7px 8px",
                    outline: "none",
                    resize: "vertical",
                    minHeight: "72px",
                  }}
                />
                {reportError ? (
                  <div style={{ fontSize: "11px", color: "var(--danger)" }}>{reportError}</div>
                ) : null}
                {reportNotice ? (
                  <div style={{ fontSize: "11px", color: "var(--success)" }}>{reportNotice}</div>
                ) : null}
                <button
                  type="button"
                  disabled={reportSaving}
                  onClick={async () => {
                    if (!authUser?.id) {
                      setReportError(t("sidebar.signInRequired"));
                      return;
                    }
                    if (!reportTitle.trim() || !reportMessage.trim()) {
                      setReportError(t("sidebar.titleAndMessageRequired"));
                      return;
                    }
                    setReportSaving(true);
                    setReportError("");
                    setReportNotice("");
                    try {
                      await createClientPlatformReport({
                        user_id: authUser.id,
                        user_email: authUser.email || null,
                        title: reportTitle.trim(),
                        message: reportMessage.trim(),
                      });
                      setReportNotice(t("sidebar.reportSent"));
                      setReportMessage("");
                    } catch (err: unknown) {
                      setReportError(err instanceof Error ? err.message : t("sidebar.reportFailed"));
                    } finally {
                      setReportSaving(false);
                    }
                  }}
                  style={{
                    height: "30px",
                    borderRadius: "8px",
                    border: "1px solid color-mix(in srgb, var(--accent) 45%, var(--border-default))",
                    background: "var(--accent)",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: reportSaving ? "not-allowed" : "pointer",
                    opacity: reportSaving ? 0.7 : 1,
                  }}
                >
                  {reportSaving ? t("sidebar.sending") : t("sidebar.sendReport")}
                </button>
              </div>
            ) : null}
            <div
              style={{
                marginTop: "7px",
                borderRadius: "9px",
                border: "1px solid var(--border-default)",
                background: "var(--bg-elevated)",
                padding: "9px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>
                  {summaryLoading ? t("sidebar.loadingPlanStatus") : showTrialSummary ? trialTitle : t("sidebar.planSetupPending")}
                </div>
                {summary?.payment_required ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "10px",
                      color: "var(--danger)",
                      borderRadius: "999px",
                      border: "1px solid var(--danger-soft-border)",
                      background: "var(--danger-soft-bg)",
                      padding: "2px 6px",
                    }}
                  >
                    <AlertTriangle size={11} />
                    {t("sidebar.locked")}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                {summaryLoading
                  ? t("sidebar.checkingTrial")
                  : showTrialSummary
                  ? trialSubtitle
                  : t("sidebar.activateTrialHint")}
              </div>
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  borderRadius: "999px",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-surface)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${showTrialSummary ? trialProgress : 0}%`,
                    height: "100%",
                    background: summary?.payment_required
                      ? "linear-gradient(90deg, #ef4444, #f87171)"
                      : "linear-gradient(90deg, var(--accent), var(--accent-2))",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              {showTrialSummary && !summary?.onboarding_completed ? (
                <button
                  type="button"
                  onClick={() => {
                    router.push("/settings");
                    setProfileMenuOpen(false);
                    closeDrawer();
                  }}
                  style={{
                    height: "28px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-soft)",
                    background: "var(--bg-surface)",
                    color: "var(--text-muted)",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  {t("sidebar.completeBusinessProfile")}
                </button>
              ) : null}
            </div>
            <button
              onClick={() => {
                setProfileMenuOpen(false);
                onLogout?.();
                closeDrawer();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--danger)",
                fontSize: "13px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--danger-soft-bg)";
                (e.currentTarget as HTMLElement).style.color = "var(--danger)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--danger)";
              }}
            >
              <LogOut size={14} color="var(--danger)" />
              {t("sidebar.logOut")}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
