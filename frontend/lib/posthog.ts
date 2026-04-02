"use client";

import posthog from "posthog-js";

type AnalyticsIdentity = {
  userId: string;
  role?: string | null;
  userType?: "admin" | "client" | "guest";
  workspaceId?: string | null;
};

let initialized = false;

function getPostHogKey(): string {
  return (process.env.NEXT_PUBLIC_POSTHOG_KEY || "").trim();
}

function getPostHogHost(): string {
  return (process.env.NEXT_PUBLIC_POSTHOG_HOST || "").trim();
}

export function isPostHogEnabled(): boolean {
  return typeof window !== "undefined" && Boolean(getPostHogKey() && getPostHogHost());
}

export function initPostHog(): void {
  if (initialized || !isPostHogEnabled()) return;
  posthog.init(getPostHogKey(), {
    api_host: getPostHogHost(),
    autocapture: true,
    capture_pageview: false,
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
  });
  initialized = true;
}

export function identifyProductUser(identity: AnalyticsIdentity): void {
  if (!identity.userId || !isPostHogEnabled()) return;
  initPostHog();
  posthog.identify(identity.userId, {
    user_role: (identity.role || "unknown").trim() || "unknown",
    user_type: identity.userType || "guest",
    workspace_id:
      identity.workspaceId && identity.workspaceId !== "default-workspace"
        ? identity.workspaceId
        : undefined,
  });
}

export function resetProductUser(): void {
  if (!isPostHogEnabled()) return;
  initPostHog();
  posthog.reset();
}

export function captureProductEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  if (!eventName || !isPostHogEnabled()) return;
  initPostHog();
  posthog.capture(eventName, properties);
}
