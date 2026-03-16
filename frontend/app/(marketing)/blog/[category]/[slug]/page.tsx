"use client";

import { useParams } from "next/navigation";
import BlogArticleClient from "@/components/marketing/blog/BlogArticleClient";

export default function BlogArticleRoutePage() {
  const params = useParams<{ category: string; slug: string }>();
  const category = Array.isArray(params?.category) ? params.category[0] : params?.category;
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  if (!category || !slug) {
    return null;
  }

  return <BlogArticleClient categorySlug={category} slug={slug} />;
}
