"use client";

import AdminBlogEditorScreen from "@/components/admin/blog/AdminBlogEditorScreen";
import { AdminPageHero } from "@/components/admin/ui";
import { useParams } from "next/navigation";

export default function AdminBlogEditPage() {
  const params = useParams<{ postId: string }>();
  const rawPostId = Array.isArray(params?.postId) ? params.postId[0] : params?.postId;
  const postId = rawPostId ? Number(rawPostId) : NaN;

  if (!Number.isFinite(postId) || postId <= 0) {
    return (
      <div className="admin-page-shell" style={{ maxWidth: "1120px", margin: "0 auto", display: "grid", gap: "22px" }}>
        <AdminPageHero
          eyebrow="Editorial edit route"
          title="Invalid article id"
          subtitle="The edit route needs a valid blog post id. Return to the blog studio and reopen the article from the list."
        />
      </div>
    );
  }

  return <AdminBlogEditorScreen postId={postId} />;
}
