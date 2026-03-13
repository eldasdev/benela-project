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
import { syncWorkspaceFromClientAccount } from "@/lib/client-account";
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
        try {
          await syncWorkspaceFromClientAccount(user.id);
        } catch {
          // Keep dashboard accessible even if account sync fails.
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
