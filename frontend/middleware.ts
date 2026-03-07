import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PATH_PREFIXES = ["/dashboard", "/settings", "/notifications", "/admin"] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function applyNoStoreHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
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

  // Protect workspace routes from anonymous access.
  if (!user && isProtectedPath(pathname)) {
    return applyNoStoreHeaders(NextResponse.redirect(new URL("/login", request.url)));
  }

  // Redirect logged-in users away from login/signup
  if (user && (pathname === "/login" || pathname === "/signup")) {
    return applyNoStoreHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  // Prevent edge caches from storing dynamic auth-protected and auth pages.
  if (isProtectedPath(pathname) || pathname === "/login" || pathname === "/signup") {
    applyNoStoreHeaders(response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
