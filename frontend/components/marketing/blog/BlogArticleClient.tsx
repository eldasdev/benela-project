"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, CalendarDays, Clock3, MessageSquare, Send } from "lucide-react";
import MarketingTopNav from "@/components/marketing/MarketingTopNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import {
  buildBlogPostPath,
  fetchPublicBlogPost,
  fetchPublicBlogPosts,
  formatReadTime,
  submitPublicBlogComment,
  type BlogPostDetail,
  type BlogPostSummary,
} from "@/lib/platform-blog";

function formatDate(value?: string | null) {
  if (!value) return "Draft";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Draft";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export default function BlogArticleClient({ categorySlug, slug }: { categorySlug: string; slug: string }) {
  const [post, setPost] = useState<BlogPostDetail | null>(null);
  const [related, setRelated] = useState<BlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [comment, setComment] = useState({ author_name: "", author_email: "", body: "" });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!slug || !categorySlug) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [detail, posts] = await Promise.all([
          fetchPublicBlogPost(categorySlug, slug),
          fetchPublicBlogPosts(false),
        ]);
        if (!cancelled) {
          setPost(detail);
          setRelated(posts.filter((item) => item.slug !== slug).slice(0, 3));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load article.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [categorySlug, slug]);

  const commentCountLabel = useMemo(() => {
    const count = post?.comments.length || 0;
    return `${count} comment${count === 1 ? "" : "s"}`;
  }, [post?.comments.length]);

  const submitComment = async () => {
    if (!slug || !categorySlug) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const response = await submitPublicBlogComment(categorySlug, slug, comment);
      setNotice(response.message);
      setComment({ author_name: "", author_email: "", body: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit comment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ background: "var(--bg-canvas)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <MarketingTopNav currentPath="/blog" />

      <main style={{ maxWidth: "1220px", margin: "0 auto", padding: "126px 40px 86px", display: "grid", gap: "28px" }}>
        <Link href="/blog" style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "var(--text-subtle)", fontSize: "14px", fontWeight: 600 }}>
          <ArrowLeft size={16} /> Back to journal
        </Link>

        {loading ? (
          <div style={panelStyle}>Loading article...</div>
        ) : error ? (
          <div style={{ ...panelStyle, border: "1px solid color-mix(in srgb, var(--danger) 34%, transparent)", color: "var(--danger)" }}>{error}</div>
        ) : !post ? (
          <div style={panelStyle}>Article not found.</div>
        ) : (
          <>
            <section style={{ display: "grid", gap: "22px" }}>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <span style={pillStyle("accent")}>{post.category}</span>
                {post.tags.map((tag) => (
                  <span key={tag} style={pillStyle("neutral")}>{tag}</span>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) 280px", gap: "24px" }} className="marketing-layout-split-grid">
                <div>
                  <h1 style={{ margin: 0, fontSize: "clamp(36px, 5vw, 64px)", lineHeight: 0.98, letterSpacing: "-0.05em" }}>{post.title}</h1>
                  <p style={{ margin: "20px 0 0", fontSize: "18px", lineHeight: 1.8, color: "var(--text-subtle)", maxWidth: "860px" }}>{post.excerpt}</p>
                </div>
                <div style={{ ...panelStyle, display: "grid", gap: "14px", alignContent: "start" }}>
                  <div style={{ fontSize: "11px", color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>Article meta</div>
                  <MetaRow label="Published" value={formatDate(post.published_at)} icon={<CalendarDays size={14} />} />
                  <MetaRow label="Read time" value={formatReadTime(post.read_time_minutes)} icon={<Clock3 size={14} />} />
                  <MetaRow label="Author" value={post.author_name} icon={<MessageSquare size={14} />} />
                  <MetaRow label="Discussion" value={commentCountLabel} icon={<MessageSquare size={14} />} />
                </div>
              </div>
              {post.cover_image_url ? (
                <div style={{ borderRadius: "28px", overflow: "hidden", border: "1px solid var(--border-default)", boxShadow: "0 28px 72px rgba(15, 23, 42, 0.12)" }}>
                  <div style={{ aspectRatio: "16 / 7.5", backgroundImage: `url(${post.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                </div>
              ) : null}
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "22px" }} className="marketing-layout-split-grid">
              <article style={{ ...panelStyle, padding: "34px" }}>
                <div className="blog-markdown">
                  <ReactMarkdown>{post.content_markdown}</ReactMarkdown>
                </div>
              </article>
              <div style={{ display: "grid", gap: "18px", alignContent: "start" }}>
                <div style={panelStyle}>
                  <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>Join the discussion</div>
                  <div style={{ fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.7, marginBottom: "14px" }}>Comments are reviewed before appearing publicly. Use your real name and a working email.</div>
                  <div style={{ display: "grid", gap: "12px" }}>
                    <input value={comment.author_name} onChange={(e) => setComment((prev) => ({ ...prev, author_name: e.target.value }))} placeholder="Your name" style={inputStyle} />
                    <input value={comment.author_email} onChange={(e) => setComment((prev) => ({ ...prev, author_email: e.target.value }))} placeholder="Email address" style={inputStyle} />
                    <textarea value={comment.body} onChange={(e) => setComment((prev) => ({ ...prev, body: e.target.value }))} placeholder="Share your perspective, question, or response..." style={{ ...inputStyle, minHeight: "180px", padding: "14px 16px", resize: "vertical" }} />
                    {notice ? <div style={{ borderRadius: "14px", border: "1px solid color-mix(in srgb, #34d399 34%, transparent)", background: "color-mix(in srgb, #34d399 10%, var(--bg-surface) 90%)", color: "#34d399", padding: "12px 14px", fontSize: "13px" }}>{notice}</div> : null}
                    <button type="button" onClick={() => void submitComment()} disabled={sending} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "46px", borderRadius: "14px", border: "1px solid color-mix(in srgb, var(--accent) 32%, transparent)", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "white", fontWeight: 700, cursor: sending ? "not-allowed" : "pointer", opacity: sending ? 0.7 : 1 }}>
                      <Send size={16} /> {sending ? "Submitting..." : "Submit comment"}
                    </button>
                  </div>
                </div>

                <div style={panelStyle}>
                  <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>Approved comments</div>
                  <div style={{ display: "grid", gap: "12px" }}>
                    {post.comments.length ? post.comments.map((item) => (
                      <div key={item.id} style={{ borderRadius: "16px", border: "1px solid color-mix(in srgb, var(--border-default) 74%, transparent)", background: "color-mix(in srgb, var(--bg-surface) 92%, transparent)", padding: "14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline" }}>
                          <div style={{ fontSize: "14px", fontWeight: 700 }}>{item.author_name}</div>
                          <div style={{ fontSize: "12px", color: "var(--text-quiet)" }}>{formatDate(item.created_at)}</div>
                        </div>
                        <div style={{ marginTop: "8px", fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{item.body}</div>
                      </div>
                    )) : <div style={{ fontSize: "13px", color: "var(--text-subtle)", lineHeight: 1.7 }}>No approved comments yet. Be the first to add useful context.</div>}
                  </div>
                </div>
              </div>
            </section>

            {related.length ? (
              <section style={{ display: "grid", gap: "16px" }}>
                <div style={{ fontSize: "24px", fontWeight: 700 }}>More from the Benela Journal</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px" }} className="marketing-layout-card-grid">
                  {related.map((item) => (
                    <Link key={item.id} href={buildBlogPostPath(item)} style={{ textDecoration: "none" }}>
                      <article style={{ ...panelStyle, height: "100%", display: "grid", gap: "12px", boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)" }}>
                        <span style={pillStyle(item.is_featured ? "accent" : "neutral")}>{item.is_featured ? "Featured" : item.category}</span>
                        <div style={{ fontSize: "22px", fontWeight: 700, lineHeight: 1.1 }}>{item.title}</div>
                        <div style={{ fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.7 }}>{item.excerpt}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12px", color: "var(--text-quiet)" }}>
                          <span>{formatDate(item.published_at)}</span>
                          <span>{formatReadTime(item.read_time_minutes)}</span>
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
    </div>
  );
}

function MetaRow({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: "10px", alignItems: "start" }}>
      <span style={{ color: "var(--accent)", marginTop: "2px" }}>{icon}</span>
      <div>
        <div style={{ fontSize: "11px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
        <div style={{ marginTop: "4px", fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}

const panelStyle = {
  borderRadius: "24px",
  border: "1px solid var(--border-default)",
  background: "color-mix(in srgb, var(--bg-surface) 90%, transparent)",
  padding: "22px",
} as const;

const inputStyle = {
  width: "100%",
  minHeight: "46px",
  borderRadius: "14px",
  border: "1px solid var(--border-default)",
  background: "color-mix(in srgb, var(--bg-surface) 92%, transparent)",
  color: "var(--text-primary)",
  padding: "0 14px",
  fontSize: "14px",
  outline: "none",
} as const;

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
