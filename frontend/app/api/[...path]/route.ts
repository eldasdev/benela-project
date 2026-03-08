import { NextRequest } from "next/server";

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
    const value = (candidate || "").trim().replace(/\/+$/, "");
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
  const target = new URL(`/api/${cleanSegments}`, base);
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

async function forward(request: NextRequest, path: string[], method: ForwardMethod): Promise<Response> {
  const target = buildTargetUrl(request, path);
  const headers = prepareHeaders(request);
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };

  if (!["GET", "HEAD"].includes(method)) {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const responseHeaders = new Headers(upstream.headers);
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
