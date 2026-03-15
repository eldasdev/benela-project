"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Languages } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useI18n } from "@/components/i18n/LanguageProvider";

export default function LanguagePicker() {
  const isMobile = useIsMobile(900);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { language, options, setLanguage, t } = useI18n();

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
        right: isMobile ? "12px" : "20px",
        bottom: isMobile ? "118px" : "136px",
        zIndex: 200,
      }}
    >
      {open ? (
        <div
          style={{
            marginBottom: "10px",
            width: isMobile ? "min(360px, calc(100vw - 24px))" : "320px",
            borderRadius: "14px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--panel-flyout-shadow)",
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
              {t("languagePicker.title")}
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "2px" }}>
              {t("languagePicker.subtitle")}
            </p>
          </div>

          <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {options.map((option) => {
              const active = language === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setLanguage(option.id);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
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
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700 }}>{option.nativeLabel}</div>
                      {option.beta ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            height: "18px",
                            padding: "0 7px",
                            borderRadius: "999px",
                            border: "1px solid rgba(245, 158, 11, 0.32)",
                            background: "rgba(245, 158, 11, 0.14)",
                            color: "#d97706",
                            fontSize: "10px",
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                          }}
                        >
                          Beta
                        </span>
                      ) : null}
                    </div>
                    <div style={{ marginTop: "3px", fontSize: "11px", color: "var(--text-subtle)" }}>
                      {option.label}
                    </div>
                  </div>
                  {active ? <Check size={14} color="var(--accent)" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          width: isMobile ? "44px" : "46px",
          height: isMobile ? "44px" : "46px",
          borderRadius: "12px",
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
          color: "var(--accent)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--panel-flyout-shadow)",
          cursor: "pointer",
        }}
        aria-label={t("languagePicker.open")}
        title={t("languagePicker.open")}
      >
        <Languages size={18} />
      </button>
    </div>
  );
}
