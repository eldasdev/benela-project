"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { getClientWorkspaceId } from "@/lib/client-settings";
import {
  captureProductEvent,
  identifyProductUser,
  initPostHog,
  isPostHogEnabled,
  resetProductUser,
} from "@/lib/posthog";

function normalizeUserRole(role: unknown): string {
  return typeof role === "string" && role.trim() ? role.trim() : "anonymous";
}

function resolveUserType(role: string): "admin" | "client" | "guest" {
  if (["admin", "owner", "super_admin"].includes(role)) return "admin";
  if (role === "client") return "client";
  return "guest";
}

function resolveWorkspaceId(): string | undefined {
  const workspaceId = getClientWorkspaceId();
  if (!workspaceId || workspaceId === "default-workspace") return undefined;
  return workspaceId;
}

function resolvePageArea(pathname: string): string {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/finance") || pathname.startsWith("/hr") || pathname.startsWith("/projects")) {
    return "client";
  }
  if (pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/auth")) {
    return "auth";
  }
  return "marketing";
}

export default function PostHogBridge() {
  const pathname = usePathname();
  const userRoleRef = useRef<string>("anonymous");

  useEffect(() => {
    if (!isPostHogEnabled()) return;
    initPostHog();
    const supabase = getSupabase();
    let active = true;

    const syncUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!active) return;
        const role = normalizeUserRole(session?.user?.user_metadata?.role);
        const userType = resolveUserType(role);
        userRoleRef.current = role;
        if (session?.user?.id) {
          identifyProductUser({
            userId: session.user.id,
            role,
            userType,
            workspaceId: userType === "client" ? resolveWorkspaceId() : undefined,
          });
        } else {
          resetProductUser();
        }
      } catch {
        if (!active) return;
        userRoleRef.current = "anonymous";
      }
    };

    void syncUser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const role = normalizeUserRole(session?.user?.user_metadata?.role);
      const userType = resolveUserType(role);
      userRoleRef.current = role;
      if (session?.user?.id) {
        identifyProductUser({
          userId: session.user.id,
          role,
          userType,
          workspaceId: userType === "client" ? resolveWorkspaceId() : undefined,
        });
      } else {
        resetProductUser();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!pathname || !isPostHogEnabled()) return;
    const role = userRoleRef.current || "anonymous";
    const userType = resolveUserType(role);
    captureProductEvent("benela_page_view", {
      path: pathname,
      page_area: resolvePageArea(pathname),
      user_role: role,
      user_type: userType,
      workspace_id: userType === "client" ? resolveWorkspaceId() : undefined,
      has_query: typeof window !== "undefined" ? Boolean(window.location.search) : false,
    });
  }, [pathname]);

  return null;
}
