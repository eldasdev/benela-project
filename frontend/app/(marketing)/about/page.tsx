"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Sparkles, Target, Users2, ShieldCheck } from "lucide-react";
import MarketingTopNav from "@/components/marketing/MarketingTopNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { DEFAULT_ABOUT_CONTENT, type AboutPageContent } from "@/lib/platform-about";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

export default function AboutPage() {
  const { t, getValue } = useI18n();
  const [content, setContent] = useState<AboutPageContent>(DEFAULT_ABOUT_CONTENT);
  const [openFaq, setOpenFaq] = useState(0);
  const storyCards =
    (getValue("about.storyCards", []) as Array<{ title: string; body: string }>) || [];

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`${API}/platform/about`);
        if (!res.ok) return;
        const data = (await res.json()) as AboutPageContent;
        if (!cancelled) {
          setContent({
            ...DEFAULT_ABOUT_CONTENT,
            ...data,
            platform_highlights: data.platform_highlights?.length ? data.platform_highlights : DEFAULT_ABOUT_CONTENT.platform_highlights,
            mission_points: data.mission_points?.length ? data.mission_points : DEFAULT_ABOUT_CONTENT.mission_points,
            team_members: data.team_members?.length ? data.team_members : DEFAULT_ABOUT_CONTENT.team_members,
            faqs: data.faqs?.length ? data.faqs : DEFAULT_ABOUT_CONTENT.faqs,
          });
        }
      } catch {
        // Keep default content if backend is temporarily unavailable.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ background: "var(--bg-canvas)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <MarketingTopNav currentPath="/about" />

      <section
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "132px 40px 72px",
          borderBottom: "1px solid var(--marketing-hero-divider)",
          background:
            "radial-gradient(940px 480px at 85% 5%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%), var(--marketing-hero-bg)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to right, color-mix(in srgb, var(--marketing-hero-grid-line-x) 100%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--marketing-hero-grid-line-y) 100%, transparent) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            opacity: 0.5,
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", maxWidth: "1220px", margin: "0 auto" }}>
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
              letterSpacing: "0.08em",
            }}
          >
            <Sparkles size={13} />
            {content.hero_eyebrow}
          </div>

          <div
            style={{
              marginTop: "26px",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
              gap: "28px",
              alignItems: "start",
            }}
            className="about-hero-grid"
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(42px, 6vw, 78px)",
                  lineHeight: 0.96,
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  maxWidth: "900px",
                }}
              >
                {content.hero_title}
              </h1>
              <p
                style={{
                  marginTop: "22px",
                  maxWidth: "760px",
                  fontSize: "18px",
                  lineHeight: 1.75,
                  color: "var(--text-subtle)",
                }}
              >
                {content.hero_subtitle}
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "30px" }}>
                <Link
                  href="/signup"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "14px 20px",
                    borderRadius: "14px",
                    textDecoration: "none",
                    color: "var(--marketing-hero-primary-text)",
                    border: "1px solid var(--marketing-hero-primary-border)",
                    background: "var(--marketing-hero-primary-bg)",
                    boxShadow: "var(--marketing-hero-primary-shadow)",
                    fontWeight: 700,
                  }}
                >
                  {t("about.startTrial")}
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/login"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "14px 20px",
                    borderRadius: "14px",
                    textDecoration: "none",
                    color: "var(--marketing-hero-secondary-text)",
                    border: "1px solid var(--marketing-hero-secondary-border)",
                    background: "var(--marketing-hero-secondary-bg)",
                    fontWeight: 600,
                  }}
                >
                  {t("about.explorePlatform")}
                </Link>
              </div>
            </div>

            <div
              style={{
                borderRadius: "28px",
                border: "1px solid var(--border-default)",
                background: "color-mix(in srgb, var(--bg-surface) 86%, var(--accent-soft) 14%)",
                boxShadow: "0 30px 80px rgba(9, 16, 28, 0.16)",
                padding: "24px",
                display: "grid",
                gap: "14px",
              }}
            >
              {content.platform_highlights.map((item) => (
                <div
                  key={item.title}
                  style={{
                    borderRadius: "18px",
                    border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
                    background: "color-mix(in srgb, var(--bg-panel) 86%, var(--accent-soft) 14%)",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
                    <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>{item.title}</h3>
                    {item.metric ? (
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "var(--accent)",
                          padding: "5px 10px",
                          borderRadius: "999px",
                          background: "color-mix(in srgb, var(--accent-soft) 84%, transparent)",
                        }}
                      >
                        {item.metric}
                      </span>
                    ) : null}
                  </div>
                  <p style={{ margin: "10px 0 0", color: "var(--text-subtle)", fontSize: "14px", lineHeight: 1.7 }}>
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <main style={{ maxWidth: "1220px", margin: "0 auto", padding: "72px 40px 110px" }}>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(300px, 0.9fr)",
            gap: "22px",
            alignItems: "stretch",
          }}
          className="about-story-grid"
        >
          <div
            style={{
              padding: "30px",
              borderRadius: "24px",
              border: "1px solid var(--border-default)",
              background: "color-mix(in srgb, var(--bg-surface) 88%, var(--accent-soft) 12%)",
            }}
          >
            <div style={{ display: "inline-flex", padding: "8px 12px", borderRadius: "999px", background: "color-mix(in srgb, var(--accent-soft) 84%, transparent)", color: "var(--accent)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em" }}>
              {t("about.platformStory")}
            </div>
            <h2 style={{ margin: "18px 0 0", fontSize: "34px", lineHeight: 1.1 }}>{content.story_title}</h2>
            <p style={{ margin: "18px 0 0", color: "var(--text-subtle)", fontSize: "16px", lineHeight: 1.8 }}>
              {content.story_body}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "14px",
            }}
          >
            {[Target, Users2, ShieldCheck, Sparkles].map((Icon, index) => {
              const card = storyCards[index];
              if (!card) return null;
              return (
                <div
                  key={card.title}
                  style={{
                    padding: "20px",
                    borderRadius: "20px",
                    border: "1px solid var(--border-default)",
                    background: "color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%)",
                  }}
                >
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "color-mix(in srgb, var(--accent-soft) 86%, transparent)",
                      color: "var(--accent)",
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <h3 style={{ margin: "14px 0 0", fontSize: "16px" }}>{card.title}</h3>
                  <p style={{ margin: "10px 0 0", fontSize: "13px", lineHeight: 1.7, color: "var(--text-subtle)" }}>{card.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ marginTop: "72px" }}>
          <div style={{ maxWidth: "720px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", color: "var(--accent)" }}>{t("about.missionEyebrow")}</div>
            <h2 style={{ margin: "16px 0 0", fontSize: "38px", lineHeight: 1.12 }}>{content.mission_title}</h2>
            <p style={{ margin: "16px 0 0", color: "var(--text-subtle)", fontSize: "16px", lineHeight: 1.8 }}>{content.mission_body}</p>
          </div>
          <div
            style={{
              marginTop: "28px",
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "18px",
            }}
            className="about-mission-grid"
          >
            {content.mission_points.map((item, index) => (
              <div
                key={`${item.title}-${index}`}
                style={{
                  padding: "24px",
                  borderRadius: "22px",
                  border: "1px solid var(--border-default)",
                  background: "linear-gradient(155deg, color-mix(in srgb, var(--bg-surface) 90%, var(--accent-soft) 10%), color-mix(in srgb, var(--bg-panel) 95%, transparent))",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em" }}>
                  0{index + 1}
                </div>
                <h3 style={{ margin: "12px 0 0", fontSize: "20px", lineHeight: 1.2 }}>{item.title}</h3>
                <p style={{ margin: "12px 0 0", fontSize: "14px", lineHeight: 1.8, color: "var(--text-subtle)" }}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "72px" }}>
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: "18px", flexWrap: "wrap" }}>
            <div style={{ maxWidth: "760px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", color: "var(--accent)" }}>{t("about.teamEyebrow")}</div>
              <h2 style={{ margin: "16px 0 0", fontSize: "38px", lineHeight: 1.12 }}>{content.team_title}</h2>
              <p style={{ margin: "16px 0 0", color: "var(--text-subtle)", fontSize: "16px", lineHeight: 1.8 }}>{content.team_body}</p>
            </div>
          </div>
          <div
            style={{
              marginTop: "28px",
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "18px",
            }}
            className="about-team-grid"
          >
            {content.team_members.map((member) => (
              <div
                key={`${member.name}-${member.role}`}
                style={{
                  padding: "24px",
                  borderRadius: "24px",
                  border: "1px solid var(--border-default)",
                  background: "color-mix(in srgb, var(--bg-surface) 90%, var(--accent-soft) 10%)",
                  boxShadow: "0 20px 46px rgba(5, 10, 24, 0.08)",
                }}
              >
                <div
                  style={{
                    width: "58px",
                    height: "58px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: "20px",
                    boxShadow: "0 16px 34px color-mix(in srgb, var(--accent) 34%, transparent)",
                  }}
                >
                  {member.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <h3 style={{ margin: "18px 0 0", fontSize: "20px" }}>{member.name}</h3>
                <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em" }}>
                  {member.role}
                </div>
                <p style={{ margin: "14px 0 0", fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.75 }}>
                  {member.bio}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "72px" }}>
          <div style={{ maxWidth: "760px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", color: "var(--accent)" }}>{t("about.faqEyebrow")}</div>
            <h2 style={{ margin: "16px 0 0", fontSize: "38px", lineHeight: 1.12 }}>{content.faq_title}</h2>
            <p style={{ margin: "16px 0 0", color: "var(--text-subtle)", fontSize: "16px", lineHeight: 1.8 }}>{content.faq_body}</p>
          </div>
          <div style={{ marginTop: "28px", display: "grid", gap: "14px" }}>
            {content.faqs.map((item, index) => {
              const isOpen = openFaq === index;
              return (
                <button
                  key={item.question}
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? -1 : index)}
                  style={{
                    textAlign: "left",
                    padding: "22px 24px",
                    borderRadius: "22px",
                    border: "1px solid var(--border-default)",
                    background: "color-mix(in srgb, var(--bg-surface) 88%, var(--accent-soft) 12%)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "18px" }}>
                    <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{item.question}</span>
                    <ChevronDown
                      size={18}
                      style={{
                        color: "var(--text-subtle)",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.18s ease",
                        flexShrink: 0,
                      }}
                    />
                  </div>
                  {isOpen ? (
                    <p style={{ margin: "14px 0 0", fontSize: "15px", lineHeight: 1.8, color: "var(--text-subtle)" }}>
                      {item.answer}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <MarketingFooter />

      <style>{`
        @media (max-width: 980px) {
          .about-hero-grid,
          .about-story-grid,
          .about-mission-grid,
          .about-team-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 720px) {
          .marketing-nav {
            padding: 14px 18px !important;
          }
        }
      `}</style>
    </div>
  );
}
