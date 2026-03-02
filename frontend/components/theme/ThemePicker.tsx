"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { THEMES, ThemeId } from "@/lib/theme";

interface ThemePickerProps {
  activeTheme: ThemeId;
  onChange: (theme: ThemeId) => void;
}

export default function ThemePicker({ activeTheme, onChange }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        right: "20px",
        bottom: "20px",
        zIndex: 200,
      }}
    >
      {open && (
        <div
          style={{
            marginBottom: "10px",
            width: "320px",
            borderRadius: "14px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--border-default)",
              background: "var(--bg-panel)",
            }}
          >
            <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
              Theme Studio
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "2px" }}>
              Apply a visual preset to the full platform.
            </p>
          </div>

          <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {THEMES.map((theme) => {
              const active = activeTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => {
                    onChange(theme.id);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px",
                    borderRadius: "10px",
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                    background: active ? "var(--accent-soft)" : "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600 }}>{theme.label}</span>
                      {active ? <Check size={13} color="var(--accent)" /> : null}
                    </div>
                    <p
                      style={{
                        marginTop: "3px",
                        fontSize: "11px",
                        color: "var(--text-subtle)",
                        lineHeight: 1.45,
                      }}
                    >
                      {theme.description}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    {theme.preview.map((color) => (
                      <span
                        key={color}
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          background: color,
                          border: "1px solid rgba(0,0,0,0.2)",
                        }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        style={{
          width: "46px",
          height: "46px",
          borderRadius: "12px",
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
          color: "var(--accent)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
          cursor: "pointer",
        }}
        aria-label="Open theme picker"
      >
        <Palette size={18} />
      </button>
    </div>
  );
}
