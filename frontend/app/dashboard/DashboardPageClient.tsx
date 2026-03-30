"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import AIPanel from "@/components/AIPanel";
import { Section } from "@/types";
import { isClientSection } from "@/lib/client-settings";
import { ensureClientWorkspaceAccount } from "@/lib/client-account";
import { waitForBrowserSession } from "@/lib/auth-fetch";
import { pathForSection } from "@/lib/section-routes";
import { useIsMobile } from "@/lib/use-is-mobile";

type DashboardPageClientProps = {
  initialSection?: Section;
};

export default function DashboardPage({ initialSection = "dashboard" }: DashboardPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState<Section>(initialSection);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((pathname || "") !== "/dashboard") return;

    const params = new URLSearchParams(window.location.search);
    const sectionFromQuery = params.get("section");
    if (!isClientSection(sectionFromQuery) || sectionFromQuery === "dashboard") return;
    router.replace(pathForSection(sectionFromQuery));
  }, [pathname, router]);

  useEffect(() => {
    getSupabase()
      .auth.getUser()
      .then(async ({ data }) => {
        const user = data.user as User | null;
        if (!user) {
          router.push("/login");
          return;
        }
        const role = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "";
        if (role === "admin" || role === "owner" || role === "super_admin") {
          router.replace("/admin/dashboard");
          return;
        }
        try {
          const accessToken = await waitForBrowserSession(6000);
          const { summary, bootstrapped } = await ensureClientWorkspaceAccount(user.id, accessToken);
          if (bootstrapped || summary?.exists === false) {
            router.replace("/settings?setup=business");
            return;
          }
          setBootstrapError("");
        } catch (error: unknown) {
          setBootstrapError(
            error instanceof Error && error.message.trim()
              ? error.message
              : "Could not verify your client workspace.",
          );
          setLoading(false);
          return;
        }
        setLoading(false);
      });
  }, [router]);

  const handleSectionChange = (section: Section) => {
    setActiveSection(section);
    setMobileSidebarOpen(false);
    router.push(pathForSection(section));
  };

  const handleLogout = async () => {
    await getSupabase().auth.signOut();
    setMobileSidebarOpen(false);
    router.push("/login");
  };

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--bg-canvas)",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "2px solid var(--border-default)",
            borderTopColor: "var(--accent)",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );

  if (bootstrapError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "var(--bg-canvas)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "520px",
            padding: "28px",
            borderRadius: "24px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 24px 64px color-mix(in srgb, var(--brand-glow) 10%, transparent)",
          }}
        >
          <h1 style={{ margin: "0 0 10px", fontSize: "28px", lineHeight: 1.05, color: "var(--text-primary)" }}>
            Client Workspace Unavailable
          </h1>
          <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: "var(--text-subtle)" }}>{bootstrapError}</p>
          <div style={{ display: "flex", gap: "12px", marginTop: "24px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid var(--border-strong)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => router.push("/login")}
              style={{
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                background: "color-mix(in srgb, var(--accent) 10%, var(--bg-panel))",
                color: "var(--accent)",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              Return To Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="platform-glass-app"
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-canvas)",
      }}
    >
      <Sidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        onLogout={handleLogout}
        isMobile={isMobile}
        mobileOpen={isMobile ? mobileSidebarOpen : false}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      {isMobile && mobileSidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="mobile-shell-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}
      <div
        className="dashboard-main-shell"
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Dashboard
          activeSection={activeSection}
          aiPanelOpen={aiPanelOpen}
          onToggleAI={() => setAiPanelOpen((o) => !o)}
          isMobile={isMobile}
          onToggleSidebar={() => setMobileSidebarOpen((prev) => !prev)}
        />
      </div>
      <AIPanel
        isOpen={aiPanelOpen}
        section={activeSection}
        onSectionChange={handleSectionChange}
        onClose={() => setAiPanelOpen(false)}
      />
    </div>
  );
}
