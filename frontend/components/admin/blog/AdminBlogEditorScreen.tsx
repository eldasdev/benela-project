"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  Eye,
  PencilLine,
  Save,
  Send,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import {
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
  parseTagsInput,
  saveAdminBlogPost,
  slugifyBlogCategory,
  slugifyBlogTags,
  slugifyBlogValue,
  tagsToInput,
  type AdminBlogPostDetail,
  type BlogPostInput,
  updateAdminBlogCommentStatus,
  deleteAdminBlogPost,
} from "@/lib/platform-blog";
import PlatformImageField from "@/components/admin/media/PlatformImageField";

const TOOLBAR_ACTIONS = [
  { label: "H2", prefix: "## ", suffix: "", placeholder: "Section title" },
  { label: "H3", prefix: "### ", suffix: "", placeholder: "Subsection" },
  { label: "Bold", prefix: "**", suffix: "**", placeholder: "highlight" },
  { label: "Quote", prefix: "> ", suffix: "", placeholder: "Key point" },
  { label: "List", prefix: "- ", suffix: "", placeholder: "List item" },
  { label: "Link", prefix: "[", suffix: "](https://)", placeholder: "Link text" },
  { label: "Code", prefix: "```\n", suffix: "\n```", placeholder: "code or snippet" },
] as const;

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

export default function AdminBlogEditorScreen({ postId }: { postId?: number | null }) {
  const router = useRouter();
  const [detail, setDetail] = useState<AdminBlogPostDetail | null>(null);
  const [editor, setEditor] = useState<BlogPostInput>(EMPTY_BLOG_POST);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(Boolean(postId));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewMode, setPreviewMode] = useState<"split" | "preview">("split");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(postId));
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!postId) {
      setLoading(false);
      setDetail(null);
      setEditor(EMPTY_BLOG_POST);
      setTagInput("");
      setSlugManuallyEdited(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const payload = await fetchAdminBlogPost(postId);
        if (cancelled) return;
        setDetail(payload);
        setEditor({
          title: payload.title,
          slug: payload.slug,
          excerpt: payload.excerpt,
          cover_image_url: payload.cover_image_url || "",
          category: payload.category,
          author_name: payload.author_name,
          tags: payload.tags,
          content_markdown: payload.content_markdown,
          seo_title: payload.seo_title || "",
          seo_description: payload.seo_description || "",
          is_published: payload.is_published,
          is_featured: payload.is_featured,
          published_at: payload.published_at || null,
        });
        setTagInput(tagsToInput(payload.tags));
        setSlugManuallyEdited(true);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(readErrorMessage(err, "Could not load article."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const livePath = useMemo(() => (detail ? buildBlogPostPath(detail) : null), [detail]);
  const tagSlugsPreview = useMemo(() => slugifyBlogTags(parseTagsInput(tagInput)), [tagInput]);
  const categorySlugPreview = useMemo(() => slugifyBlogCategory(editor.category), [editor.category]);

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
      const saved = await saveAdminBlogPost(payload, postId);
      setDetail(saved);
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
      if (!postId) {
        router.replace(`/admin/blog/edit/${saved.id}`);
      }
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not save article."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!postId) return;
    if (!window.confirm("Delete this article? This also removes its comments.")) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      await deleteAdminBlogPost(postId);
      router.push("/admin/blog");
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not delete article."));
    } finally {
      setDeleting(false);
    }
  };

  const moderateComment = async (commentId: number, status: "pending" | "approved" | "rejected") => {
    if (!postId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateAdminBlogCommentStatus(commentId, status);
      const refreshed = await fetchAdminBlogPost(postId);
      setDetail(refreshed);
      setNotice(`Comment moved to ${status}.`);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update comment."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1440px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <AdminPageHero
        eyebrow={postId ? "Editorial edit route" : "Editorial create route"}
        title={postId ? "Edit article" : "Create article"}
        subtitle={postId
          ? "Refine the article content, publishing state, SEO metadata, and moderated discussion from a dedicated editor route."
          : "Draft a new Benela Journal post with full metadata, markdown content, and publishing controls."
        }
        actions={
          <>
            <Link href="/admin/blog" style={adminButtonStyle("secondary")}>
              <ArrowLeft size={16} /> Back to studio
            </Link>
            {livePath ? (
              <Link href={livePath} target="_blank" style={adminButtonStyle("ghost")}>
                <Eye size={16} /> View live
              </Link>
            ) : null}
            {postId ? (
              <button type="button" onClick={remove} disabled={deleting} style={adminButtonStyle("danger")}>
                <Trash2 size={16} /> {deleting ? "Deleting..." : "Delete"}
              </button>
            ) : null}
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => void save(false)} disabled={saving || loading}>
              <Save size={16} /> {saving ? "Saving..." : "Save draft"}
            </button>
            <button type="button" style={adminButtonStyle("primary")} onClick={() => void save(true)} disabled={saving || loading}>
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

      <AdminSectionCard
        title={postId ? "Article settings" : "Draft setup"}
        description="Control publishing, category, tags, cover image, and search metadata from one editor surface."
      >
        {loading ? (
          <div style={{ padding: "10px 0", fontSize: "13px", color: "var(--text-subtle)" }}>Loading article...</div>
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }} className="admin-blog-meta-grid">
              <div>
                <label style={labelStyle}>Title</label>
                <input
                  value={editor.title}
                  onChange={(e) =>
                    setEditor((prev) => ({
                      ...prev,
                      title: e.target.value,
                      slug: slugManuallyEdited ? prev.slug : slugifyBlogValue(e.target.value, ""),
                    }))
                  }
                  placeholder="Article title"
                  style={adminInputStyle()}
                />
              </div>
              <div>
                <label style={labelStyle}>Slug</label>
                <input
                  value={editor.slug || ""}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    setEditor((prev) => ({ ...prev, slug: e.target.value }));
                  }}
                  placeholder="auto-generated-from-title"
                  style={adminInputStyle()}
                />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <input value={editor.category} onChange={(e) => setEditor((prev) => ({ ...prev, category: e.target.value }))} placeholder="Insights" style={adminInputStyle()} />
                <div style={helperTextStyle}>Category slug: `{categorySlugPreview}`</div>
              </div>
              <div>
                <label style={labelStyle}>Author</label>
                <input value={editor.author_name} onChange={(e) => setEditor((prev) => ({ ...prev, author_name: e.target.value }))} placeholder="Benela Team" style={adminInputStyle()} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: "14px" }} className="admin-blog-meta-grid">
              <PlatformImageField
                label="Cover image"
                description="Upload, crop, reposition, and adjust the article cover inside the platform. The editor exports a normalized image asset."
                value={editor.cover_image_url || ""}
                onChange={(url) => setEditor((prev) => ({ ...prev, cover_image_url: url }))}
                onClear={() => setEditor((prev) => ({ ...prev, cover_image_url: "" }))}
                assetType="blog-cover"
                aspectRatio={16 / 9}
              />
              <div>
                <label style={labelStyle}>Tags</label>
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="AI, ERP, Operations" style={adminInputStyle()} />
                <div style={helperTextStyle}>Tag slugs: {tagSlugsPreview.length ? tagSlugsPreview.join(", ") : "Will generate from tags."}</div>
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
        )}
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
              <article className="blog-markdown">
                <ReactMarkdown>{editor.content_markdown || "_Start writing to preview your article._"}</ReactMarkdown>
              </article>
            </div>
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title={postId ? `Comments (${detail?.comments.length || 0})` : "Comments"}
        description="Approve thoughtful responses, reject noise, and keep the public discussion clean."
      >
        {!postId ? (
          <div style={{ padding: "18px", borderRadius: "16px", border: "1px dashed var(--border-default)", color: "var(--text-subtle)", fontSize: "13px" }}>
            Save this article first, then moderate its public comments here.
          </div>
        ) : !detail ? (
          <div style={{ padding: "18px", borderRadius: "16px", border: "1px dashed var(--border-default)", color: "var(--text-subtle)", fontSize: "13px" }}>
            Loading comments...
          </div>
        ) : detail.comments.length ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {detail.comments.map((comment) => (
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
  );
}

const labelStyle = {
  display: "block",
  fontSize: "12px",
  color: "var(--text-subtle)",
  marginBottom: "8px",
} as const;

const helperTextStyle = {
  marginTop: "8px",
  fontSize: "12px",
  color: "var(--text-quiet)",
  lineHeight: 1.5,
} as const;

const checkLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "13px",
  color: "var(--text-primary)",
  fontWeight: 600,
} as const;
