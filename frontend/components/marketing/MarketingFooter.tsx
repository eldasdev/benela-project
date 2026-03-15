"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";

const FOOTER_LINKS = [
  { key: "privacy", href: "/privacy" },
  { key: "terms", href: "/terms" },
  { key: "contact", href: "/contact" },
] as const;

export default function MarketingFooter() {
  const { t } = useI18n();

  return (
    <footer className="marketing-footer" style={{ padding: "0 40px 40px" }}>
      <div
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          paddingTop: "18px",
          borderTop: "1px solid color-mix(in srgb, var(--border-default) 70%, transparent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "18px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
              <polygon points="9,2 16,6 16,12 9,16 2,12 2,6" stroke="white" strokeWidth="1.5" fill="none" />
              <circle cx="9" cy="9" r="1.5" fill="white" />
            </svg>
          </div>
          <div style={{ display: "grid", gap: "2px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.08em" }}>BENELA AI</span>
            <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>AI-native enterprise operating system</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              style={{ fontSize: "13px", color: "var(--text-subtle)", textDecoration: "none", fontWeight: 600 }}
            >
              {t(`landing.footerLinks.${link.key}`)}
            </Link>
          ))}
        </div>

        <span style={{ fontSize: "12px", color: "var(--text-quiet)" }}>{t("landing.footerCopyright")}</span>
      </div>
    </footer>
  );
}
