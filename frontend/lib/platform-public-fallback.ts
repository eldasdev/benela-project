import { DEFAULT_ABOUT_CONTENT } from "@/lib/platform-about";
import { DEFAULT_PRICING_PLANS } from "@/lib/pricing-plans";

type ApiPlanFeature = {
  label: string;
  included: boolean;
};

type ApiPricingPlan = {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  users: string;
  features: ApiPlanFeature[];
  recommended?: boolean;
};

export type FallbackBlogSummary = {
  id: number;
  title: string;
  slug: string;
  category: string;
  category_slug: string;
  excerpt: string;
  cover_image_url?: string | null;
  author_name: string;
  tags: string[];
  tag_slugs: string[];
  read_time_minutes: number;
  is_featured: boolean;
  published_at: string;
};

export type FallbackBlogDetail = FallbackBlogSummary & {
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

function slugify(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export function getFallbackPricingPlans(): ApiPricingPlan[] {
  return DEFAULT_PRICING_PLANS.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price_monthly: plan.priceMonthly,
    price_yearly: plan.priceYearly,
    users: plan.users,
    recommended: Boolean(plan.recommended),
    features: plan.features.map((feature) => ({
      label: feature.label,
      included: feature.included,
    })),
  }));
}

const fallbackPosts: FallbackBlogDetail[] = [
  {
    id: 1,
    title: "Benela Journal Launch: Why We Built a Business Operating Layer, Not Another Dashboard",
    slug: "benela-journal-launch-business-operating-layer",
    category: "News",
    category_slug: "news",
    excerpt:
      "A clear view of how Benela is positioning the platform: one operating layer for finance, operations, people, and AI-assisted execution.",
    cover_image_url: "/dashboard-screenshot.png",
    author_name: "Benela Team",
    tags: ["Benela", "Product", "Operations"],
    tag_slugs: ["benela", "product", "operations"],
    read_time_minutes: 5,
    is_featured: true,
    published_at: "2026-03-16T08:00:00Z",
    seo_title: "Benela Journal Launch",
    seo_description: "Why Benela is building an AI-native business operating layer.",
    content_markdown: `## Why this journal exists

Benela is not being built as a reporting shell or an AI wrapper around disconnected tools.

We are building an operating layer for companies that need:

- one command surface for finance, HR, sales, legal, and execution
- stronger decision visibility across teams
- AI grounded in company context instead of empty prompt boxes

## What readers should expect

This journal will carry three kinds of content:

1. Product and platform updates from the Benela roadmap
2. Practical operating insights for companies replacing spreadsheet-led coordination
3. Editorial analysis on how AI changes business infrastructure

## Why now

Teams are running serious businesses with too many systems, too much duplicated effort, and too little operational traceability.

That gap is exactly where Benela is focused.`,
    comments: [
      {
        id: 1,
        author_name: "Editorial Desk",
        body: "This fallback article is visible while the production publishing service is being updated.",
        created_at: "2026-03-16T09:00:00Z",
      },
    ],
  },
  {
    id: 2,
    title: "From Spreadsheet Control to Operating Discipline: What Growing Teams Actually Need",
    slug: "spreadsheet-control-to-operating-discipline",
    category: "Insights",
    category_slug: "insights",
    excerpt:
      "Why fragmented tools slow down execution, and what an operational system needs before automation can be trusted.",
    cover_image_url: "/dashboard-screenshot.png",
    author_name: "Benela Editorial",
    tags: ["Insights", "ERP", "Execution"],
    tag_slugs: ["insights", "erp", "execution"],
    read_time_minutes: 6,
    is_featured: false,
    published_at: "2026-03-14T10:00:00Z",
    seo_title: "From Spreadsheet Control to Operating Discipline",
    seo_description: "How serious teams move beyond spreadsheet-led execution.",
    content_markdown: `## The real bottleneck is coordination

Most companies do not fail because they lack dashboards.

They fail because:

- approvals are scattered
- ownership is unclear
- reporting is slow
- decisions are not connected to execution

## The operating-system requirement

Before AI can improve execution, the company needs a connected operational layer with:

- shared records
- policy-aware workflows
- reliable task context
- role-based visibility

That is the difference between tooling and infrastructure.`,
    comments: [],
  },
  {
    id: 3,
    title: "AI in Business Systems: Useful When Grounded, Expensive When Generic",
    slug: "ai-in-business-systems-grounded-not-generic",
    category: "Industries",
    category_slug: "industries",
    excerpt:
      "A practical view on why AI becomes operationally valuable only when tied to real workflows, policies, and current company context.",
    cover_image_url: "/dashboard-screenshot.png",
    author_name: "Benela Research",
    tags: ["AI", "Industries", "Governance"],
    tag_slugs: ["ai", "industries", "governance"],
    read_time_minutes: 7,
    is_featured: false,
    published_at: "2026-03-12T11:30:00Z",
    seo_title: "AI in Business Systems",
    seo_description: "Why generic AI is not enough for serious business execution.",
    content_markdown: `## Generic AI is not an operating model

Teams often expect value from AI before the system has:

- structured business records
- current workflow state
- access policies
- clear execution pathways

That creates polished output with weak operational reliability.

## Grounded AI behaves differently

When assistants are tied to real company context, they can:

- summarize live operational state
- draft next actions from actual records
- support decision loops instead of isolated prompts
- improve execution speed with accountability intact

That is where Benela is focused.`,
    comments: [],
  },
];

export function getFallbackBlogPosts(): FallbackBlogSummary[] {
  return fallbackPosts.map(({ content_markdown, seo_title, seo_description, comments, ...summary }) => summary);
}

export function findFallbackBlogPost(categorySlug: string, slug: string): FallbackBlogDetail | null {
  return fallbackPosts.find((post) => post.category_slug === categorySlug && post.slug === slug) || null;
}

export function findFallbackBlogPostBySlug(slug: string): FallbackBlogDetail | null {
  return fallbackPosts.find((post) => post.slug === slug) || null;
}

export function getFallbackRuntimeStatus() {
  return {
    platform_name: "Benela",
    support_email: "support@benela.dev",
    status_page_url: null,
    maintenance_mode: false,
    allow_new_signups: true,
    allow_marketplace: true,
    allow_plugin_purchases: true,
    updated_at: new Date().toISOString(),
  };
}

export function getFallbackAboutPage() {
  return {
    ...DEFAULT_ABOUT_CONTENT,
    updated_at: new Date().toISOString(),
  };
}

export function normalizeFallbackPostsFromCategory(category: string, slug: string) {
  const categorySlug = slugify(category, "general");
  return fallbackPosts.find((post) => post.category_slug === categorySlug && post.slug === slug) || null;
}
