"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import AIPanel from "@/components/AIPanel";
import { Section } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/login");
      else setLoading(false);
    });
  }, []);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#080808" }}>
      <div style={{
        width: "32px", height: "32px", borderRadius: "50%",
        border: "2px solid #1c1c1c", borderTopColor: "#7c6aff",
        animation: "spin 0.8s linear infinite"
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#080808" }}>
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Dashboard activeSection={activeSection} aiPanelOpen={aiPanelOpen} onToggleAI={() => setAiPanelOpen(o => !o)} />
      </div>
      <AIPanel isOpen={aiPanelOpen} section={activeSection} onClose={() => setAiPanelOpen(false)} />
    </div>
  );
}
