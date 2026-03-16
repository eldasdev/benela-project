"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";

type NavItem = {
  key: string;
  href: string;
};

const NAV_LINKS: NavItem[] = [
  { key: "features", href: "/#features" },
  { key: "pricing", href: "/#pricing" },
  { key: "blog", href: "/blog" },
  { key: "about", href: "/about" },
];

export default function MarketingTopNav({ currentPath = "/" }: { currentPath?: string }) {
  const { t } = useI18n();
  const navLinkStyle = (active: boolean) => ({
    fontSize: "14px",
    textDecoration: "none",
    transition: "color 0.15s",
    color: active ? "var(--text-primary)" : "var(--marketing-hero-nav-link)",
    fontWeight: active ? 700 : 500,
  });

  return (
    <nav
      className="marketing-nav"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: "16px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "var(--bg-panel)",
        background: "var(--marketing-hero-nav-bg)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--marketing-hero-nav-border)",
        boxShadow: "var(--marketing-hero-nav-shadow)",
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "var(--marketing-hero-nav-brand)" }}>
        <div
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 18px var(--brand-glow)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <polygon points="9,2 16,6 16,12 9,16 2,12 2,6" stroke="white" strokeWidth="1.5" fill="none" />
            <path d="M9 5 L12 9 L9 13 L6 9 Z" stroke="white" strokeWidth="1.5" fill="none" />
            <circle cx="9" cy="9" r="1.5" fill="white" />
          </svg>
        </div>
        <span className="marketing-nav-brand" style={{ fontSize: "17px", fontWeight: 700, letterSpacing: "1px", color: "var(--marketing-hero-nav-brand)" }}>
          BENELA
        </span>
      </Link>

      <div className="marketing-nav-links" style={{ display: "flex", alignItems: "center", gap: "32px" }}>
        {NAV_LINKS.map((link) => {
          const active =
            link.href === "/about"
              ? currentPath === "/about"
              : link.href === "/blog"
                ? currentPath === "/blog" || currentPath.startsWith("/blog/")
                : currentPath === "/";
          return (
            <Link
              key={link.key}
              href={link.href}
              className="marketing-nav-link"
              style={navLinkStyle(active)}
            >
              {t(`marketingNav.${link.key}`)}
            </Link>
          );
        })}
      </div>

      <div className="marketing-nav-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Link
          href="/login"
          className="marketing-nav-btn marketing-nav-btn-secondary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "44px",
            padding: "0 18px",
            borderRadius: "14px",
            background: "var(--marketing-hero-nav-secondary-bg)",
            border: "1px solid var(--marketing-hero-nav-secondary-border)",
            color: "var(--marketing-hero-nav-secondary-text)",
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {t("marketingNav.signIn")}
        </Link>
        <Link
          href="/signup"
          className="marketing-nav-btn marketing-nav-btn-primary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "44px",
            padding: "0 18px",
            borderRadius: "14px",
            background: "var(--marketing-hero-nav-primary-bg)",
            border: "1px solid var(--marketing-hero-nav-primary-border)",
            color: "var(--marketing-hero-nav-primary-text)",
            fontSize: "14px",
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: "var(--marketing-hero-nav-primary-shadow)",
          }}
        >
          {t("marketingNav.getStarted")}
        </Link>
      </div>
    </nav>
  );
}
