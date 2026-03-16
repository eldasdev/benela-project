"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, Newspaper, RefreshCcw, Sparkles } from "lucide-react";
import MarketingTopNav from "@/components/marketing/MarketingTopNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { buildBlogPostPath, fetchPublicBlogPosts, formatReadTime, type BlogPostSummary } from "@/lib/platform-blog";

function formatDate(value?: string | null) {
  if (!value) return "Draft";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Draft";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function BlogIndexPage() {
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const payload = await fetchPublicBlogPosts(false);
        if (!cancelled) setPosts(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load blog posts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => ["all", ...Array.from(new Set(posts.map((item) => item.category).filter(Boolean)))], [posts]);
  const featured = posts.find((item) => item.is_featured) || posts[0] || null;
  const filtered = posts.filter((item) => activeCategory === "all" || item.category === activeCategory);
  const gridPosts = filtered.filter((item) => item.slug !== featured?.slug || activeCategory !== "all");

  return (
    <div style={{ background: "var(--bg-canvas)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <MarketingTopNav currentPath="/blog" />

      <section
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "132px 40px 74px",
          borderBottom: "1px solid var(--marketing-hero-divider)",
          background:
            "radial-gradient(960px 500px at 84% 6%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 58%), var(--marketing-hero-bg)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to right, color-mix(in srgb, var(--marketing-hero-grid-line-x) 100%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--marketing-hero-grid-line-y) 100%, transparent) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            opacity: 0.42,
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", maxWidth: "1220px", margin: "0 auto", display: "grid", gap: "24px" }}>
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
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <Newspaper size={14} /> Benela Journal
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, 0.95fr)", gap: "28px" }} className="marketing-layout-main-grid">
            <div>
              <h1 style={{ margin: 0, fontSize: "clamp(38px, 5.2vw, 72px)", lineHeight: 0.96, fontWeight: 700, letterSpacing: "-0.05em", maxWidth: "860px" }}>
                News, industry insight, and practical operating analysis for ambitious teams.
              </h1>
              <p style={{ marginTop: "20px", maxWidth: "760px", fontSize: "18px", lineHeight: 1.76, color: "var(--text-subtle)" }}>
                Follow Benela product updates, business operations commentary, ERP rollout guidance, and editorial analysis on how modern companies run with more control.
              </p>
            </div>
            <div
              style={{
                borderRadius: "26px",
                border: "1px solid var(--border-default)",
                background: "color-mix(in srgb, var(--bg-surface) 88%, var(--accent-soft) 12%)",
                boxShadow: "0 28px 72px rgba(15, 23, 42, 0.12)",
                padding: "24px",
                display: "grid",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--accent)", fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                <Sparkles size={14} /> Editorial scope
              </div>
              <div style={{ display: "grid", gap: "12px" }}>
                {[
                  "Company news and roadmap signals",
                  "Industry analysis and business operating models",
                  "Implementation lessons from AI-native ERP rollout",
                  "Perspectives on governance, visibility, and execution speed",
                ].map((item) => (
                  <div key={item} style={{ display: "grid", gridTemplateColumns: "10px minmax(0, 1fr)", gap: "10px", alignItems: "start" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "999px", background: "var(--accent)", marginTop: "6px" }} />
                    <span style={{ fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.7 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main style={{ maxWidth: "1220px", margin: "0 auto", padding: "56px 40px 84px", display: "grid", gap: "28px" }}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                style={{
                  minHeight: "38px",
                  padding: "0 14px",
                  borderRadius: "999px",
                  border: activeCategory === category ? "1px solid color-mix(in srgb, var(--accent) 34%, transparent)" : "1px solid var(--border-default)",
                  background: activeCategory === category ? "color-mix(in srgb, var(--accent-soft) 18%, transparent)" : "color-mix(in srgb, var(--bg-surface) 88%, transparent)",
                  color: activeCategory === category ? "var(--accent)" : "var(--text-subtle)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {category === "all" ? "All topics" : category}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => window.location.reload()} style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "40px", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--border-default)", background: "color-mix(in srgb, var(--bg-surface) 90%, transparent)", color: "var(--text-subtle)", fontWeight: 600, cursor: "pointer" }}>
            <RefreshCcw size={15} /> Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "22px", borderRadius: "24px", border: "1px solid var(--border-default)", background: "color-mix(in srgb, var(--bg-surface) 88%, transparent)", color: "var(--text-subtle)" }}>
            Loading journal articles...
          </div>
        ) : error ? (
          <div style={{ padding: "22px", borderRadius: "24px", border: "1px solid color-mix(in srgb, var(--danger) 34%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, var(--bg-surface) 90%)", color: "var(--danger)" }}>
            {error}
          </div>
        ) : !posts.length ? (
          <div style={{ padding: "26px", borderRadius: "24px", border: "1px dashed var(--border-default)", background: "color-mix(in srgb, var(--bg-surface) 86%, transparent)", color: "var(--text-subtle)" }}>
            The Benela Journal is ready, but no articles have been published yet.
          </div>
        ) : (
          <>
            {featured && activeCategory === "all" ? (
              <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: "20px" }} className="marketing-layout-split-grid">
                <div style={{ borderRadius: "28px", border: "1px solid var(--border-default)", background: "linear-gradient(160deg, color-mix(in srgb, var(--bg-surface) 92%, var(--accent-soft) 8%), color-mix(in srgb, var(--bg-panel) 94%, transparent))", overflow: "hidden", boxShadow: "0 28px 72px rgba(15, 23, 42, 0.12)" }}>
                  {featured.cover_image_url ? (
                    <div style={{ aspectRatio: "16 / 8.5", backgroundImage: `url(${featured.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                  ) : (
                    <div style={{ aspectRatio: "16 / 8.5", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent-2) 18%, transparent))" }} />
                  )}
                  <div style={{ padding: "26px", display: "grid", gap: "14px" }}>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <span style={pillStyle("accent")}>Featured story</span>
                      <span style={pillStyle("neutral")}>{featured.category}</span>
                    </div>
                    <h2 style={{ margin: 0, fontSize: "clamp(28px, 3.4vw, 42px)", lineHeight: 1.02, letterSpacing: "-0.04em" }}>{featured.title}</h2>
                    <p style={{ margin: 0, fontSize: "16px", lineHeight: 1.8, color: "var(--text-subtle)" }}>{featured.excerpt}</p>
                    <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", fontSize: "13px", color: "var(--text-quiet)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><CalendarDays size={14} /> {formatDate(featured.published_at)}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Clock3 size={14} /> {formatReadTime(featured.read_time_minutes)}</span>
                      <span>{featured.author_name}</span>
                    </div>
                    <Link href={buildBlogPostPath(featured)} style={{ display: "inline-flex", alignItems: "center", gap: "10px", minHeight: "46px", width: "fit-content", padding: "0 18px", borderRadius: "14px", textDecoration: "none", color: "white", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", boxShadow: "0 18px 36px color-mix(in srgb, var(--accent) 22%, transparent)", fontWeight: 700 }}>
                      Read featured article <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>

                <div style={{ display: "grid", gap: "12px", alignContent: "start" }}>
                  {posts.filter((item) => item.slug !== featured.slug).slice(0, 3).map((post) => (
                    <Link key={post.id} href={buildBlogPostPath(post)} style={{ textDecoration: "none" }}>
                      <article style={{ borderRadius: "22px", border: "1px solid var(--border-default)", background: "color-mix(in srgb, var(--bg-surface) 90%, transparent)", padding: "18px", display: "grid", gap: "12px", boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                          <span style={pillStyle("neutral")}>{post.category}</span>
                          <span style={{ fontSize: "12px", color: "var(--text-quiet)" }}>{formatReadTime(post.read_time_minutes)}</span>
                        </div>
                        <div style={{ fontSize: "20px", fontWeight: 700, lineHeight: 1.18, color: "var(--text-primary)" }}>{post.title}</div>
                        <div style={{ fontSize: "14px", lineHeight: 1.7, color: "var(--text-subtle)" }}>{post.excerpt}</div>
                      </article>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px" }} className="marketing-layout-card-grid">
              {gridPosts.map((post) => (
                <Link key={post.id} href={buildBlogPostPath(post)} style={{ textDecoration: "none" }}>
                  <article style={{ height: "100%", borderRadius: "24px", border: "1px solid var(--border-default)", background: "color-mix(in srgb, var(--bg-surface) 90%, transparent)", overflow: "hidden", boxShadow: "0 20px 48px rgba(15, 23, 42, 0.08)", display: "grid", alignContent: "start" }}>
                    {post.cover_image_url ? (
                      <div style={{ aspectRatio: "16 / 9", backgroundImage: `url(${post.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                    ) : (
                      <div style={{ aspectRatio: "16 / 9", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent-2) 14%, transparent))" }} />
                    )}
                    <div style={{ padding: "20px", display: "grid", gap: "12px" }}>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <span style={pillStyle(post.is_featured ? "accent" : "neutral")}>{post.is_featured ? "Featured" : post.category}</span>
                        <span style={{ fontSize: "12px", color: "var(--text-quiet)" }}>{formatDate(post.published_at)}</span>
                      </div>
                      <h3 style={{ margin: 0, fontSize: "24px", lineHeight: 1.1, color: "var(--text-primary)" }}>{post.title}</h3>
                      <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.74, color: "var(--text-subtle)" }}>{post.excerpt}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12px", color: "var(--text-quiet)" }}>
                        <span>{post.author_name}</span>
                        <span>{formatReadTime(post.read_time_minutes)}</span>
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </section>
          </>
        )}
      </main>

      <MarketingFooter />
    </div>
  );
}

function pillStyle(tone: "accent" | "neutral") {
  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "30px",
    padding: "0 12px",
    borderRadius: "999px",
    border: tone === "accent" ? "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" : "1px solid var(--border-default)",
    background: tone === "accent" ? "color-mix(in srgb, var(--accent-soft) 16%, transparent)" : "color-mix(in srgb, var(--bg-panel) 88%, transparent)",
    color: tone === "accent" ? "var(--accent)" : "var(--text-subtle)",
    fontSize: "12px",
    fontWeight: 700,
  } as const;
}
