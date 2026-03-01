"use client";

import { useState, useRef, useEffect } from "react";
import { FolderKanban, Settings, ShoppingBag, LogOut, ChevronDown } from "lucide-react";
import { Section } from "@/types";

interface SidebarProps {
  activeSection: Section;
  onSectionChange: (s: Section) => void;
  onLogout?: () => void;
}

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "projects", label: "Projects", icon: <FolderKanban size={14} /> },
  { id: "finance", label: "Finance", icon: "💰" },
  { id: "hr", label: "HR", icon: "👥" },
  { id: "sales", label: "Sales", icon: "📈" },
  { id: "support", label: "Support", icon: "🎧" },
  { id: "legal", label: "Legal", icon: "⚖️" },
  { id: "marketing", label: "Marketing", icon: "📣" },
  { id: "supply_chain", label: "Supply Chain", icon: "🚚" },
  { id: "procurement", label: "Procurement", icon: "🛒" },
  { id: "insights", label: "Insights", icon: "📊" },
] as const;

export default function Sidebar({ activeSection, onSectionChange, onLogout }: SidebarProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileMenuOpen]);
  return (
    <aside style={{
      width: "220px", minWidth: "220px", height: "100vh",
      background: "#0a0a0a", borderRight: "1px solid #1c1c1c",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "20px 16px", borderBottom: "1px solid #1c1c1c" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", boxShadow: "0 0 16px rgba(124,106,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5L12.5 4.75V9.25L7 12.5L1.5 9.25V4.75L7 1.5Z" stroke="white" strokeWidth="1.5" fill="none" />
              <circle cx="7" cy="7" r="1.8" fill="white" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#f0f0f5" }}>Benela AI</div>
            <div style={{ fontSize: "10px", color: "#7c6aff", fontFamily: "monospace", letterSpacing: "0.08em" }}>Enterprise ERP</div>
          </div>
        </div>
      </div>
      <nav style={{ flex: 1, padding: "12px", overflowY: "auto" }}>
        <div style={{ fontSize: "9px", color: "#2e2e2e", letterSpacing: "0.15em", padding: "4px 8px 8px", fontFamily: "monospace" }}>MODULES</div>
        {NAV.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id as Section)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 12px", borderRadius: "10px", marginBottom: "2px",
                background: isActive ? "#141414" : "transparent",
                border: isActive ? "1px solid #222" : "1px solid transparent",
                cursor: "pointer", textAlign: "left", transition: "all 0.15s ease", position: "relative",
              }}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "#0f0f0f"; }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {isActive && (
                <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: "2px", height: "16px", borderRadius: "0 2px 2px 0", background: "#7c6aff" }} />
              )}
              <span style={{ fontSize: "16px", lineHeight: 1, width: "20px", textAlign: "center" }}>
                {item.icon}
              </span>
              <span style={{ fontSize: "13px", fontWeight: isActive ? 500 : 400, color: isActive ? "#e0e0e0" : "#4a4a4a" }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div style={{ padding: "12px", borderTop: "1px solid #1c1c1c" }} ref={menuRef}>
        <button
          onClick={() => setProfileMenuOpen((o) => !o)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 12px",
            borderRadius: "10px",
            background: "#0f0f0f",
            border: "1px solid #1c1c1c",
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#111";
            (e.currentTarget as HTMLElement).style.borderColor = "#222";
          }}
          onMouseLeave={(e) => {
            if (!profileMenuOpen) {
              (e.currentTarget as HTMLElement).style.background = "#0f0f0f";
              (e.currentTarget as HTMLElement).style.borderColor = "#1c1c1c";
            }
          }}
        >
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "white", flexShrink: 0 }}>A</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: 500, color: "#777" }}>Admin</div>
            <div style={{ fontSize: "10px", color: "#333" }}>Enterprise Plan</div>
          </div>
          <ChevronDown
            size={14}
            color="#555"
            style={{ transform: profileMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
          />
        </button>

        {profileMenuOpen && (
          <div
            style={{
              marginTop: "6px",
              padding: "6px",
              borderRadius: "10px",
              background: "#0d0d0d",
              border: "1px solid #1c1c1c",
            }}
          >
            <button
              onClick={() => {
                onSectionChange("settings");
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
                color: "#888",
                fontSize: "13px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#141414";
                (e.currentTarget as HTMLElement).style.color = "#ccc";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "#888";
              }}
            >
              <Settings size={14} color="#666" />
              Settings
            </button>
            <button
              onClick={() => {
                onSectionChange("marketplace");
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
                color: "#888",
                fontSize: "13px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#141414";
                (e.currentTarget as HTMLElement).style.color = "#ccc";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "#888";
              }}
            >
              <ShoppingBag size={14} color="#666" />
              Marketplace
            </button>
            <button
              onClick={() => {
                setProfileMenuOpen(false);
                onLogout?.();
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
                color: "#f87171",
                fontSize: "13px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.08)";
                (e.currentTarget as HTMLElement).style.color = "#fca5a5";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "#f87171";
              }}
            >
              <LogOut size={14} color="#f87171" />
              Log Out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
