"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  CheckCircle2,
  Eye,
  FileText,
  MessageSquare,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Sparkles,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  AdminFilterBar,
  AdminMetricCard,
  AdminMetricGrid,
  AdminPageHero,
  AdminPill,
  AdminSectionCard,
  adminButtonStyle,
  adminInputStyle,
} from "@/components/admin/ui";
import { formatDateTime, readErrorMessage } from "@/lib/admin-utils";
import {
  EMPTY_BLOG_POST,
  buildBlogPostPath,
  fetchAdminBlogPost,
  fetchAdminBlogSummary,
  listAdminBlogComments,
  listAdminBlogPosts,
  parseTagsInput,
  saveAdminBlogPost,
  tagsToInput,
  type AdminBlogComment,
  type AdminBlogPostDetail,
  type AdminBlogPostListItem,
  type BlogPostInput,
  type BlogSummary,
  updateAdminBlogCommentStatus,
  deleteAdminBlogPost,
} from "@/lib/platform-blog";

const TOOLBAR_ACTIONS = [
  { label: "H2", prefix: "## ", suffix: "", placeholder: "Section title" },
  { label: "H3", prefix: "### ", suffix: "", placeholder: "Subsection" },
  { label: "Bold", prefix: "**", suffix: "**", placeholder: "highlight" },
  { label: "Quote", prefix: "> ", suffix: "", placeholder: "Key point" },
  { label: "List", prefix: "- ", suffix: "", placeholder: "List item" },
  { label: "Link", prefix: "[", suffix: "](https://)", placeholder: "Link text" },
  { label: "Code", prefix: "```\n", suffix: "\n```", placeholder: "code or snippet" },
] as const;

function statusTone(value: boolean): "success" | "neutral" {
  return value ? "success" : "neutral";
}

function commentTone(status: string): "success" | "danger" | "warning" {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "warning";
  }
}

export default function AdminBlogPage() {
  const [summary, setSummary] = useState<BlogSummary | null>(null);
  const [posts, setPosts] = useState<AdminBlogPostListItem[]>([]);
  const [pendingComments, setPendingComments] = useState<AdminBlogComment[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminBlogPostDetail | null>(null);
  const [editor, setEditor] = useState<BlogPostInput>(EMPTY_BLOG_POST);
  const [tagInput, setTagInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewMode, setPreviewMode] = useState<"split" | "preview">("split");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedPostIdRef = useRef<number | null>(null);

  useEffect(() => {
    selectedPostIdRef.current = selectedPostId;
  }, [selectedPostId]);

  const loadOverview = useCallback(async (preserveSelection = true) => {
    setLoading(true);
    setError("");
    try {
      const [summaryData, postRows, pendingRows] = await Promise.all([
        fetchAdminBlogSummary(),
        listAdminBlogPosts(query, statusFilter),
        listAdminBlogComments("pending"),
      ]);
      setSummary(summaryData);
      setPosts(postRows);
      setPendingComments(pendingRows);

      const currentId = preserveSelection ? selectedPostIdRef.current : null;
      const nextSelected = currentId && postRows.some((item) => item.id === currentId)
        ? currentId
        : postRows[0]?.id ?? null;
      setSelectedPostId(nextSelected);
      if (!nextSelected) {
        setSelectedDetail(null);
      }
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load blog studio."));
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  const loadDetail = useCallback(async (postId: number | null) => {
    if (!postId) {
      setSelectedDetail(null);
      return;
    }
    setDetailLoading(true);
    setError("");
    try {
      const detail = await fetchAdminBlogPost(postId);
      setSelectedDetail(detail);
      setEditor({
        title: detail.title,
        slug: detail.slug,
        excerpt: detail.excerpt,
        cover_image_url: detail.cover_image_url || "",
        category: detail.category,
        author_name: detail.author_name,
        tags: detail.tags,
        content_markdown: detail.content_markdown,
        seo_title: detail.seo_title || "",
        seo_description: detail.seo_description || "",
        is_published: detail.is_published,
        is_featured: detail.is_featured,
        published_at: detail.published_at || null,
      });
      setTagInput(tagsToInput(detail.tags));
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load article detail."));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  useEffect(() => {
    if (selectedPostId == null) return;
    void loadDetail(selectedPostId);
  }, [loadDetail, selectedPostId]);

  const createNewDraft = () => {
    setSelectedPostId(null);
    setSelectedDetail(null);
    setEditor(EMPTY_BLOG_POST);
    setTagInput("");
    setNotice("");
    setError("");
  };

  const insertMarkdown = (prefix: string, suffix = "", placeholder = "text") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const source = editor.content_markdown || "";
    const selected = source.slice(start, end) || placeholder;
    const nextValue = `${source.slice(0, start)}${prefix}${selected}${suffix}${source.slice(end)}`;
    setEditor((prev) => ({ ...prev, content_markdown: nextValue }));
    requestAnimationFrame(() => {
      textarea.focus();
      const nextStart = start + prefix.length;
      const nextEnd = nextStart + selected.length;
      textarea.setSelectionRange(nextStart, nextEnd);
    });
  };

  const currentComments = useMemo(() => selectedDetail?.comments || [], [selectedDetail]);

  const save = async (publishOverride?: boolean) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload: BlogPostInput = {
        ...editor,
        tags: parseTagsInput(tagInput),
        is_published: publishOverride ?? editor.is_published,
      };
      const saved = await saveAdminBlogPost(payload, selectedPostId);
      setSelectedPostId(saved.id);
      setSelectedDetail(saved);
      setEditor({
        title: saved.title,
        slug: saved.slug,
        excerpt: saved.excerpt,
        cover_image_url: saved.cover_image_url || "",
        category: saved.category,
        author_name: saved.author_name,
        tags: saved.tags,
        content_markdown: saved.content_markdown,
        seo_title: saved.seo_title || "",
        seo_description: saved.seo_description || "",
        is_published: saved.is_published,
        is_featured: saved.is_featured,
        published_at: saved.published_at || null,
      });
      setTagInput(tagsToInput(saved.tags));
      setNotice(saved.is_published ? "Article saved and published." : "Draft saved.");
      await loadOverview();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not save article."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedPostId) return;
    if (!window.confirm("Delete this article? This also removes its comments.")) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      await deleteAdminBlogPost(selectedPostId);
      setNotice("Article deleted.");
      createNewDraft();
      await loadOverview(false);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not delete article."));
    } finally {
      setDeleting(false);
    }
  };

  const moderateComment = async (commentId: number, status: "pending" | "approved" | "rejected") => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateAdminBlogCommentStatus(commentId, status);
      setNotice(`Comment moved to ${updated.status}.`);
      if (selectedPostId) {
        await loadDetail(selectedPostId);
      }
      await loadOverview();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update comment."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1560px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <AdminPageHero
        eyebrow="Editorial command center"
        title="Blog Studio"
        subtitle="Write company news, product insights, industry analysis, and long-form business articles from one admin-managed publishing surface."
        actions={
          <>
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => void loadOverview()}>
              <RefreshCcw size={16} /> Refresh
            </button>
            <Link href="/admin/blog/new" style={adminButtonStyle("ghost")}>
              <Plus size={16} /> New article
            </Link>
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => void save(false)} disabled={saving}>
              <Save size={16} /> {saving ? "Saving..." : "Save draft"}
            </button>
            <button type="button" style={adminButtonStyle("primary")} onClick={() => void save(true)} disabled={saving}>
              <Send size={16} /> {editor.is_published ? "Update live article" : "Publish article"}
            </button>
          </>
        }
      />

      {(error || notice) ? (
        <div
          className="admin-ui-surface"
          style={{
            padding: "14px 16px",
            borderColor: error ? "color-mix(in srgb, var(--danger) 42%, transparent)" : "color-mix(in srgb, #34d399 42%, transparent)",
            background: error
              ? "color-mix(in srgb, var(--danger) 10%, var(--bg-surface) 90%)"
              : "color-mix(in srgb, #34d399 10%, var(--bg-surface) 90%)",
            color: error ? "var(--danger)" : "#34d399",
          }}
        >
          {error || notice}
        </div>
      ) : null}

      <AdminMetricGrid>
        <AdminMetricCard label="Total posts" value={summary?.total_posts ?? "—"} detail="Drafts and published articles" tone="accent" />
        <AdminMetricCard label="Published" value={summary?.published_posts ?? "—"} detail="Visible on the public journal" tone="success" />
        <AdminMetricCard label="Featured" value={summary?.featured_posts ?? "—"} detail="Primary article highlighted on /blog" tone="accent" />
        <AdminMetricCard label="Pending comments" value={summary?.pending_comments ?? "—"} detail="Reader responses waiting for moderation" tone="warning" />
        <AdminMetricCard label="Approved comments" value={summary?.approved_comments ?? "—"} detail="Publicly visible discussion" tone="neutral" />
      </AdminMetricGrid>

      <div style={{ display: "grid", gridTemplateColumns: "340px minmax(0, 1fr)", gap: "18px" }} className="admin-blog-grid">
        <div style={{ display: "grid", gap: "18px", alignContent: "start" }}>
          <AdminSectionCard title="Articles" description="Drafts, published posts, and featured stories." actions={<span style={{ fontSize: "12px", color: "var(--text-quiet)" }}>{loading ? "Loading..." : `${posts.length} article${posts.length === 1 ? "" : "s"}`}</span>}>
            <div style={{ display: "grid", gap: "14px" }}>
              <AdminFilterBar>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, excerpt, category..." style={adminInputStyle({ minWidth: "220px", flex: 1 })} />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={adminInputStyle({ minWidth: "160px" })}>
                  <option value="all">All statuses</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                </select>
              </AdminFilterBar>

              <div style={{ display: "grid", gap: "10px", maxHeight: "720px", overflowY: "auto", paddingRight: "4px" }}>
                {posts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => setSelectedPostId(post.id)}
                    style={{
                      display: "grid",
                      gap: "10px",
                      padding: "16px",
                      borderRadius: "18px",
                      border: post.id === selectedPostId
                        ? "1px solid color-mix(in srgb, var(--accent) 38%, transparent)"
                        : "1px solid color-mix(in srgb, var(--border-default) 74%, transparent)",
                      background: post.id === selectedPostId
                        ? "linear-gradient(160deg, color-mix(in srgb, var(--accent-soft) 20%, var(--bg-surface) 80%), color-mix(in srgb, var(--bg-panel) 92%, transparent))"
                        : "color-mix(in srgb, var(--bg-surface) 92%, transparent)",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "start" }}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <AdminPill label={post.category} tone="neutral" />
                        <AdminPill label={post.is_published ? "Live" : "Draft"} tone={statusTone(post.is_published)} />
                        {post.is_featured ? <AdminPill label="Featured" tone="accent" /> : null}
                      </div>
                      <span style={{ fontSize: "12px", color: "var(--text-quiet)" }}>{formatDateTime(post.updated_at)}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.35 }}>{post.title}</div>
                      <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-subtle)", lineHeight: 1.6 }}>{post.excerpt || "No excerpt yet."}</div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "12px", color: "var(--text-quiet)" }}>
                      <span>{post.read_time_minutes} min read</span>
                      <span>{post.comments_pending} pending / {post.comments_total} total comments</span>
                    </div>
                  </button>
                ))}
                {!posts.length ? (
                  <div style={{ padding: "18px", borderRadius: "16px", border: "1px dashed var(--border-default)", color: "var(--text-subtle)", fontSize: "13px" }}>
                    No articles match the current filter.
                  </div>
                ) : null}
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Pending comments" description="Moderate new reader responses quickly.">
            <div style={{ display: "grid", gap: "10px" }}>
              {pendingComments.slice(0, 6).map((comment) => (
                <div key={comment.id} style={{ borderRadius: "16px", border: "1px solid color-mix(in srgb, var(--border-default) 70%, transparent)", background: "color-mix(in srgb, var(--bg-surface) 92%, transparent)", padding: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{comment.author_name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-quiet)", marginTop: "4px" }}>{comment.post_title}</div>
                    </div>
                    <AdminPill label={comment.status} tone={commentTone(comment.status)} />
                  </div>
                  <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-subtle)", lineHeight: 1.6 }}>{comment.body.slice(0, 140)}{comment.body.length > 140 ? "..." : ""}</div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                    <button type="button" style={adminButtonStyle("secondary", { minHeight: "36px", padding: "0 10px" })} onClick={() => setSelectedPostId(comment.post_id)}>
                      <Eye size={14} /> Open article
                    </button>
                    <button type="button" style={adminButtonStyle("primary", { minHeight: "36px", padding: "0 10px" })} onClick={() => void moderateComment(comment.id, "approved")}>Approve</button>
                    <button type="button" style={adminButtonStyle("danger", { minHeight: "36px", padding: "0 10px" })} onClick={() => void moderateComment(comment.id, "rejected")}>Reject</button>
                  </div>
                </div>
              ))}
              {!pendingComments.length ? (
                <div style={{ padding: "16px", borderRadius: "16px", border: "1px dashed var(--border-default)", color: "var(--text-subtle)", fontSize: "13px" }}>
                  No pending comments right now.
                </div>
              ) : null}
            </div>
          </AdminSectionCard>
        </div>

        <div style={{ display: "grid", gap: "18px" }}>
          <AdminSectionCard
            title={selectedPostId ? "Article settings" : "New article draft"}
            description="Control publishing, category, tags, cover image, and search metadata from one editor surface."
            actions={selectedPostId ? (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Link href={`/admin/blog/edit/${selectedPostId}`} style={adminButtonStyle("ghost")}>
                  <PencilLine size={16} /> Open route editor
                </Link>
                {selectedDetail?.is_published ? (
                  <Link href={buildBlogPostPath(selectedDetail)} target="_blank" style={adminButtonStyle("secondary")}>
                    <Eye size={16} /> View live
                  </Link>
                ) : null}
                <button type="button" onClick={remove} disabled={deleting} style={adminButtonStyle("danger")}>
                  <Trash2 size={16} /> {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            ) : undefined}
          >
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }} className="admin-blog-meta-grid">
                <div>
                  <label style={labelStyle}>Title</label>
                  <input value={editor.title} onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))} placeholder="Article title" style={adminInputStyle()} />
                </div>
                <div>
                  <label style={labelStyle}>Slug</label>
                  <input value={editor.slug || ""} onChange={(e) => setEditor((prev) => ({ ...prev, slug: e.target.value }))} placeholder="auto-generated-from-title" style={adminInputStyle()} />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <input value={editor.category} onChange={(e) => setEditor((prev) => ({ ...prev, category: e.target.value }))} placeholder="Insights" style={adminInputStyle()} />
                </div>
                <div>
                  <label style={labelStyle}>Author</label>
                  <input value={editor.author_name} onChange={(e) => setEditor((prev) => ({ ...prev, author_name: e.target.value }))} placeholder="Benela Team" style={adminInputStyle()} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 240px", gap: "14px" }} className="admin-blog-meta-grid">
                <div>
                  <label style={labelStyle}>Cover image URL</label>
                  <input value={editor.cover_image_url || ""} onChange={(e) => setEditor((prev) => ({ ...prev, cover_image_url: e.target.value }))} placeholder="https://..." style={adminInputStyle()} />
                </div>
                <div>
                  <label style={labelStyle}>Tags</label>
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="AI, ERP, Operations" style={adminInputStyle()} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Excerpt</label>
                <textarea value={editor.excerpt} onChange={(e) => setEditor((prev) => ({ ...prev, excerpt: e.target.value }))} placeholder="Short article summary for cards, previews, and SEO." style={{ ...adminInputStyle({ minHeight: "110px", padding: "14px 16px" }), resize: "vertical" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }} className="admin-blog-meta-grid">
                <div>
                  <label style={labelStyle}>SEO title</label>
                  <input value={editor.seo_title || ""} onChange={(e) => setEditor((prev) => ({ ...prev, seo_title: e.target.value }))} placeholder="Optional search title" style={adminInputStyle()} />
                </div>
                <div>
                  <label style={labelStyle}>SEO description</label>
                  <input value={editor.seo_description || ""} onChange={(e) => setEditor((prev) => ({ ...prev, seo_description: e.target.value }))} placeholder="Optional search description" style={adminInputStyle()} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
                <label style={checkLabelStyle}>
                  <input type="checkbox" checked={editor.is_published} onChange={(e) => setEditor((prev) => ({ ...prev, is_published: e.target.checked }))} />
                  <span>Published</span>
                </label>
                <label style={checkLabelStyle}>
                  <input type="checkbox" checked={editor.is_featured} onChange={(e) => setEditor((prev) => ({ ...prev, is_featured: e.target.checked }))} />
                  <span>Featured article</span>
                </label>
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="Long-form editor"
            description="Write in markdown with a live preview. Use this surface for news posts, industry analysis, and editorial pieces."
            actions={
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" style={adminButtonStyle(previewMode === "split" ? "primary" : "ghost", { minHeight: "36px", padding: "0 12px" })} onClick={() => setPreviewMode("split")}>
                  <PencilLine size={14} /> Split
                </button>
                <button type="button" style={adminButtonStyle(previewMode === "preview" ? "primary" : "ghost", { minHeight: "36px", padding: "0 12px" })} onClick={() => setPreviewMode("preview")}>
                  <Eye size={14} /> Preview
                </button>
              </div>
            }
          >
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {TOOLBAR_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    style={adminButtonStyle("ghost", { minHeight: "34px", padding: "0 10px" })}
                    onClick={() => insertMarkdown(action.prefix, action.suffix, action.placeholder)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <div style={{ display: previewMode === "preview" ? "block" : "grid", gridTemplateColumns: previewMode === "split" ? "minmax(0, 1fr) minmax(0, 1fr)" : undefined, gap: "14px" }} className="admin-blog-editor-grid">
                {previewMode !== "preview" ? (
                  <textarea
                    ref={textareaRef}
                    value={editor.content_markdown}
                    onChange={(e) => setEditor((prev) => ({ ...prev, content_markdown: e.target.value }))}
                    style={{ ...adminInputStyle({ minHeight: "520px", padding: "18px 18px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.7, borderRadius: "18px" }), resize: "vertical" }}
                  />
                ) : null}
                <div style={{ borderRadius: "18px", border: "1px solid color-mix(in srgb, var(--border-default) 76%, transparent)", background: "color-mix(in srgb, var(--bg-surface) 94%, transparent)", minHeight: "520px", padding: "24px", overflow: "auto" }}>
                  {detailLoading ? (
                    <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>Loading preview...</div>
                  ) : (
                    <article className="blog-markdown">
                      <ReactMarkdown>{editor.content_markdown || "_Start writing to preview your article._"}</ReactMarkdown>
                    </article>
                  )}
                </div>
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard title={`Comments${selectedDetail ? ` (${currentComments.length})` : ""}`} description="Approve thoughtful responses, reject noise, and keep the public discussion clean.">
            {!selectedPostId ? (
              <div style={{ padding: "18px", borderRadius: "16px", border: "1px dashed var(--border-default)", color: "var(--text-subtle)", fontSize: "13px" }}>
                Save an article first, then moderate its comments here.
              </div>
            ) : currentComments.length ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {currentComments.map((comment) => (
                  <div key={comment.id} style={{ borderRadius: "16px", border: "1px solid color-mix(in srgb, var(--border-default) 72%, transparent)", background: "color-mix(in srgb, var(--bg-surface) 94%, transparent)", padding: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{comment.author_name}</div>
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--text-quiet)" }}>{comment.author_email} · {formatDateTime(comment.created_at)}</div>
                      </div>
                      <AdminPill label={comment.status} tone={commentTone(comment.status)} />
                    </div>
                    <div style={{ marginTop: "12px", fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{comment.body}</div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                      <button type="button" style={adminButtonStyle("primary", { minHeight: "36px", padding: "0 10px" })} onClick={() => void moderateComment(comment.id, "approved")}>Approve</button>
                      <button type="button" style={adminButtonStyle("ghost", { minHeight: "36px", padding: "0 10px" })} onClick={() => void moderateComment(comment.id, "pending")}>Keep pending</button>
                      <button type="button" style={adminButtonStyle("danger", { minHeight: "36px", padding: "0 10px" })} onClick={() => void moderateComment(comment.id, "rejected")}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "18px", borderRadius: "16px", border: "1px dashed var(--border-default)", color: "var(--text-subtle)", fontSize: "13px" }}>
                No comments on this article yet.
              </div>
            )}
          </AdminSectionCard>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: "12px",
  color: "var(--text-subtle)",
  marginBottom: "8px",
} as const;

const checkLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "13px",
  color: "var(--text-primary)",
  fontWeight: 600,
} as const;
