import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import {
  findFallbackBlogPost,
  findFallbackBlogPostBySlug,
  getFallbackAboutPage,
  getFallbackBlogPosts,
  getFallbackPricingPlans,
  getFallbackRuntimeStatus,
} from "@/lib/platform-public-fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORWARDED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const;
type ForwardMethod = (typeof FORWARDED_METHODS)[number];

function resolveBackendOrigin(): string {
  const candidates = [
    process.env.API_PROXY_TARGET,
    process.env.BACKEND_ORIGIN,
    process.env.NEXT_PUBLIC_BACKEND_ORIGIN,
    process.env.NEXT_PUBLIC_API_URL?.startsWith("http") ? process.env.NEXT_PUBLIC_API_URL : "",
  ];
  for (const candidate of candidates) {
    const value = (candidate || "").trim().replace(/\/+$/, "").replace(/\/api$/i, "");
    if (!value) continue;
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
  }
  if (process.env.NODE_ENV === "production") {
    return "https://benela-backend-vtjir.ondigitalocean.app";
  }
  return "http://127.0.0.1:8000";
}

function buildTargetUrl(request: NextRequest, path: string[]): URL {
  const base = resolveBackendOrigin();
  const cleanSegments = (path || []).filter(Boolean).map(encodeURIComponent).join("/");
  const target = new URL(`/${cleanSegments}`, base);
  const current = new URL(request.url);
  target.search = current.search;
  return target;
}

function prepareHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  // Let upstream decide transfer encoding; avoid mismatched compressed payload handling.
  headers.delete("accept-encoding");
  return headers;
}

function fallbackJson(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "x-benela-fallback": "1",
      "cache-control": "no-store",
    },
  });
}

function tryResolvePlatformFallback(request: NextRequest, path: string[], method: ForwardMethod): Response | null {
  if (path[0] !== "platform") return null;

  if (method === "GET" && path.length === 2 && path[1] === "pricing-plans") {
    return fallbackJson(getFallbackPricingPlans());
  }

  if (method === "GET" && path.length === 2 && path[1] === "runtime") {
    return fallbackJson(getFallbackRuntimeStatus());
  }

  if (method === "GET" && path.length === 2 && path[1] === "about") {
    return fallbackJson(getFallbackAboutPage());
  }

  if (path[1] === "blog" && path[2] === "posts") {
    if (method === "GET" && path.length === 3) {
      const featuredOnly = request.nextUrl.searchParams.get("featured_only") === "true";
      const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || "24");
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 24;
      const posts = getFallbackBlogPosts();
      const filtered = featuredOnly ? posts.filter((post) => post.is_featured) : posts;
      return fallbackJson(filtered.slice(0, limit));
    }

    if (method === "GET" && path.length === 4) {
      const post = findFallbackBlogPostBySlug(path[3]);
      if (post) return fallbackJson(post);
      return null;
    }

    if (method === "GET" && path.length === 5) {
      const post = findFallbackBlogPost(path[3], path[4]);
      if (post) return fallbackJson(post);
      return null;
    }

    if (method === "POST" && ((path.length === 5 && path[4] === "comments") || (path.length === 6 && path[5] === "comments"))) {
      return fallbackJson(
        {
          detail: "Comments are temporarily unavailable while the publishing service is updating.",
        },
        503,
      );
    }
  }

  return null;
}

async function resolveAccessToken(request: NextRequest): Promise<string | null> {
  const existingAuthHeader = (request.headers.get("authorization") || "").trim();
  if (existingAuthHeader.toLowerCase().startsWith("bearer ")) {
    return existingAuthHeader.slice(7).trim() || null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Proxy route does not own auth cookie refresh persistence.
        },
      },
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
  } catch {
    return null;
  }
}

async function forward(request: NextRequest, path: string[], method: ForwardMethod): Promise<Response> {
  const target = buildTargetUrl(request, path);
  const headers = prepareHeaders(request);
  const accessToken = await resolveAccessToken(request);
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  };

  if (!["GET", "HEAD"].includes(method)) {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    const fallback = tryResolvePlatformFallback(request, path, method);
    if (fallback) return fallback;
    const detail = error instanceof Error ? error.message : "Upstream request failed.";
    const status = detail.toLowerCase().includes("timeout") ? 504 : 502;
    return Response.json(
      { detail: status === 504 ? "Backend request timed out." : "Backend request failed." },
      { status },
    );
  }
  const responseHeaders = new Headers(upstream.headers);
  if (upstream.status === 404 || upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
    const fallback = tryResolvePlatformFallback(request, path, method);
    if (fallback) return fallback;
  }
  // Node fetch may return a decoded body while preserving upstream encoding headers.
  // Drop hop-by-hop / payload-size headers to prevent browser decode failures.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("connection");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path, "GET");
}
export async function POST(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path, "POST");
}
export async function PUT(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path, "PUT");
}
export async function PATCH(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path, "PATCH");
}
export async function DELETE(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path, "DELETE");
}
export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path, "OPTIONS");
}
export async function HEAD(request: NextRequest, context: RouteContext) {
  return forward(request, (await context.params).path, "HEAD");
}
