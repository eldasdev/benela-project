"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import AIPanel from "@/components/AIPanel";

export type Section =
  | "dashboard"
  | "finance"
  | "hr"
  | "sales"
  | "support"
  | "legal"
  | "marketing"
  | "supply_chain"
  | "procurement"
  | "insights";

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#080808" }}>

      {/* Left — Navigation */}
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      {/* Center — Main content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Dashboard
          activeSection={activeSection}
          aiPanelOpen={aiPanelOpen}
          onToggleAI={() => setAiPanelOpen((o) => !o)}
        />
      </div>

      {/* Right — AI Panel (slides in) */}
      <AIPanel
        isOpen={aiPanelOpen}
        section={activeSection}
        onClose={() => setAiPanelOpen(false)}
      />

    </div>
  );
}
