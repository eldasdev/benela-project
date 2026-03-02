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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Section } from "@/types";

interface SidebarProps {
  activeSection?: Section;
  onSectionChange: (s: Section) => void;
  onLogout?: () => void;
}

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "hr", label: "HR", icon: Users },
  { id: "sales", label: "Sales", icon: TrendingUp },
  { id: "support", label: "Support", icon: Headset },
  { id: "legal", label: "Legal", icon: Scale },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "supply_chain", label: "Supply Chain", icon: Truck },
  { id: "procurement", label: "Procurement", icon: ShoppingCart },
  { id: "insights", label: "Insights", icon: BarChart3 },
] as const;

export default function Sidebar({ activeSection, onSectionChange, onLogout }: SidebarProps) {
  const router = useRouter();
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
      background: "var(--bg-panel)", borderRight: "1px solid var(--border-default)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "20px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", boxShadow: "0 0 16px rgba(124,106,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5L12.5 4.75V9.25L7 12.5L1.5 9.25V4.75L7 1.5Z" stroke="white" strokeWidth="1.5" fill="none" />
              <circle cx="7" cy="7" r="1.8" fill="white" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Benela AI</div>
            <div style={{ fontSize: "10px", color: "var(--accent)", fontFamily: "monospace", letterSpacing: "0.08em" }}>Enterprise ERP</div>
          </div>
        </div>
      </div>
      <nav style={{ flex: 1, padding: "12px", overflowY: "auto" }}>
        <div style={{ fontSize: "9px", color: "var(--text-quiet)", letterSpacing: "0.15em", padding: "4px 8px 8px", fontFamily: "monospace" }}>MODULES</div>
        {NAV.map((item) => {
          const isActive = activeSection === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id as Section)}
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
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "white", flexShrink: 0 }}>A</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted)" }}>Admin</div>
            <div style={{ fontSize: "10px", color: "var(--text-quiet)" }}>Enterprise Plan</div>
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
              Marketplace
            </button>
            <button
              onClick={() => {
                router.push("/notifications");
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
              <Bell size={14} color="var(--text-muted)" />
              Notifications
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
