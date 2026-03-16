"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Sparkles, BarChart3, Users, ShieldCheck, Zap, Globe, ChevronRight, CheckCircle2, Clock3, BellRing, Monitor, Building2 } from "lucide-react";
import { PricingModule, type PricingPlan } from "@/components/ui/pricing-module";
import MarketingTopNav from "@/components/marketing/MarketingTopNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  DEFAULT_PRICING_PLANS,
  type PricingPlanDefinition,
} from "@/lib/pricing-plans";
import { fetchPublicPricingPlans } from "@/lib/platform-pricing";
import { buildBlogPostPath, fetchPublicBlogPosts, formatReadTime, type BlogPostSummary } from "@/lib/platform-blog";

const FEATURE_META = [
  { icon: Sparkles, color: "var(--accent)" },
  { icon: BarChart3, color: "#34d399" },
  { icon: Users, color: "#60a5fa" },
  { icon: ShieldCheck, color: "#f59e0b" },
  { icon: Zap, color: "#f87171" },
  { icon: Globe, color: "#a78bfa" },
] as const;

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

export default function LandingPage() {
  const { t, getValue } = useI18n();
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>(INITIAL_MARKETING_PRICING_PLANS);
  const [latestJournalPosts, setLatestJournalPosts] = useState<BlogPostSummary[]>([]);
  const features = useMemo(
    () =>
      ((getValue("landing.features", []) as Array<{ title: string; desc: string }>) || []).map((feature, index) => ({
        ...feature,
        ...FEATURE_META[index],
      })),
    [getValue],
  );
  const heroStats = (getValue("landing.heroStats", []) as Array<{ value: string; label: string }>) || [];
  const judithTags = (getValue("landing.judithTags", []) as string[]) || [];
  const judithCards =
    (getValue("landing.judithCards", []) as Array<{ title: string; desc: string }>) || [];
  const testimonials =
    (getValue(
      "landing.testimonials",
      [],
    ) as Array<{ name: string; role: string; text: string; avatar: string }>) || [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/") return;

    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authKeys = ["code", "token_hash", "type", "error", "error_code", "error_description", "access_token", "refresh_token"];
    const hasAuthParams = authKeys.some((key) => search.has(key) || hash.has(key));

    if (hasAuthParams) {
      window.location.replace(`/auth/callback${window.location.search}${window.location.hash}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPricing = async () => {
      const plans = await fetchPublicPricingPlans();
      if (!cancelled) setPricingPlans(toMarketingPlans(plans));
    };

    void loadPricing();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadJournal = async () => {
      try {
        const posts = await fetchPublicBlogPosts(false);
        if (!cancelled) {
          setLatestJournalPosts(posts.slice(0, 3));
        }
      } catch {
        if (!cancelled) {
          setLatestJournalPosts([]);
        }
      }
    };

    void loadJournal();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ background: "var(--bg-canvas)", color: "var(--text-primary)", fontFamily: "system-ui, -apple-system, sans-serif", minHeight: "100vh" }}>
      <MarketingTopNav currentPath="/" />

      {/* Hero */}
      <section className="marketing-hero">
        <div className="marketing-hero-grid" />
        <div className="marketing-hero-glow marketing-hero-glow-a" />
        <div className="marketing-hero-glow marketing-hero-glow-b" />
        <div className="marketing-hero-orbit marketing-hero-orbit-outer" />
        <div className="marketing-hero-orbit marketing-hero-orbit-inner" />

        <div className="marketing-hero-shell">
          <div className="marketing-hero-copy">
            <div className="marketing-hero-badge">
              <Sparkles size={12} />
              {t("landing.heroBadge")}
              <ChevronRight size={12} />
            </div>

            <h1 className="marketing-hero-title">
              {t("landing.heroTitleLine1")}
              <span>{t("landing.heroTitleLine2")}</span>
            </h1>

            <p className="marketing-hero-subtitle">
              {t("landing.heroSubtitle")}
            </p>

            <div className="marketing-hero-actions">
              <Link href="/signup" className="marketing-hero-primary">
                {t("landing.heroPrimaryCta")} <ArrowRight size={16} />
              </Link>
              <Link href="/login" className="marketing-hero-secondary">
                {t("landing.heroSecondaryCta")}
              </Link>
            </div>

            <p className="marketing-hero-note">{t("landing.heroNote")}</p>
          </div>

          <div className="marketing-hero-visual">
            <div className="marketing-hero-showcase">
              <div className="marketing-hero-showcase-head">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
                <p>{t("landing.showcaseTitle")}</p>
              </div>
              <img src="/dashboard-screenshot.png" alt="Benela AI platform command center dashboard" />
              <div className="marketing-hero-chip marketing-hero-chip-a">{t("landing.showcaseChipA")}</div>
            </div>
          </div>
        </div>

        <div className="marketing-hero-stats">
          {heroStats.map((item) => (
            <div key={`${item.value}-${item.label}`} className="marketing-hero-stat">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="marketing-section marketing-section-features" style={{ padding: "96px 40px 40px", maxWidth: "1240px", margin: "0 auto" }}>
        <div className="marketing-surface-shell">
          <div className="marketing-surface-header">
            <div style={{ textAlign: "center", marginBottom: "8px" }}>
              <div style={{ fontSize: "12px", color: "var(--accent)", letterSpacing: "0.16em", fontFamily: "monospace", marginBottom: "12px" }}>{t("landing.featuresEyebrow")}</div>
              <h2 style={{ fontSize: "clamp(34px, 4.4vw, 52px)", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.08, letterSpacing: "-0.04em", marginBottom: "16px" }}>
                {t("landing.featuresTitle")}
              </h2>
              <p style={{ fontSize: "17px", color: "var(--text-subtle)", maxWidth: "620px", margin: "0 auto", lineHeight: 1.75 }}>
                {t("landing.featuresSubtitle")}
              </p>
            </div>
          </div>

          <div className="marketing-feature-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
            {features.map((f, index) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="marketing-feature-card"
                  style={{
                    background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 96%, white 4%), var(--bg-surface))",
                    border: "1px solid var(--border-default)",
                    borderRadius: "22px",
                    padding: "28px",
                    position: "relative",
                    overflow: "hidden",
                    transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
                    boxShadow: "0 16px 40px color-mix(in srgb, var(--brand-glow) 8%, transparent)",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = `${f.color}44`;
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                    (e.currentTarget as HTMLElement).style.boxShadow = `0 24px 54px color-mix(in srgb, ${f.color} 16%, transparent)`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
                    (e.currentTarget as HTMLElement).style.transform = "none";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 40px color-mix(in srgb, var(--brand-glow) 8%, transparent)";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                      marginBottom: "20px",
                    }}
                  >
                    <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `${f.color}12`, border: `1px solid ${f.color}24`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={21} color={f.color} />
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-subtle)",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        borderRadius: "999px",
                        border: "1px solid color-mix(in srgb, var(--border-default) 84%, transparent)",
                        background: "color-mix(in srgb, var(--bg-panel) 94%, transparent)",
                        padding: "6px 10px",
                      }}
                    >
                      0{index + 1}
                    </div>
                  </div>
                  <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "10px", letterSpacing: "-0.02em" }}>{f.title}</h3>
                  <p style={{ fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.8, margin: 0 }}>{f.desc}</p>
                  <div style={{ position: "absolute", inset: "auto -15% -30% auto", width: "140px", height: "140px", borderRadius: "50%", background: `radial-gradient(circle, ${f.color}18, transparent 72%)`, pointerEvents: "none" }} />
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2px", background: `linear-gradient(90deg, transparent, ${f.color}44, transparent)` }} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="marketing-section"
        style={{ padding: "24px 40px 86px", maxWidth: "1240px", margin: "0 auto" }}
      >
        <div className="marketing-surface-shell marketing-judith-shell">
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
                padding: "7px 11px",
                marginBottom: "16px",
                background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              }}
            >
              <Sparkles size={13} />
              {t("landing.judithBadge")}
            </div>
            <h3 style={{ margin: 0, fontSize: "clamp(30px, 4vw, 42px)", lineHeight: 1.1, letterSpacing: "-0.04em", color: "var(--text-primary)" }}>
              {t("landing.judithTitle")}
            </h3>
            <p style={{ marginTop: "14px", marginBottom: 0, fontSize: "16px", lineHeight: 1.85, color: "var(--text-subtle)", maxWidth: "620px" }}>
              {t("landing.judithBody")}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "18px" }}>
              {judithTags.map((item) => (
                <span
                  key={item}
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    borderRadius: "999px",
                    border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
                    background: "color-mix(in srgb, var(--bg-panel) 94%, transparent)",
                    padding: "8px 11px",
                    fontWeight: 600,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="marketing-judith-console">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>
                  Judith workspace
                </div>
                <div style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Task and event orchestration
                </div>
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: "999px",
                  background: "color-mix(in srgb, var(--success) 12%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--success) 26%, transparent)",
                  color: "var(--success)",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                Live
              </div>
            </div>
            {[CheckCircle2, Clock3, BellRing].map((Icon, index) => {
              const item = judithCards[index];
              if (!item) return null;
              return (
                <div
                  key={item.title}
                  className="marketing-judith-item"
                  style={{
                    border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
                    borderRadius: "16px",
                    background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 97%, white 3%), var(--bg-surface))",
                    padding: "15px",
                    display: "flex",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "11px",
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
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{item.title}</div>
                    <div style={{ fontSize: "13px", color: "var(--text-subtle)", marginTop: "4px", lineHeight: 1.65 }}>{item.desc}</div>
                  </div>
                </div>
              );
            })}
            <div className="marketing-judith-summary">
              <div>
                <strong>3</strong>
                <span>active workflows</span>
              </div>
              <div>
                <strong>24/7</strong>
                <span>assistant coverage</span>
              </div>
              <div>
                <strong>1 hub</strong>
                <span>tasks, events, reminders</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <div id="pricing">
        <PricingModule
          title={t("landing.pricingTitle")}
          subtitle={t("landing.pricingSubtitle")}
          annualBillingLabel={t("landing.pricingAnnualLabel")}
          buttonLabel={t("landing.pricingButton")}
          plans={pricingPlans}
          defaultAnnual={false}
          className="marketing-pricing-wrap"
        />
      </div>

      {/* Testimonials */}
      <section className="marketing-section marketing-section-testimonials" style={{ padding: "24px 40px 86px", maxWidth: "1240px", margin: "0 auto" }}>
        <div className="marketing-surface-shell">
          <div className="marketing-surface-header">
            <div style={{ textAlign: "center", marginBottom: "8px" }}>
              <div style={{ fontSize: "12px", color: "var(--accent)", letterSpacing: "0.16em", fontFamily: "monospace", marginBottom: "12px" }}>{t("landing.testimonialsEyebrow")}</div>
              <h2 style={{ fontSize: "clamp(34px, 4vw, 48px)", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.08, letterSpacing: "-0.04em", marginBottom: "10px" }}>{t("landing.testimonialsTitle")}</h2>
            </div>
          </div>

        <div className="marketing-testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px" }}>
          {testimonials.map((item) => (
            <div key={item.name} className="marketing-testimonial-card" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 96%, white 4%), var(--bg-surface))", border: "1px solid var(--border-default)", borderRadius: "22px", padding: "28px", boxShadow: "0 16px 42px color-mix(in srgb, var(--brand-glow) 8%, transparent)" }}>
              <div style={{ fontSize: "40px", color: "var(--accent)", marginBottom: "18px", lineHeight: 0.9, fontWeight: 700 }}>&ldquo;</div>
              <p style={{ fontSize: "15px", color: "var(--text-muted)", lineHeight: 1.85, marginBottom: "24px" }}>{item.text}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "white", flexShrink: 0, boxShadow: "0 10px 24px color-mix(in srgb, var(--accent) 20%, transparent)" }}>
                  {item.avatar}
                </div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{item.name}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{item.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        </div>
      </section>

      {latestJournalPosts.length ? (
        <section className="marketing-section" style={{ padding: "0 40px 86px", maxWidth: "1240px", margin: "0 auto" }}>
          <div className="marketing-surface-shell">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                gap: "18px",
                flexWrap: "wrap",
                marginBottom: "28px",
                position: "relative",
              }}
            >
              <div style={{ maxWidth: "660px" }}>
                <div style={{ fontSize: "12px", color: "var(--accent)", letterSpacing: "0.16em", fontFamily: "monospace", marginBottom: "12px" }}>
                  BENELA JOURNAL
                </div>
                <h2
                  style={{
                    fontSize: "clamp(32px, 4vw, 46px)",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    lineHeight: 1.08,
                    letterSpacing: "-0.04em",
                    margin: 0,
                  }}
                >
                  Latest thinking from the Benela editorial desk.
                </h2>
                <p style={{ marginTop: "14px", marginBottom: 0, fontSize: "16px", lineHeight: 1.8, color: "var(--text-subtle)" }}>
                  Product updates, operating insight, industry analysis, and rollout guidance from the team building AI-native ERP infrastructure.
                </p>
              </div>

              <Link
                href="/blog"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  minHeight: "46px",
                  padding: "0 18px",
                  borderRadius: "14px",
                  border: "1px solid color-mix(in srgb, var(--accent) 26%, var(--border-default))",
                  background: "color-mix(in srgb, var(--bg-surface) 92%, transparent)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Explore the journal <ArrowRight size={16} />
              </Link>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px" }} className="marketing-testimonials-grid">
              {latestJournalPosts.map((post) => (
                <Link key={post.id} href={buildBlogPostPath(post)} style={{ textDecoration: "none" }}>
                  <article
                    style={{
                      height: "100%",
                      display: "grid",
                      alignContent: "start",
                      borderRadius: "24px",
                      border: "1px solid var(--border-default)",
                      background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 96%, white 4%), var(--bg-surface))",
                      overflow: "hidden",
                      boxShadow: "0 20px 48px rgba(15, 23, 42, 0.08)",
                    }}
                  >
                    {post.cover_image_url ? (
                      <div
                        style={{
                          aspectRatio: "16 / 9",
                          backgroundImage: `url(${post.cover_image_url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          aspectRatio: "16 / 9",
                          background:
                            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent-2) 16%, transparent))",
                        }}
                      />
                    )}

                    <div style={{ padding: "20px", display: "grid", gap: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            minHeight: "30px",
                            padding: "0 12px",
                            borderRadius: "999px",
                            border: "1px solid color-mix(in srgb, var(--accent) 24%, var(--border-default))",
                            background: post.is_featured
                              ? "color-mix(in srgb, var(--accent-soft) 18%, transparent)"
                              : "color-mix(in srgb, var(--bg-panel) 92%, transparent)",
                            color: post.is_featured ? "var(--accent)" : "var(--text-subtle)",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {post.is_featured ? "Featured" : post.category}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--text-quiet)" }}>
                          {formatLandingDate(post.published_at)}
                        </span>
                      </div>

                      <h3 style={{ margin: 0, fontSize: "24px", lineHeight: 1.1, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
                        {post.title}
                      </h3>
                      <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.76, color: "var(--text-subtle)" }}>{post.excerpt}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", fontSize: "12px", color: "var(--text-quiet)" }}>
                        <span>{post.author_name}</span>
                        <span>{formatReadTime(post.read_time_minutes)}</span>
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* CTA */}
      <section className="marketing-section marketing-section-cta" style={{ padding: "10px 40px 100px", position: "relative", overflow: "hidden" }}>
        <div className="marketing-cta-shell">
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "760px", height: "420px", background: "radial-gradient(ellipse, color-mix(in srgb, var(--accent) 12%, transparent) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ maxWidth: "760px", margin: "0 auto", position: "relative", textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "14px", padding: "8px 12px", borderRadius: "999px", border: "1px solid color-mix(in srgb, var(--accent) 26%, transparent)", background: "color-mix(in srgb, var(--accent-soft) 72%, transparent)", color: "var(--accent)", fontSize: "12px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Ready to launch
            </div>
            <h2 style={{ fontSize: "clamp(36px, 5vw, 58px)", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.08, marginBottom: "18px", letterSpacing: "-0.05em" }}>
            {t("landing.ctaTitle")}
            </h2>
            <p style={{ fontSize: "18px", color: "var(--text-subtle)", marginBottom: "34px", lineHeight: 1.8 }}>
            {t("landing.ctaSubtitle")}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
              <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "16px 34px", borderRadius: "16px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "white", fontSize: "16px", fontWeight: 700, textDecoration: "none", boxShadow: "0 20px 42px color-mix(in srgb, var(--accent) 26%, transparent)" }}>
                {t("landing.ctaButton")} <ArrowRight size={18} />
              </Link>
              <Link href="/about" style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "16px 24px", borderRadius: "16px", background: "color-mix(in srgb, var(--bg-panel) 94%, transparent)", color: "var(--text-primary)", fontSize: "15px", fontWeight: 700, textDecoration: "none", border: "1px solid color-mix(in srgb, var(--border-default) 84%, transparent)" }}>
                Learn more
              </Link>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-quiet)", marginTop: "18px" }}>{t("landing.ctaNote")}</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <MarketingFooter />
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

        .marketing-surface-shell {
          position: relative;
          border-radius: 32px;
          border: 1px solid color-mix(in srgb, var(--border-default) 88%, transparent);
          background:
            radial-gradient(720px 320px at 0% 0%, color-mix(in srgb, var(--accent-soft) 62%, transparent), transparent 70%),
            linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 95%, white 5%), var(--bg-surface));
          padding: 34px;
          box-shadow: 0 24px 70px color-mix(in srgb, var(--brand-glow) 10%, transparent);
          overflow: hidden;
        }

        .marketing-surface-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to right, color-mix(in srgb, var(--border-default) 14%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in srgb, var(--border-default) 10%, transparent) 1px, transparent 1px);
          background-size: 88px 88px;
          opacity: 0.28;
          pointer-events: none;
        }

        .marketing-surface-header {
          position: relative;
          margin-bottom: 28px;
        }

        .marketing-judith-shell {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
          gap: 26px;
          align-items: start;
        }

        .marketing-judith-console {
          position: relative;
          border-radius: 22px;
          border: 1px solid color-mix(in srgb, var(--border-default) 84%, transparent);
          background: color-mix(in srgb, var(--bg-panel) 96%, white 4%);
          padding: 20px;
          display: grid;
          gap: 12px;
          box-shadow: inset 0 1px 0 color-mix(in srgb, white 48%, transparent);
        }

        .marketing-judith-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 6px;
        }

        .marketing-judith-summary > div {
          border-radius: 16px;
          border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent);
          background: color-mix(in srgb, var(--bg-surface) 96%, white 4%);
          padding: 12px;
          display: grid;
          gap: 4px;
        }

        .marketing-judith-summary strong {
          font-size: 18px;
          line-height: 1;
          color: var(--text-primary);
          letter-spacing: -0.03em;
        }

        .marketing-judith-summary span {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-subtle);
        }

        .marketing-pricing-wrap {
          border-top: 1px solid color-mix(in srgb, var(--border-default) 44%, transparent);
          border-bottom: 1px solid color-mix(in srgb, var(--border-default) 44%, transparent);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 26%, transparent), transparent 32%),
            transparent;
        }

        .marketing-testimonial-card {
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .marketing-testimonial-card:hover {
          transform: translateY(-4px);
          border-color: color-mix(in srgb, var(--accent) 22%, var(--border-default));
          box-shadow: 0 24px 56px color-mix(in srgb, var(--accent) 12%, transparent);
        }

        .marketing-cta-shell {
          position: relative;
          max-width: 1240px;
          margin: 0 auto;
          border-radius: 34px;
          border: 1px solid color-mix(in srgb, var(--border-default) 86%, transparent);
          background:
            radial-gradient(900px 300px at 50% 0%, color-mix(in srgb, var(--accent-soft) 62%, transparent), transparent 72%),
            linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 95%, white 5%), var(--bg-surface));
          box-shadow: 0 28px 72px color-mix(in srgb, var(--brand-glow) 12%, transparent);
          padding: 56px 34px;
          overflow: hidden;
        }

        .marketing-footer-shell {
          max-width: 1240px;
          margin: 0 auto;
          padding: 26px 28px;
          border-radius: 24px;
          border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent);
          background: color-mix(in srgb, var(--bg-surface) 96%, white 4%);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          box-shadow: 0 18px 44px color-mix(in srgb, var(--brand-glow) 8%, transparent);
        }

        .marketing-hero {
          position: relative;
          overflow: hidden;
          padding: 136px 24px 56px;
          width: 100%;
          margin: 0;
          isolation: isolate;
          background: var(--marketing-hero-bg);
          border-bottom: 1px solid var(--marketing-hero-divider);
        }

        .marketing-hero-shell {
          position: relative;
          max-width: 1240px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 0.88fr) minmax(420px, 1.12fr);
          gap: 48px;
          align-items: center;
        }

        .marketing-hero-grid {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to right, var(--marketing-hero-grid-line-x) 1px, transparent 1px),
            linear-gradient(to bottom, var(--marketing-hero-grid-line-y) 1px, transparent 1px);
          background-size: 96px 96px;
          mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.78), rgba(0, 0, 0, 0.36) 58%, transparent 100%);
          opacity: 0.72;
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
          width: 940px;
          height: 660px;
          top: -260px;
          right: -180px;
          background: var(--marketing-hero-glow-a);
          filter: blur(2px);
        }

        .marketing-hero-glow-b {
          width: 780px;
          height: 540px;
          top: -110px;
          left: -250px;
          background: var(--marketing-hero-glow-b);
          opacity: 0.88;
        }

        .marketing-hero-orbit {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
          z-index: -2;
        }

        .marketing-hero-orbit-outer {
          width: 2040px;
          height: 2040px;
          top: -1750px;
          left: -420px;
          border: 2px solid var(--marketing-hero-orbit-outer);
          box-shadow: var(--marketing-hero-orbit-outer-glow);
          opacity: 0.44;
        }

        .marketing-hero-orbit-inner {
          width: 1540px;
          height: 1540px;
          top: -1350px;
          left: 280px;
          border: 1px solid var(--marketing-hero-orbit-inner);
          opacity: 0.26;
        }

        .marketing-hero-copy {
          position: relative;
          max-width: 540px;
          justify-self: start;
          text-align: left;
          z-index: 1;
        }

        .marketing-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 999px;
          margin-bottom: 20px;
          font-size: 12px;
          letter-spacing: 0.03em;
          color: var(--marketing-hero-badge-text);
          border: 1px solid var(--marketing-hero-badge-border);
          background: var(--marketing-hero-badge-bg);
          backdrop-filter: blur(8px);
        }

        .marketing-hero-title {
          font-family: "Geist", -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: clamp(32px, 4.2vw, 58px);
          line-height: 0.96;
          letter-spacing: -0.055em;
          margin-bottom: 18px;
          font-weight: 700;
          color: var(--marketing-hero-title);
          text-wrap: balance;
        }

        .marketing-hero-title span {
          display: block;
          margin-top: 8px;
          color: var(--accent);
          background: none;
          -webkit-text-fill-color: currentColor;
        }

        .marketing-hero-subtitle {
          max-width: 520px;
          margin: 0 0 24px;
          font-size: clamp(16px, 1.32vw, 19px);
          line-height: 1.7;
          color: var(--marketing-hero-subtitle);
          text-wrap: pretty;
        }

        .marketing-hero-actions {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 14px;
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
          max-width: 440px;
          font-size: 13px;
          line-height: 1.6;
          letter-spacing: 0.01em;
          color: var(--marketing-hero-note);
          margin: 0;
        }

        .marketing-hero-visual {
          position: relative;
          width: 100%;
          max-width: 740px;
          justify-self: end;
        }

        .marketing-hero-stats {
          margin: 24px auto 0;
          max-width: 1240px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .marketing-hero-stat {
          min-height: 96px;
          padding: 16px 18px;
          border-radius: 20px;
          border: 1px solid var(--marketing-hero-stat-border);
          background: var(--marketing-hero-stat-bg);
          backdrop-filter: blur(12px);
          box-shadow: 0 14px 28px color-mix(in srgb, var(--brand-glow) 8%, transparent);
        }

        .marketing-hero-stat strong {
          display: block;
          font-size: 18px;
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
          margin: 0;
          width: 100%;
          border-radius: 30px;
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
          font-size: 11px;
          font-weight: 600;
          box-shadow: var(--marketing-hero-chip-shadow);
        }

        .marketing-hero-chip-a {
          top: 20px;
          right: 16px;
          animation: heroFloat 5.2s ease-in-out infinite;
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
            padding: 124px 18px 60px;
          }

          .marketing-hero-shell {
            grid-template-columns: 1fr;
            gap: 26px;
          }

          .marketing-hero-copy {
            max-width: 720px;
            margin: 0 auto;
            text-align: center;
          }

          .marketing-hero-visual {
            justify-self: center;
            max-width: 760px;
          }

          .marketing-hero-actions {
            justify-content: center;
          }

          .marketing-hero-title {
            font-size: clamp(32px, 6vw, 54px);
          }

          .marketing-hero-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .marketing-hero-orbit-outer {
            width: 1820px;
            height: 1820px;
            top: -1560px;
            left: -620px;
          }

          .marketing-hero-orbit-inner {
            width: 1480px;
            height: 1480px;
            top: -1260px;
            left: -120px;
          }

          .marketing-section {
            padding: 72px 20px !important;
          }

          .marketing-surface-shell {
            padding: 26px !important;
            border-radius: 26px !important;
          }

          .marketing-judith-shell {
            grid-template-columns: 1fr !important;
          }

          .marketing-judith-summary {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .marketing-feature-grid,
          .marketing-testimonials-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .marketing-footer {
            padding: 0 20px 24px !important;
          }

          .marketing-cta-shell {
            padding: 40px 24px !important;
          }
        }

        @media (max-width: 680px) {
          .marketing-hero {
            padding: 112px 14px 48px;
          }

          .marketing-hero-title {
            font-size: clamp(28px, 8vw, 40px);
            line-height: 1.02;
          }

          .marketing-hero-orbit-outer {
            width: 1320px;
            height: 1320px;
            top: -1120px;
            left: -470px;
          }

          .marketing-hero-orbit-inner {
            width: 1060px;
            height: 1060px;
            top: -900px;
            left: -180px;
          }

          .marketing-hero-badge {
            font-size: 11px;
            padding: 7px 11px;
          }

          .marketing-hero-subtitle {
            margin-bottom: 22px;
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

          .marketing-section {
            padding: 54px 14px !important;
          }

          .marketing-feature-grid,
          .marketing-testimonials-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }

          .marketing-surface-shell {
            padding: 20px !important;
            border-radius: 22px !important;
          }

          .marketing-judith-summary {
            grid-template-columns: 1fr !important;
          }

          .marketing-section-cta h2 {
            font-size: 34px !important;
          }

          .marketing-section-cta p {
            font-size: 15px !important;
          }

          .marketing-footer {
            padding: 0 14px 18px !important;
          }

          .marketing-footer-shell {
            flex-direction: column;
            align-items: flex-start !important;
            gap: 12px !important;
            padding: 18px !important;
          }
        }
      `}</style>
    </div>
  );
}

function formatLandingDate(value?: string | null) {
  if (!value) return "Draft";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Draft";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
