import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PATH_PREFIXES = ["/dashboard", "/settings", "/notifications", "/admin"] as const;
const ADMIN_PUBLIC_PATHS = ["/admin/login"] as const;
const MAINTENANCE_PATH = "/maintenance";
const AUTH_CALLBACK_PATH = "/auth/callback";

function hasAuthCallbackParams(url: URL): boolean {
  const keys = ["code", "token_hash", "type", "error", "error_code", "error_description", "access_token", "refresh_token"];
  return keys.some((key) => url.searchParams.has(key));
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAdminPublicPath(pathname: string): boolean {
  return ADMIN_PUBLIC_PATHS.some((publicPath) => pathname === publicPath);
}

function isAdminRole(role: unknown): boolean {
  if (typeof role !== "string") return false;
  return ["admin", "owner", "super_admin"].includes(role);
}

function applyNoStoreHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

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

async function getMaintenanceMode(): Promise<boolean> {
  try {
    const response = await fetch(`${resolveBackendOrigin()}/platform/runtime`, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { maintenance_mode?: boolean };
    return Boolean(payload.maintenance_mode);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/" && hasAuthCallbackParams(request.nextUrl)) {
    const nextUrl = new URL(AUTH_CALLBACK_PATH, request.url);
    nextUrl.search = request.nextUrl.search;
    return applyNoStoreHeaders(NextResponse.redirect(nextUrl));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const userRole = user?.user_metadata?.role;
  const adminUser = isAdminRole(userRole);

  // Protect workspace routes from anonymous access.
  if (!user && isProtectedPath(pathname) && !isAdminPublicPath(pathname)) {
    return applyNoStoreHeaders(NextResponse.redirect(new URL("/login", request.url)));
  }

  // Redirect logged-in users away from login/signup
  if (user && (pathname === "/login" || pathname === "/signup")) {
    return applyNoStoreHeaders(
      NextResponse.redirect(new URL(adminUser ? "/admin/dashboard" : "/dashboard", request.url))
    );
  }

  if (user && pathname.startsWith("/admin") && !adminUser && !isAdminPublicPath(pathname)) {
    return applyNoStoreHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  if (user && adminUser && isAdminPublicPath(pathname)) {
    return applyNoStoreHeaders(NextResponse.redirect(new URL("/admin/dashboard", request.url)));
  }

  if (user && adminUser && ["/dashboard", "/settings", "/notifications"].some((prefix) => pathname.startsWith(prefix))) {
    return applyNoStoreHeaders(NextResponse.redirect(new URL("/admin/dashboard", request.url)));
  }

  const isAdminPath = pathname.startsWith("/admin");
  const isApiPath = pathname.startsWith("/api");
  if (!isAdminPath && !isApiPath && pathname !== AUTH_CALLBACK_PATH) {
    const maintenanceMode = await getMaintenanceMode();

    if (maintenanceMode) {
      if (adminUser) {
        return applyNoStoreHeaders(NextResponse.redirect(new URL("/admin/dashboard", request.url)));
      }
      if (pathname !== MAINTENANCE_PATH) {
        return applyNoStoreHeaders(NextResponse.redirect(new URL(MAINTENANCE_PATH, request.url)));
      }
    } else if (pathname === MAINTENANCE_PATH) {
      return applyNoStoreHeaders(
        NextResponse.redirect(new URL(user ? (adminUser ? "/admin/dashboard" : "/dashboard") : "/", request.url))
      );
    }
  }

  // Prevent edge caches from storing dynamic auth-protected and auth pages.
  if (
    isProtectedPath(pathname) ||
    isAdminPublicPath(pathname) ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === MAINTENANCE_PATH ||
    pathname === AUTH_CALLBACK_PATH
  ) {
    applyNoStoreHeaders(response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
