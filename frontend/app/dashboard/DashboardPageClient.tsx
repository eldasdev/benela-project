"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import AIPanel from "@/components/AIPanel";
import { Section } from "@/types";
import { isClientSection, readClientSettings } from "@/lib/client-settings";

export default function DashboardPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sectionFromQuery = params.get("section");
    if (isClientSection(sectionFromQuery)) {
      setActiveSection(sectionFromQuery);
      return;
    }
    setActiveSection(readClientSettings().defaultSection);
  }, []);

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }: { data: { user: any } }) => {
      const user = data.user;
      if (!user) router.push("/login");
      else setLoading(false);
    });
  }, [router]);

  const handleSectionChange = (section: Section) => {
    if (section === "settings") {
      router.push("/settings");
      return;
    }
    setActiveSection(section);
    const target =
      section === "dashboard" ? "/dashboard" : `/dashboard?section=${encodeURIComponent(section)}`;
    router.replace(target);
  };

  const handleLogout = async () => {
    await getSupabase().auth.signOut();
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
      />
      <div
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
