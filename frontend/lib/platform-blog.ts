import { authFetch } from "@/lib/auth-fetch";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

export type BlogPostSummary = {
  id: number;
  title: string;
  slug: string;
  category_slug: string;
  excerpt: string;
  cover_image_url?: string | null;
  category: string;
  author_name: string;
  tags: string[];
  tag_slugs: string[];
  read_time_minutes: number;
  is_featured: boolean;
  published_at?: string | null;
};

export type AdminBlogComment = {
  id: number;
  post_id: number;
  post_title: string;
  post_slug: string;
  post_category_slug: string;
  author_name: string;
  author_email: string;
  body: string;
  status: "pending" | "approved" | "rejected" | string;
  created_at: string;
  reviewed_at?: string | null;
};

export type AdminBlogPostListItem = BlogPostSummary & {
  is_published: boolean;
  comments_total: number;
  comments_pending: number;
  created_at: string;
  updated_at: string;
};

export type AdminBlogPostDetail = AdminBlogPostListItem & {
  content_markdown: string;
  seo_title?: string | null;
  seo_description?: string | null;
  comments: AdminBlogComment[];
};

export type BlogPostDetail = BlogPostSummary & {
  content_markdown: string;
  seo_title?: string | null;
  seo_description?: string | null;
  comments: Array<{
    id: number;
    author_name: string;
    body: string;
    created_at: string;
  }>;
};

export type BlogSummary = {
  total_posts: number;
  published_posts: number;
  draft_posts: number;
  featured_posts: number;
  pending_comments: number;
  approved_comments: number;
};

export type BlogPostInput = {
  title: string;
  slug?: string;
  excerpt: string;
  cover_image_url?: string;
  category: string;
  author_name: string;
  tags: string[];
  content_markdown: string;
  seo_title?: string;
  seo_description?: string;
  is_published: boolean;
  is_featured: boolean;
  published_at?: string | null;
};

export const EMPTY_BLOG_POST: BlogPostInput = {
  title: "",
  slug: "",
  excerpt: "",
  cover_image_url: "",
  category: "Insights",
  author_name: "Benela Team",
  tags: [],
  content_markdown: "## Headline\n\nStart writing here...",
  seo_title: "",
  seo_description: "",
  is_published: false,
  is_featured: false,
  published_at: null,
};

async function parseError(res: Response, fallback: string): Promise<string> {
  const payload = await res.json().catch(() => null);
  return payload?.detail || fallback;
}

export function parseTagsInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function tagsToInput(tags: string[]): string {
  return tags.join(", ");
}

export function formatReadTime(minutes?: number | null): string {
  return `${Math.max(1, Number(minutes || 1))} min read`;
}

export function slugifyBlogValue(value?: string | null, fallback = "general"): string {
  return (value || fallback)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

export function slugifyBlogCategory(category?: string | null): string {
  return slugifyBlogValue(category, "general");
}

export function slugifyBlogTag(tag?: string | null): string {
  return slugifyBlogValue(tag, "tag");
}

export function slugifyBlogTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (const tag of tags) {
    const slug = slugifyBlogTag(tag);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}

export function buildBlogPostPath(post: { category?: string | null; category_slug?: string | null; slug: string }): string {
  const categorySlug = post.category_slug?.trim() || slugifyBlogCategory(post.category);
  return `/blog/${categorySlug}/${post.slug}`;
}

export async function fetchAdminBlogSummary(): Promise<BlogSummary> {
  const res = await authFetch(`${API}/admin/blog/summary`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load blog summary."));
  return (await res.json()) as BlogSummary;
}

export async function listAdminBlogPosts(query = "", status = "all"): Promise<AdminBlogPostListItem[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (status && status !== "all") params.set("status", status);
  params.set("limit", "250");
  const res = await authFetch(`${API}/admin/blog/posts?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load blog posts."));
  return (await res.json()) as AdminBlogPostListItem[];
}

export async function fetchAdminBlogPost(postId: number): Promise<AdminBlogPostDetail> {
  const res = await authFetch(`${API}/admin/blog/posts/${postId}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load blog post."));
  return (await res.json()) as AdminBlogPostDetail;
}

export async function saveAdminBlogPost(input: BlogPostInput, postId?: number | null): Promise<AdminBlogPostDetail> {
  const payload = {
    ...input,
    slug: input.slug?.trim() || null,
    cover_image_url: input.cover_image_url?.trim() || null,
    seo_title: input.seo_title?.trim() || null,
    seo_description: input.seo_description?.trim() || null,
    published_at: input.published_at || null,
  };
  const res = await authFetch(postId ? `${API}/admin/blog/posts/${postId}` : `${API}/admin/blog/posts`, {
    method: postId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not save blog post."));
  return (await res.json()) as AdminBlogPostDetail;
}

export async function deleteAdminBlogPost(postId: number): Promise<void> {
  const res = await authFetch(`${API}/admin/blog/posts/${postId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res, "Could not delete blog post."));
}

export async function listAdminBlogComments(status = "all", postId?: number | null): Promise<AdminBlogComment[]> {
  const params = new URLSearchParams({ status, limit: "300" });
  if (typeof postId === "number") params.set("post_id", String(postId));
  const res = await authFetch(`${API}/admin/blog/comments?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load blog comments."));
  return (await res.json()) as AdminBlogComment[];
}

export async function updateAdminBlogCommentStatus(commentId: number, status: "pending" | "approved" | "rejected"): Promise<AdminBlogComment> {
  const res = await authFetch(`${API}/admin/blog/comments/${commentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not update comment status."));
  return (await res.json()) as AdminBlogComment;
}

export async function fetchPublicBlogPosts(featuredOnly = false): Promise<BlogPostSummary[]> {
  const params = new URLSearchParams({ limit: "24" });
  if (featuredOnly) params.set("featured_only", "true");
  const res = await fetch(`${API}/platform/blog/posts?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res, "Could not load blog posts."));
  return (await res.json()) as BlogPostSummary[];
}

export async function fetchPublicBlogPost(categorySlug: string, slug: string): Promise<BlogPostDetail> {
  const res = await fetch(`${API}/platform/blog/posts/${categorySlug}/${slug}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res, "Could not load blog article."));
  return (await res.json()) as BlogPostDetail;
}

export async function fetchLegacyPublicBlogPost(slug: string): Promise<BlogPostDetail> {
  const res = await fetch(`${API}/platform/blog/posts/${slug}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res, "Could not load blog article."));
  return (await res.json()) as BlogPostDetail;
}

export async function submitPublicBlogComment(
  categorySlug: string,
  slug: string,
  payload: { author_name: string; author_email: string; body: string },
) {
  const res = await fetch(`${API}/platform/blog/posts/${categorySlug}/${slug}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not submit comment."));
  return (await res.json()) as { id: number; status: string; message: string };
}
