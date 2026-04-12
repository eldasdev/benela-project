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
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(posts.map((p) => p.category).filter(Boolean)))],
    [posts],
  );
  const featured = posts.find((p) => p.is_featured) || posts[0] || null;
  const filtered = posts.filter((p) => activeCategory === "all" || p.category === activeCategory);
  const gridPosts = filtered.filter((p) => p.slug !== featured?.slug || activeCategory !== "all");

  return (
    <div style={{ background: "var(--bg-canvas)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <MarketingTopNav currentPath="/blog" />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "136px 40px 72px",
          borderBottom: "1px solid var(--marketing-hero-divider)",
          background: "var(--marketing-hero-bg)",
          isolation: "isolate",
        }}
      >
        {/* grid lines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to right, var(--marketing-hero-grid-line-x) 1px, transparent 1px), " +
              "linear-gradient(to bottom, var(--marketing-hero-grid-line-y) 1px, transparent 1px)",
            backgroundSize: "96px 96px",
            WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,.78), rgba(0,0,0,.36) 58%, transparent)",
            maskImage: "linear-gradient(to bottom, rgba(0,0,0,.78), rgba(0,0,0,.36) 58%, transparent)",
            opacity: 0.72,
            pointerEvents: "none",
            zIndex: -4,
          }}
        />
        {/* glow a */}
        <div
          style={{
            position: "absolute",
            width: 940, height: 660,
            top: -260, right: -180,
            borderRadius: 999,
            background: "var(--marketing-hero-glow-a)",
            filter: "blur(2px)",
            pointerEvents: "none",
            zIndex: -3,
          }}
        />
        {/* glow b */}
        <div
          style={{
            position: "absolute",
            width: 780, height: 540,
            top: -110, left: -250,
            borderRadius: 999,
            background: "var(--marketing-hero-glow-b)",
            opacity: 0.88,
            pointerEvents: "none",
            zIndex: -3,
          }}
        />
        {/* orbit outer */}
        <div
          style={{
            position: "absolute",
            width: 2040, height: 2040,
            top: -1750, left: -420,
            borderRadius: 999,
            border: "2px solid var(--marketing-hero-orbit-outer)",
            boxShadow: "var(--marketing-hero-orbit-outer-glow)",
            opacity: 0.44,
            pointerEvents: "none",
            zIndex: -2,
          }}
        />
        {/* orbit inner */}
        <div
          style={{
            position: "absolute",
            width: 1540, height: 1540,
            top: -1350, left: 280,
            borderRadius: 999,
            border: "1px solid var(--marketing-hero-orbit-inner)",
            opacity: 0.26,
            pointerEvents: "none",
            zIndex: -2,
          }}
        />

        {/* shell */}
        <div
          className="blog-hero-shell"
          style={{
            position: "relative",
            maxWidth: 1240,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "minmax(0, 0.9fr) minmax(380px, 1.1fr)",
            gap: 48,
            alignItems: "center",
          }}
        >
          {/* copy */}
          <div style={{ position: "relative", maxWidth: 540, justifySelf: "start", zIndex: 1 }}>
            {/* badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 999,
                marginBottom: 20,
                fontSize: 12,
                letterSpacing: "0.03em",
                color: "var(--marketing-hero-badge-text)",
                border: "1px solid var(--marketing-hero-badge-border)",
                background: "var(--marketing-hero-badge-bg)",
                backdropFilter: "blur(8px)",
              }}
            >
              <Newspaper size={12} />
              Benela Journal
            </div>

            {/* title */}
            <h1
              style={{
                fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: "clamp(32px, 4.2vw, 58px)",
                lineHeight: 0.96,
                letterSpacing: "-0.055em",
                marginBottom: 18,
                fontWeight: 700,
                color: "var(--marketing-hero-title)",
              }}
            >
              News, industry insight,{" "}
              <span style={{ display: "block", marginTop: 8, color: "var(--accent)" }}>
                for ambitious teams.
              </span>
            </h1>

            {/* subtitle */}
            <p
              style={{
                maxWidth: 520,
                margin: "0 0 24px",
                fontSize: "clamp(16px, 1.32vw, 19px)",
                lineHeight: 1.7,
                color: "var(--marketing-hero-subtitle)",
              }}
            >
              Follow Benela product updates, business operations commentary, ERP rollout guidance, and editorial analysis on how modern companies run with more control.
            </p>

            {/* actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
              <Link
                href="/signup"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "14px 28px",
                  borderRadius: 999,
                  textDecoration: "none",
                  color: "var(--marketing-hero-primary-text)",
                  fontSize: 15,
                  fontWeight: 700,
                  border: "1px solid var(--marketing-hero-primary-border)",
                  background: "var(--marketing-hero-primary-bg)",
                  boxShadow: "var(--marketing-hero-primary-shadow)",
                }}
              >
                Start free trial <ArrowRight size={16} />
              </Link>
              <Link
                href="/pricing"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "14px 24px",
                  borderRadius: 999,
                  textDecoration: "none",
                  color: "var(--marketing-hero-secondary-text)",
                  fontSize: 15,
                  border: "1px solid var(--marketing-hero-secondary-border)",
                  background: "var(--marketing-hero-secondary-bg)",
                }}
              >
                View pricing
              </Link>
            </div>

            <p style={{ maxWidth: 440, fontSize: 13, lineHeight: 1.6, color: "var(--marketing-hero-note)", margin: 0 }}>
              No credit card required · Free 14-day trial
            </p>
          </div>

          {/* editorial scope panel */}
          <div style={{ position: "relative", width: "100%", justifySelf: "end" }}>
            <div
              style={{
                borderRadius: 28,
                border: "1px solid var(--marketing-hero-showcase-border)",
                background: "var(--marketing-hero-showcase-bg)",
                boxShadow: "var(--marketing-hero-showcase-shadow)",
                overflow: "hidden",
              }}
            >
              {/* window bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "11px 16px",
                  borderBottom: "1px solid var(--marketing-hero-showcase-head-border)",
                  background: "var(--marketing-hero-showcase-head-bg)",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--marketing-hero-showcase-dot)", display: "block" }}
                  />
                ))}
                <p
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontFamily: "'Geist Mono', monospace",
                    color: "var(--marketing-hero-showcase-label)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Editorial Scope
                </p>
              </div>

              <div style={{ padding: 24, display: "grid", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "var(--accent)",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  <Sparkles size={13} /> What we cover
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {[
                    "Company news and roadmap signals",
                    "Industry analysis and business operating models",
                    "Implementation lessons from AI-native ERP rollout",
                    "Perspectives on governance, visibility, and execution speed",
                  ].map((item) => (
                    <div key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span
                        style={{
                          width: 8, height: 8,
                          borderRadius: "50%",
                          background: "var(--accent)",
                          marginTop: 6,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 14, color: "var(--text-subtle)", lineHeight: 1.7 }}>{item}</span>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    padding: 14,
                    borderRadius: 16,
                    border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
                    background: "color-mix(in srgb, var(--bg-panel) 94%, white 6%)",
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 10,
                    textAlign: "center",
                  }}
                >
                  {[
                    { value: "Weekly", label: "Cadence" },
                    { value: "Free", label: "Access" },
                    { value: "AI+ERP", label: "Focus" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "56px 40px 100px" }}>

        {/* filter bar */}
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                style={{
                  minHeight: 36,
                  padding: "0 16px",
                  borderRadius: 999,
                  border: activeCategory === cat
                    ? "1px solid color-mix(in srgb, var(--accent) 40%, transparent)"
                    : "1px solid var(--border-default)",
                  background: activeCategory === cat
                    ? "color-mix(in srgb, var(--accent-soft) 22%, transparent)"
                    : "color-mix(in srgb, var(--bg-surface) 90%, transparent)",
                  color: activeCategory === cat ? "var(--accent)" : "var(--text-subtle)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {cat === "all" ? "All topics" : cat}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minHeight: 36,
              padding: "0 14px",
              borderRadius: 12,
              border: "1px solid var(--border-default)",
              background: "color-mix(in srgb, var(--bg-surface) 90%, transparent)",
              color: "var(--text-subtle)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>

        {/* states */}
        {loading ? (
          <div
            style={{
              position: "relative",
              borderRadius: 32,
              border: "1px solid color-mix(in srgb, var(--border-default) 88%, transparent)",
              background:
                "radial-gradient(720px 320px at 0% 0%, color-mix(in srgb, var(--accent-soft) 62%, transparent), transparent 70%), " +
                "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 95%, white 5%), var(--bg-surface))",
              padding: 28,
              color: "var(--text-subtle)",
              fontSize: 15,
            }}
          >
            Loading journal articles…
          </div>
        ) : error ? (
          <div
            style={{
              padding: "22px 24px",
              borderRadius: 22,
              border: "1px solid color-mix(in srgb, var(--danger) 34%, transparent)",
              background: "color-mix(in srgb, var(--danger) 10%, var(--bg-surface) 90%)",
              color: "var(--danger)",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        ) : !posts.length ? (
          <div
            style={{
              padding: "48px 28px",
              borderRadius: 24,
              border: "1px dashed color-mix(in srgb, var(--border-default) 80%, transparent)",
              background: "color-mix(in srgb, var(--bg-surface) 86%, transparent)",
              color: "var(--text-subtle)",
              textAlign: "center",
              fontSize: 15,
            }}
          >
            The Benela Journal is ready, but no articles have been published yet.
          </div>
        ) : (
          <>
            {/* featured */}
            {featured && activeCategory === "all" ? (
              <section style={{ marginBottom: 32 }}>
                <div
                  style={{
                    position: "relative",
                    borderRadius: 32,
                    border: "1px solid color-mix(in srgb, var(--border-default) 88%, transparent)",
                    background:
                      "radial-gradient(720px 320px at 0% 0%, color-mix(in srgb, var(--accent-soft) 62%, transparent), transparent 70%), " +
                      "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 95%, white 5%), var(--bg-surface))",
                    boxShadow: "0 24px 70px color-mix(in srgb, var(--brand-glow) 10%, transparent)",
                    overflow: "hidden",
                  }}
                >
                  <div className="blog-featured-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(300px, 0.85fr)", minHeight: 380 }}>
                    {/* cover */}
                    <div style={{ position: "relative", minHeight: 380 }}>
                      {featured.cover_image_url ? (
                        <div
                          style={{
                            position: "absolute", inset: 0,
                            backgroundImage: `url(${featured.cover_image_url})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            position: "absolute", inset: 0,
                            background:
                              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 26%, transparent), color-mix(in srgb, var(--accent-2) 20%, transparent))",
                          }}
                        />
                      )}
                      <div
                        style={{
                          position: "absolute", inset: 0,
                          background: "linear-gradient(to right, transparent 40%, color-mix(in srgb, var(--bg-surface) 88%, transparent))",
                          pointerEvents: "none",
                        }}
                      />
                    </div>

                    {/* content */}
                    <div style={{ padding: "36px 32px", display: "grid", gap: 16, alignContent: "start" }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span style={pillStyle("accent")}>Featured story</span>
                        {featured.category ? <span style={pillStyle("neutral")}>{featured.category}</span> : null}
                      </div>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: "clamp(24px, 2.6vw, 36px)",
                          lineHeight: 1.08,
                          letterSpacing: "-0.04em",
                          color: "var(--text-primary)",
                        }}
                      >
                        {featured.title}
                      </h2>
                      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: "var(--text-subtle)" }}>
                        {featured.excerpt}
                      </p>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--text-quiet)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CalendarDays size={13} /> {formatDate(featured.published_at)}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Clock3 size={13} /> {formatReadTime(featured.read_time_minutes)}</span>
                        <span>{featured.author_name}</span>
                      </div>
                      <Link
                        href={buildBlogPostPath(featured)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 9,
                          minHeight: 44,
                          width: "fit-content",
                          padding: "0 20px",
                          borderRadius: 999,
                          textDecoration: "none",
                          color: "var(--marketing-hero-primary-text)",
                          border: "1px solid var(--marketing-hero-primary-border)",
                          background: "var(--marketing-hero-primary-bg)",
                          boxShadow: "var(--marketing-hero-primary-shadow)",
                          fontWeight: 700,
                          fontSize: 14,
                          marginTop: 4,
                        }}
                      >
                        Read featured article <ArrowRight size={15} />
                      </Link>
                    </div>
                  </div>

                  {/* recent strip */}
                  <div
                    className="blog-recent-strip"
                    style={{
                      borderTop: "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)",
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    }}
                  >
                    {posts.filter((p) => p.slug !== featured.slug).slice(0, 3).map((post, idx) => (
                      <Link
                        key={post.id}
                        href={buildBlogPostPath(post)}
                        className="blog-strip-item"
                        style={{
                          textDecoration: "none",
                          padding: "20px 24px",
                          borderRight: idx < 2 ? "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)" : "none",
                          display: "grid",
                          gap: 8,
                          alignContent: "start",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {post.category}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-quiet)" }}>{formatReadTime(post.read_time_minutes)}</span>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, color: "var(--text-primary)" }}>
                          {post.title}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {/* article grid */}
            {gridPosts.length > 0 ? (
              <section>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: "var(--accent)", letterSpacing: "0.14em", fontFamily: "monospace", marginBottom: 6 }}>
                    ALL ARTICLES
                  </div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "clamp(22px, 2.8vw, 32px)",
                      fontWeight: 700,
                      letterSpacing: "-0.04em",
                      color: "var(--text-primary)",
                      lineHeight: 1.1,
                    }}
                  >
                    {activeCategory === "all" ? "From the editorial desk" : activeCategory}
                  </h2>
                </div>

                <div
                  className="blog-article-grid"
                  style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 18 }}
                >
                  {gridPosts.map((post) => (
                    <Link key={post.id} href={buildBlogPostPath(post)} style={{ textDecoration: "none" }}>
                      <article
                        className="blog-article-card"
                        style={{
                          height: "100%",
                          borderRadius: 24,
                          border: "1px solid var(--border-default)",
                          background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 96%, white 4%), var(--bg-surface))",
                          overflow: "hidden",
                          boxShadow: "0 16px 40px color-mix(in srgb, var(--brand-glow) 8%, transparent)",
                          display: "grid",
                          alignContent: "start",
                        }}
                      >
                        {post.cover_image_url ? (
                          <div style={{ aspectRatio: "16/9", backgroundImage: `url(${post.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                        ) : (
                          <div style={{ aspectRatio: "16/9", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent-2) 14%, transparent))" }} />
                        )}

                        <div style={{ padding: 20, display: "grid", gap: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={pillStyle(post.is_featured ? "accent" : "neutral")}>
                              {post.is_featured ? "Featured" : post.category}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--text-quiet)" }}>{formatDate(post.published_at)}</span>
                          </div>
                          <h3 style={{ margin: 0, fontSize: 20, lineHeight: 1.15, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>
                            {post.title}
                          </h3>
                          <p
                            style={{
                              margin: 0, fontSize: 14, lineHeight: 1.76, color: "var(--text-subtle)",
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical" as const,
                              overflow: "hidden",
                            }}
                          >
                            {post.excerpt}
                          </p>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              fontSize: 12,
                              color: "var(--text-quiet)",
                              paddingTop: 4,
                              borderTop: "1px solid color-mix(in srgb, var(--border-default) 60%, transparent)",
                            }}
                          >
                            <span>{post.author_name}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Clock3 size={11} /> {formatReadTime(post.read_time_minutes)}
                            </span>
                          </div>
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>

      <MarketingFooter />

      <style>{`
        .blog-hero-shell {
          grid-template-columns: minmax(0, 0.9fr) minmax(380px, 1.1fr);
        }
        .blog-article-card {
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .blog-article-card:hover {
          transform: translateY(-4px);
          border-color: color-mix(in srgb, var(--accent) 22%, var(--border-default));
          box-shadow: 0 24px 56px color-mix(in srgb, var(--accent) 10%, transparent);
        }
        .blog-strip-item {
          transition: background 0.15s;
        }
        .blog-strip-item:hover {
          background: color-mix(in srgb, var(--accent-soft) 10%, transparent);
        }

        @media (max-width: 980px) {
          .blog-hero-shell {
            grid-template-columns: 1fr !important;
            gap: 28px !important;
          }
          .blog-featured-grid {
            grid-template-columns: 1fr !important;
          }
          .blog-featured-grid > div:first-child {
            min-height: 240px !important;
          }
          .blog-recent-strip {
            grid-template-columns: 1fr !important;
          }
          .blog-strip-item {
            border-right: none !important;
            border-top: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent) !important;
          }
          .blog-article-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 640px) {
          .blog-hero-shell {
            gap: 22px !important;
          }
          .blog-article-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function pillStyle(tone: "accent" | "neutral") {
  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 28,
    padding: "0 12px",
    borderRadius: 999,
    border: tone === "accent"
      ? "1px solid color-mix(in srgb, var(--accent) 34%, transparent)"
      : "1px solid var(--border-default)",
    background: tone === "accent"
      ? "color-mix(in srgb, var(--accent-soft) 18%, transparent)"
      : "color-mix(in srgb, var(--bg-panel) 88%, transparent)",
    color: tone === "accent" ? "var(--accent)" : "var(--text-subtle)",
    fontSize: 11,
    fontWeight: 700,
  } as const;
}
