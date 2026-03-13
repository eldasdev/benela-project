"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Sparkles, BarChart3, Users, ShieldCheck, Zap, Globe, ChevronRight, CheckCircle2, Clock3, BellRing, Monitor, Building2 } from "lucide-react";
import { PricingModule, type PricingPlan } from "@/components/ui/pricing-module";
import {
  DEFAULT_PRICING_PLANS,
  PRICING_STORAGE_KEY,
  normalizePricingPlan,
  type PricingPlanDefinition,
} from "@/lib/pricing-plans";

const NAV_LINKS = ["Features", "Pricing", "About"];

const FEATURES = [
  { icon: Sparkles, title: "AI Copilot in Every Module", desc: "Context-aware AI assistant embedded in Finance, HR, Sales and every other module. Ask questions, get insights, take action.", color: "var(--accent)" },
  { icon: BarChart3, title: "Real-Time Analytics", desc: "Live dashboards pulling from your actual data. No more spreadsheets or manual reports.", color: "#34d399" },
  { icon: Users, title: "HR & People Management", desc: "Employees, positions, departments — all in one place with full CRUD operations.", color: "#60a5fa" },
  { icon: ShieldCheck, title: "Enterprise Security", desc: "SOC2 compliant, end-to-end encryption, role-based access control and full audit logs.", color: "#f59e0b" },
  { icon: Zap, title: "Instant Automation", desc: "AI agents handle repetitive tasks across modules automatically. Set rules, let AI execute.", color: "#f87171" },
  { icon: Globe, title: "Multi-Region Deployment", desc: "Deploy in the region closest to your team. GDPR compliant. Data never leaves your region.", color: "#a78bfa" },
];

const PLAN_ICONS: Record<string, ReactNode> = {
  starter: <Monitor className="w-8 h-8 text-primary" />,
  pro: <Users className="w-8 h-8 text-primary" />,
  enterprise: <Building2 className="w-8 h-8 text-primary" />,
};

function toMarketingPlans(plans: PricingPlanDefinition[]): PricingPlan[] {
  return plans.map((plan) => ({
    ...plan,
    icon: PLAN_ICONS[plan.id] || <Monitor className="w-8 h-8 text-primary" />,
  }));
}

const INITIAL_MARKETING_PRICING_PLANS = toMarketingPlans(DEFAULT_PRICING_PLANS);

function readStoredMarketingPlans(): PricingPlan[] {
  const stored = window.localStorage.getItem(PRICING_STORAGE_KEY);
  if (!stored) return INITIAL_MARKETING_PRICING_PLANS;
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return INITIAL_MARKETING_PRICING_PLANS;
    const normalized = parsed
      .map(normalizePricingPlan)
      .filter((row): row is PricingPlanDefinition => Boolean(row));
    if (!normalized.length) return INITIAL_MARKETING_PRICING_PLANS;
    return toMarketingPlans(normalized);
  } catch {
    return INITIAL_MARKETING_PRICING_PLANS;
  }
}

const TESTIMONIALS = [
  { name: "Sarah Chen", role: "CFO at Acme Corp", text: "Benela replaced three separate tools for us. The AI assistant in the Finance module alone saves our team 4 hours a week.", avatar: "SC" },
  { name: "Marcus Johnson", role: "VP Sales at TechStart", text: "The sales pipeline view with AI deal scoring changed how our team prioritizes. Win rate up 23% in 3 months.", avatar: "MJ" },
  { name: "Priya Sharma", role: "Head of HR at GlobalCo", text: "Onboarding new employees used to take days. With Benela AI it takes 20 minutes. The automation is incredible.", avatar: "PS" },
];

export default function LandingPage() {
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>(INITIAL_MARKETING_PRICING_PLANS);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      setPricingPlans(readStoredMarketingPlans());
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  return (
    <div style={{ background: "var(--bg-canvas)", color: "var(--text-primary)", fontFamily: "system-ui, -apple-system, sans-serif", minHeight: "100vh" }}>

      {/* Nav */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
              <polygon points="9,2 16,6 16,12 9,16 2,12 2,6" stroke="white" strokeWidth="1.5" fill="none"/>
              <path d="M9 5 L12 9 L9 13 L6 9 Z" stroke="white" strokeWidth="1.5" fill="none"/>
              <circle cx="9" cy="9" r="1.5" fill="white"/>
            </svg>
          </div>
          <span className="marketing-nav-brand" style={{ fontSize: "17px", fontWeight: 700, letterSpacing: "1px" }}>
            BENELA
          </span>
        </div>

        <div className="marketing-nav-links" style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          {NAV_LINKS.map(link => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              className="marketing-nav-link"
              style={{ fontSize: "14px", textDecoration: "none", transition: "color 0.15s" }}
            >
              {link}
            </a>
          ))}
        </div>

        <div className="marketing-nav-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link href="/login" className="marketing-nav-btn marketing-nav-btn-secondary">
            Sign in
          </Link>
          <Link href="/signup" className="marketing-nav-btn marketing-nav-btn-primary">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="marketing-hero">
        <div className="marketing-hero-grid" />
        <div className="marketing-hero-glow marketing-hero-glow-a" />
        <div className="marketing-hero-glow marketing-hero-glow-b" />
        <div className="marketing-hero-orbit marketing-hero-orbit-outer" />
        <div className="marketing-hero-orbit marketing-hero-orbit-inner" />

        <div className="marketing-hero-copy">
          <div className="marketing-hero-badge">
            <Sparkles size={12} />
            Live AI ERP for finance, operations and growth
            <ChevronRight size={12} />
          </div>

          <h1 className="marketing-hero-title">
            Operate Beyond Spreadsheets.
            <span>Command Your Entire Company with AI.</span>
          </h1>

          <p className="marketing-hero-subtitle">
            Benela unifies Finance, HR, Sales, Legal, Support and more into one intelligent workspace.
            Ask, analyze, automate, and act from a single operational command center.
          </p>

          <div className="marketing-hero-actions">
            <Link href="/signup" className="marketing-hero-primary">
              Start 7-day trial <ArrowRight size={16} />
            </Link>
            <Link href="/login" className="marketing-hero-secondary">
              Watch platform demo
            </Link>
          </div>

          <p className="marketing-hero-note">No free plan · 7-day trial on paid plans · Enterprise-ready security</p>

          <div className="marketing-hero-stats">
            <div className="marketing-hero-stat">
              <strong>9</strong>
              <span>Core business modules</span>
            </div>
            <div className="marketing-hero-stat">
              <strong>99.95%</strong>
              <span>Platform uptime target</span>
            </div>
            <div className="marketing-hero-stat">
              <strong>4x faster</strong>
              <span>Reporting and analysis cycles</span>
            </div>
            <div className="marketing-hero-stat">
              <strong>24/7</strong>
              <span>AI-assisted operations</span>
            </div>
          </div>
        </div>

        <div className="marketing-hero-showcase">
          <div className="marketing-hero-showcase-head">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <p>Benela AI Unified Workspace</p>
          </div>
          <img src="/dashboard-screenshot.png" alt="Benela AI platform command center dashboard" />
          <div className="marketing-hero-chip marketing-hero-chip-a">Revenue forecast confidence: 93%</div>
          <div className="marketing-hero-chip marketing-hero-chip-b">AI Copilot active in 9 modules</div>
        </div>

        <div className="marketing-hero-partners">
          <p>Trusted by modern operations teams worldwide</p>
          <div className="marketing-hero-partner-row">
            <span>NOVA SYSTEMS</span>
            <span>FORGE CAPITAL</span>
            <span>FLUX LOGISTICS</span>
            <span>BEAM INDUSTRIES</span>
            <span>ECHO HEALTH</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="marketing-section marketing-section-features" style={{ padding: "100px 40px", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <div style={{ fontSize: "12px", color: "var(--accent)", letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: "12px" }}>FEATURES</div>
          <h2 style={{ fontSize: "42px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: "16px" }}>
            Everything your enterprise needs
          </h2>
          <p style={{ fontSize: "16px", color: "var(--text-subtle)", maxWidth: "500px", margin: "0 auto" }}>
            Built from the ground up with AI at the core, not bolted on as an afterthought.
          </p>
        </div>

        <div className="marketing-feature-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: "28px", position: "relative", overflow: "hidden", transition: "border 0.2s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = `${f.color}30`}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)"}>
                <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: `${f.color}12`, border: `1px solid ${f.color}20`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
                  <Icon size={20} color={f.color} />
                </div>
                <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px" }}>{f.title}</h3>
                <p style={{ fontSize: "13px", color: "var(--text-subtle)", lineHeight: 1.7 }}>{f.desc}</p>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "1px", background: `linear-gradient(90deg, transparent, ${f.color}20, transparent)` }} />
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="marketing-section"
        style={{ padding: "0 40px 80px", maxWidth: "1200px", margin: "0 auto" }}
      >
        <div
          style={{
            borderRadius: "22px",
            border: "1px solid var(--border-default)",
            background:
              "linear-gradient(140deg, color-mix(in srgb, var(--bg-surface) 88%, var(--accent) 12%), var(--bg-surface))",
            padding: "30px",
            display: "grid",
            gridTemplateColumns: "minmax(280px, 1.2fr) minmax(260px, 1fr)",
            gap: "24px",
            boxShadow: "0 14px 48px color-mix(in srgb, var(--brand-glow) 28%, transparent)",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                color: "var(--accent)",
                border: "1px solid color-mix(in srgb, var(--accent) 45%, var(--border-default))",
                borderRadius: "999px",
                padding: "6px 10px",
                marginBottom: "14px",
                background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              }}
            >
              <Sparkles size={13} />
              Judith AI Assistant
            </div>
            <h3 style={{ margin: 0, fontSize: "34px", lineHeight: 1.2, color: "var(--text-primary)" }}>
              Delegate task operations to Judith in one workspace.
            </h3>
            <p style={{ marginTop: "14px", marginBottom: 0, fontSize: "15px", lineHeight: 1.75, color: "var(--text-subtle)" }}>
              Judith captures notes from chat and voice, turns plans into checklists, tracks deadlines in Uzbekistan time,
              and sends reminders in both Benela and Telegram when linked.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "18px" }}>
              {[
                "Natural-language task creation",
                "Deadline reminders (+30 min)",
                "Voice-to-task workflows",
                "Team and owner direct collaboration",
              ].map((item) => (
                <span
                  key={item}
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    borderRadius: "999px",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    padding: "6px 10px",
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div
            style={{
              borderRadius: "16px",
              border: "1px solid var(--border-default)",
              background: "var(--bg-panel)",
              padding: "18px",
              display: "grid",
              gap: "10px",
              alignContent: "start",
            }}
          >
            {[
              { icon: CheckCircle2, title: "Smart Task Breakdown", desc: "Converts complex requests into actionable steps." },
              { icon: Clock3, title: "Deadline Timeline", desc: "Creates due times with timezone-aware reminders." },
              { icon: BellRing, title: "Mutual Updates", desc: "Syncs reminder updates between web chat and Telegram bot." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  style={{
                    border: "1px solid var(--border-default)",
                    borderRadius: "12px",
                    background: "var(--bg-surface)",
                    padding: "12px",
                    display: "flex",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "9px",
                      border: "1px solid color-mix(in srgb, var(--accent) 35%, var(--border-default))",
                      background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={15} color="var(--accent)" />
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{item.title}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "2px", lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <div id="pricing">
        <PricingModule
          title="Simple, Transparent Pricing"
          subtitle="Choose monthly or annual billing and scale Benela with your operations."
          annualBillingLabel="Pay annually and save"
          buttonLabel="Start 7-day trial"
          plans={pricingPlans}
          defaultAnnual={false}
          className="py-24 px-10 border-y border-[var(--bg-elevated)]"
        />
      </div>

      {/* Testimonials */}
      <section className="marketing-section marketing-section-testimonials" style={{ padding: "100px 40px", maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <div style={{ fontSize: "12px", color: "var(--accent)", letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: "12px" }}>TESTIMONIALS</div>
          <h2 style={{ fontSize: "42px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>Loved by finance and ops teams</h2>
        </div>

        <div className="marketing-testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px" }}>
          {TESTIMONIALS.map((t) => (
            <div key={t.name} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: "28px" }}>
              <div style={{ fontSize: "32px", color: "var(--accent)", marginBottom: "16px", lineHeight: 1 }}>&ldquo;</div>
              <p style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.7, marginBottom: "24px" }}>{t.text}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600, color: "white", flexShrink: 0 }}>
                  {t.avatar}
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-muted)" }}>{t.name}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="marketing-section marketing-section-cta" style={{ padding: "100px 40px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "600px", height: "400px", background: "radial-gradient(ellipse, rgba(124,106,255,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: "600px", margin: "0 auto", position: "relative" }}>
          <h2 style={{ fontSize: "48px", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: "20px", letterSpacing: "-0.5px" }}>
            Ready to modernize your ERP?
          </h2>
          <p style={{ fontSize: "17px", color: "var(--text-subtle)", marginBottom: "40px", lineHeight: 1.7 }}>
            Launch with any paid plan and validate your setup during a full 7-day trial period.
          </p>
          <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "16px 36px", borderRadius: "14px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "white", fontSize: "16px", fontWeight: 600, textDecoration: "none", boxShadow: "0 0 40px rgba(124,106,255,0.3)" }}>
            Get early access <ArrowRight size={18} />
          </Link>
          <p style={{ fontSize: "12px", color: "var(--text-quiet)", marginTop: "16px" }}>No credit card · Cancel anytime · GDPR compliant</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="marketing-footer" style={{ padding: "40px", borderTop: "1px solid var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
              <polygon points="9,2 16,6 16,12 9,16 2,12 2,6" stroke="white" strokeWidth="1.5" fill="none"/>
              <circle cx="9" cy="9" r="1.5" fill="white"/>
            </svg>
          </div>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-subtle)" }}>BENELA AI</span>
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          {["Privacy", "Terms", "Contact"].map(link => (
            <a key={link} href="#" style={{ fontSize: "13px", color: "var(--text-quiet)", textDecoration: "none" }}>{link}</a>
          ))}
        </div>
        <span style={{ fontSize: "12px", color: "var(--border-soft)" }}>© 2025 Benela AI. All rights reserved.</span>
      </footer>
      <style jsx global>{`
        .marketing-nav-brand {
          color: var(--marketing-hero-nav-brand);
        }

        .marketing-nav-link {
          color: var(--marketing-hero-nav-link);
        }

        .marketing-nav-link:hover {
          color: var(--marketing-hero-nav-link-hover);
        }

        .marketing-nav-btn {
          padding: 8px 18px;
          border-radius: 9px;
          font-size: 14px;
          text-decoration: none;
          transition: all 0.15s;
        }

        .marketing-nav-btn-secondary {
          background: var(--marketing-hero-nav-secondary-bg);
          border: 1px solid var(--marketing-hero-nav-secondary-border);
          color: var(--marketing-hero-nav-secondary-text);
        }

        .marketing-nav-btn-primary {
          background: var(--marketing-hero-nav-primary-bg);
          border: 1px solid var(--marketing-hero-nav-primary-border);
          color: var(--marketing-hero-nav-primary-text);
          font-weight: 600;
          box-shadow: var(--marketing-hero-nav-primary-shadow);
        }

        .marketing-hero {
          position: relative;
          overflow: hidden;
          padding: 168px 24px 88px;
          width: 100%;
          margin: 0;
          isolation: isolate;
          background: var(--marketing-hero-bg);
          border-bottom: 1px solid var(--marketing-hero-divider);
        }

        .marketing-hero-grid {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to right, var(--marketing-hero-grid-line-x) 1px, transparent 1px),
            linear-gradient(to bottom, var(--marketing-hero-grid-line-y) 1px, transparent 1px);
          background-size: 82px 82px;
          mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.84), rgba(0, 0, 0, 0.42) 62%, transparent 100%);
          pointer-events: none;
          z-index: -4;
        }

        .marketing-hero-glow {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
          z-index: -3;
        }

        .marketing-hero-glow-a {
          width: 1060px;
          height: 760px;
          top: -310px;
          right: -240px;
          background: var(--marketing-hero-glow-a);
          filter: blur(2px);
        }

        .marketing-hero-glow-b {
          width: 920px;
          height: 620px;
          top: -160px;
          left: -340px;
          background: var(--marketing-hero-glow-b);
        }

        .marketing-hero-orbit {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
          z-index: -2;
        }

        .marketing-hero-orbit-outer {
          width: 2850px;
          height: 2850px;
          top: -2480px;
          left: -370px;
          border: 3px solid var(--marketing-hero-orbit-outer);
          box-shadow: var(--marketing-hero-orbit-outer-glow);
        }

        .marketing-hero-orbit-inner {
          width: 2360px;
          height: 2360px;
          top: -2058px;
          left: 32px;
          border: 1px solid var(--marketing-hero-orbit-inner);
        }

        .marketing-hero-copy {
          position: relative;
          max-width: 980px;
          margin: 0 auto;
          text-align: center;
        }

        .marketing-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 999px;
          margin-bottom: 34px;
          font-size: 12px;
          letter-spacing: 0.03em;
          color: var(--marketing-hero-badge-text);
          border: 1px solid var(--marketing-hero-badge-border);
          background: var(--marketing-hero-badge-bg);
          backdrop-filter: blur(8px);
        }

        .marketing-hero-title {
          font-family: "Georgia", "Times New Roman", serif;
          font-size: clamp(34px, 5.2vw, 72px);
          line-height: 1.02;
          letter-spacing: -0.02em;
          margin-bottom: 24px;
          font-weight: 500;
          color: var(--marketing-hero-title);
          text-wrap: balance;
          text-shadow: var(--marketing-hero-title-shadow);
        }

        .marketing-hero-title span {
          display: block;
          margin-top: 8px;
          background: var(--marketing-hero-title-accent);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .marketing-hero-subtitle {
          max-width: 820px;
          margin: 0 auto 34px;
          font-size: clamp(14px, 1.6vw, 22px);
          line-height: 1.52;
          color: var(--marketing-hero-subtitle);
          text-wrap: pretty;
        }

        .marketing-hero-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .marketing-hero-primary,
        .marketing-hero-secondary {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          text-decoration: none;
          border-radius: 999px;
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }

        .marketing-hero-primary {
          padding: 14px 28px;
          color: var(--marketing-hero-primary-text);
          font-size: 15px;
          font-weight: 700;
          border: 1px solid var(--marketing-hero-primary-border);
          background: var(--marketing-hero-primary-bg);
          box-shadow: var(--marketing-hero-primary-shadow);
        }

        .marketing-hero-secondary {
          padding: 14px 24px;
          color: var(--marketing-hero-secondary-text);
          font-size: 15px;
          border: 1px solid var(--marketing-hero-secondary-border);
          background: var(--marketing-hero-secondary-bg);
        }

        .marketing-hero-primary:hover,
        .marketing-hero-secondary:hover {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--marketing-hero-secondary-border) 72%, white);
          box-shadow: var(--marketing-hero-primary-shadow);
        }

        .marketing-hero-note {
          margin-top: 16px;
          font-size: 12px;
          color: var(--marketing-hero-note);
        }

        .marketing-hero-stats {
          margin-top: 30px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 11px;
        }

        .marketing-hero-stat {
          padding: 14px 15px;
          border-radius: 14px;
          border: 1px solid var(--marketing-hero-stat-border);
          background: var(--marketing-hero-stat-bg);
          backdrop-filter: blur(8px);
        }

        .marketing-hero-stat strong {
          display: block;
          font-size: 20px;
          color: var(--marketing-hero-stat-title);
          margin-bottom: 5px;
          letter-spacing: -0.02em;
        }

        .marketing-hero-stat span {
          font-size: 11px;
          color: var(--marketing-hero-stat-caption);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .marketing-hero-showcase {
          position: relative;
          margin: 60px auto 0;
          max-width: 1160px;
          border-radius: 24px;
          border: 1px solid var(--marketing-hero-showcase-border);
          background: var(--marketing-hero-showcase-bg);
          box-shadow: var(--marketing-hero-showcase-shadow);
          overflow: hidden;
        }

        .marketing-hero-showcase-head {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 14px;
          border-bottom: 1px solid var(--marketing-hero-showcase-head-border);
          background: var(--marketing-hero-showcase-head-bg);
        }

        .marketing-hero-showcase-head .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--marketing-hero-showcase-dot);
        }

        .marketing-hero-showcase-head p {
          margin-left: 6px;
          font-size: 11px;
          font-family: "Geist Mono", monospace;
          color: var(--marketing-hero-showcase-label);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .marketing-hero-showcase img {
          width: 100%;
          height: auto;
          display: block;
          filter: var(--marketing-hero-showcase-image-filter);
        }

        .marketing-hero-chip {
          position: absolute;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid var(--marketing-hero-chip-border);
          background: var(--marketing-hero-chip-bg);
          backdrop-filter: blur(8px);
          color: var(--marketing-hero-chip-text);
          font-size: 12px;
          box-shadow: var(--marketing-hero-chip-shadow);
        }

        .marketing-hero-chip-a {
          top: 80px;
          right: 18px;
          animation: heroFloat 5.2s ease-in-out infinite;
        }

        .marketing-hero-chip-b {
          bottom: 22px;
          left: 20px;
          animation: heroFloat 6s ease-in-out infinite reverse;
        }

        .marketing-hero-partners {
          margin: 28px auto 0;
          max-width: 980px;
          text-align: center;
        }

        .marketing-hero-partners p {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--marketing-hero-partner-caption);
          margin-bottom: 12px;
        }

        .marketing-hero-partner-row {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 10px 24px;
        }

        .marketing-hero-partner-row span {
          font-size: 13px;
          color: var(--marketing-hero-partner-text);
          letter-spacing: 0.13em;
        }

        @keyframes heroFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-6px);
          }
        }

        @media (max-width: 980px) {
          .marketing-nav {
            padding: 14px 18px !important;
          }

          .marketing-nav-links {
            display: none !important;
          }

          .marketing-nav-actions a {
            padding: 7px 14px !important;
            font-size: 13px !important;
          }

          .marketing-hero {
            padding-top: 128px;
          }

          .marketing-hero-title {
            font-size: clamp(34px, 6vw, 62px);
          }

          .marketing-hero-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .marketing-hero-orbit-outer {
            width: 2250px;
            height: 2250px;
            top: -1960px;
            left: -560px;
          }

          .marketing-hero-orbit-inner {
            width: 1860px;
            height: 1860px;
            top: -1630px;
            left: -320px;
          }

          .marketing-section {
            padding: 72px 20px !important;
          }

          .marketing-feature-grid,
          .marketing-testimonials-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .marketing-footer {
            padding: 24px 20px !important;
          }
        }

        @media (max-width: 680px) {
          .marketing-hero {
            padding: 118px 16px 54px;
          }

          .marketing-hero-title {
            font-size: clamp(30px, 8.6vw, 46px);
            line-height: 1.06;
          }

          .marketing-hero-orbit-outer {
            width: 1680px;
            height: 1680px;
            top: -1450px;
            left: -520px;
          }

          .marketing-hero-orbit-inner {
            width: 1400px;
            height: 1400px;
            top: -1200px;
            left: -400px;
          }

          .marketing-hero-badge {
            font-size: 11px;
            padding: 7px 11px;
          }

          .marketing-hero-subtitle {
            margin-bottom: 24px;
            font-size: 15px;
          }

          .marketing-hero-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .marketing-hero-primary,
          .marketing-hero-secondary {
            justify-content: center;
            width: 100%;
          }

          .marketing-hero-stats {
            grid-template-columns: 1fr;
          }

          .marketing-hero-chip {
            position: static;
            margin: 10px 12px 0;
          }

          .marketing-hero-partner-row {
            gap: 8px 12px;
          }

          .marketing-hero-partner-row span {
            font-size: 11px;
            letter-spacing: 0.08em;
          }

          .marketing-section {
            padding: 54px 14px !important;
          }

          .marketing-feature-grid,
          .marketing-testimonials-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }

          .marketing-section-cta h2 {
            font-size: 34px !important;
          }

          .marketing-section-cta p {
            font-size: 15px !important;
          }

          .marketing-footer {
            flex-direction: column;
            align-items: flex-start !important;
            gap: 12px !important;
          }
        }
      `}</style>
    </div>
  );
}
