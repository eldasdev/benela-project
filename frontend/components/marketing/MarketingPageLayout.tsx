import type { ReactNode } from "react";
import MarketingTopNav from "@/components/marketing/MarketingTopNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

type MarketingPageLayoutProps = {
  currentPath?: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
};

export default function MarketingPageLayout({
  currentPath = "/",
  eyebrow,
  title,
  subtitle,
  children,
}: MarketingPageLayoutProps) {
  return (
    <div style={{ background: "var(--bg-canvas)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <MarketingTopNav currentPath={currentPath} />

      <section
        className="marketing-page-hero"
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "132px clamp(18px, 4vw, 40px) 54px",
          borderBottom: "1px solid var(--marketing-hero-divider)",
          background:
            "radial-gradient(920px 460px at 82% 6%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 58%), var(--marketing-hero-bg)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to right, color-mix(in srgb, var(--marketing-hero-grid-line-x) 100%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--marketing-hero-grid-line-y) 100%, transparent) 1px, transparent 1px)",
            backgroundSize: "84px 84px",
            opacity: 0.42,
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", maxWidth: "1080px", margin: "0 auto", textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              borderRadius: "999px",
              border: "1px solid var(--marketing-hero-badge-border)",
              background: "var(--marketing-hero-badge-bg)",
              color: "var(--marketing-hero-badge-text)",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </div>

          <h1
            style={{
              margin: "22px auto 0",
              maxWidth: "820px",
              fontSize: "clamp(34px, 5vw, 62px)",
              lineHeight: 0.96,
              fontWeight: 700,
              letterSpacing: "-0.05em",
            }}
          >
            {title}
          </h1>

          <p
            style={{
              margin: "20px auto 0",
              maxWidth: "760px",
              fontSize: "18px",
              lineHeight: 1.72,
              color: "var(--text-subtle)",
            }}
          >
            {subtitle}
          </p>
        </div>
      </section>

      <main className="marketing-page-main" style={{ maxWidth: "1220px", margin: "0 auto", padding: "56px clamp(18px, 4vw, 40px) 84px" }}>{children}</main>

      <MarketingFooter />

      <style>{`
        @media (max-width: 980px) {
          .marketing-nav {
            padding: 14px 18px !important;
          }

          .marketing-layout-stack {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 720px) {
          .marketing-layout-main-grid,
          .marketing-layout-card-grid,
          .marketing-layout-split-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
