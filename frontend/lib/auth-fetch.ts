"use client";

import { getSupabase } from "@/lib/supabase";

const PENDING_ACCESS_TOKEN_KEY = "benela_pending_access_token";

function readPendingAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.sessionStorage.getItem(PENDING_ACCESS_TOKEN_KEY);
  return token && token.trim() ? token.trim() : null;
}

function clearPendingAccessToken() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PENDING_ACCESS_TOKEN_KEY);
}

export function persistPendingAccessToken(token: string | null | undefined) {
  if (typeof window === "undefined") return;
  const normalized = (token || "").trim();
  if (!normalized) {
    clearPendingAccessToken();
    return;
  }
  window.sessionStorage.setItem(PENDING_ACCESS_TOKEN_KEY, normalized);
}

async function resolveBrowserAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const {
    data: { session },
  } = await getSupabase().auth.getSession();

  const accessToken = session?.access_token?.trim() || null;
  if (accessToken) {
    clearPendingAccessToken();
    return accessToken;
  }

  return readPendingAccessToken();
}

export async function waitForBrowserSession(timeoutMs = 2500): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const token = await resolveBrowserAccessToken();
    if (token) return token;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  return readPendingAccessToken();
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const existingHeaders = new Headers(init?.headers || {});
  const hasExplicitAuthorization = existingHeaders.has("authorization");
  let resolvedToken: string | null = null;

  if (!hasExplicitAuthorization) {
    resolvedToken = await resolveBrowserAccessToken();
    if (!resolvedToken) {
      resolvedToken = await waitForBrowserSession(6000);
    }
    if (resolvedToken) {
      existingHeaders.set("authorization", `Bearer ${resolvedToken}`);
    }
  }

  const execute = (headers: Headers) =>
    fetch(input, {
      ...init,
      headers,
      credentials: init?.credentials ?? "same-origin",
    });

  let response = await execute(existingHeaders);

  if (response.status === 401 && !hasExplicitAuthorization && typeof window !== "undefined") {
    const retryToken = await waitForBrowserSession(6000);
    if (retryToken) {
      const retryHeaders = new Headers(init?.headers || {});
      retryHeaders.set("authorization", `Bearer ${retryToken}`);
      response = await execute(retryHeaders);
    }
  }

  return response;
}
