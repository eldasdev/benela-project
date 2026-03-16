"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { ensureClientWorkspaceAccount } from "@/lib/client-account";
import { useI18n } from "@/components/i18n/LanguageProvider";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

function isOtpType(value: string | null): value is EmailOtpType {
  return Boolean(value && OTP_TYPES.includes(value as EmailOtpType));
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForSession(attempts = 8): Promise<Session | null> {
  const supabase = getSupabase();
  for (let index = 0; index < attempts; index += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) return session;
    await delay(250);
  }
  return null;
}

function normalizeErrorMessage(message: string | null, code: string | null, fallback: string): string {
  const trimmed = (message || "").trim();
  if (!trimmed) return fallback;
  if (code === "otp_expired") {
    return trimmed.replace("Email link is invalid or has expired", fallback);
  }
  return trimmed;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [phase, setPhase] = useState<"processing" | "redirecting" | "error">("processing");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const run = async () => {
      const supabase = getSupabase();
      const search = new URLSearchParams(window.location.search);
      const nextPath = (() => {
        const raw = search.get("next");
        if (!raw || !raw.startsWith("/")) return "/dashboard";
        return raw;
      })();
      const searchError = search.get("error");
      const searchErrorCode = search.get("error_code");
      const searchErrorDescription = search.get("error_description");
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const hashError = hashParams.get("error");
      const hashErrorCode = hashParams.get("error_code");
      const hashErrorDescription = hashParams.get("error_description");

      const authError = searchError || hashError;
      const authErrorCode = searchErrorCode || hashErrorCode;
      const authErrorDescription = searchErrorDescription || hashErrorDescription;

      if (authError) {
        if (!active) return;
        setError(
          normalizeErrorMessage(
            authErrorDescription,
            authErrorCode,
            t("auth.callback.linkExpired"),
          ),
        );
        setPhase("error");
        return;
      }

      try {
        let session = await waitForSession(2);
        const code = search.get("code");
        const tokenHash = search.get("token_hash");
        const otpType = search.get("type");

        if (!session && code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (!session && tokenHash && isOtpType(otpType)) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          if (verifyError) throw verifyError;
        }

        session = session || (await waitForSession());
        const user = session?.user;
        if (!user) {
          throw new Error(t("auth.callback.sessionMissing"));
        }

        const role = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "";
        if (!active) return;
        setPhase("redirecting");

        if (role === "admin" || role === "owner" || role === "super_admin") {
          router.replace("/admin/dashboard");
          return;
        }

        try {
          const { summary, bootstrapped } = await ensureClientWorkspaceAccount(user.id);
          if (bootstrapped || summary?.exists === false) {
            router.replace("/settings?setup=business");
            return;
          }
        } catch {
          // Fall back to the requested route if workspace hydration is temporarily unavailable.
        }

        router.replace(nextPath);
      } catch (callbackError: unknown) {
        if (!active) return;
        const message =
          callbackError instanceof Error ? callbackError.message : t("auth.callback.genericError");
        setError(normalizeErrorMessage(message, search.get("error_code"), t("auth.callback.genericError")));
        setPhase("error");
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [router, t]);

  const isProcessing = phase !== "error";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-canvas)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "24px",
          padding: "32px",
          boxShadow: "0 24px 64px color-mix(in srgb, var(--brand-glow) 10%, transparent)",
        }}
      >
        <div
          style={{
            width: "58px",
            height: "58px",
            borderRadius: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "18px",
            background:
              phase === "error"
                ? "color-mix(in srgb, var(--danger) 12%, var(--bg-panel))"
                : "color-mix(in srgb, var(--accent) 12%, var(--bg-panel))",
            border:
              phase === "error"
                ? "1px solid color-mix(in srgb, var(--danger) 24%, transparent)"
                : "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
          }}
        >
          {phase === "error" ? (
            <TriangleAlert size={24} color="var(--danger)" />
          ) : phase === "redirecting" ? (
            <CheckCircle2 size={24} color="var(--accent)" />
          ) : (
            <Loader2 size={24} color="var(--accent)" style={{ animation: "spin 0.8s linear infinite" }} />
          )}
        </div>

        <h1 style={{ fontSize: "28px", lineHeight: 1.1, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
          {phase === "error"
            ? t("auth.callback.errorTitle")
            : phase === "redirecting"
            ? t("auth.callback.redirectingTitle")
            : t("auth.callback.processingTitle")}
        </h1>

        <p style={{ fontSize: "15px", lineHeight: 1.75, color: "var(--text-subtle)", margin: 0 }}>
          {phase === "error"
            ? error
            : phase === "redirecting"
            ? t("auth.callback.redirectingBody")
            : t("auth.callback.processingBody")}
        </p>

        {phase === "error" ? (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "24px" }}>
            <Link
              href="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "132px",
                padding: "12px 16px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: "white",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              {t("auth.callback.goToLogin")}
            </Link>
            <Link
              href="/signup"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "132px",
                padding: "12px 16px",
                borderRadius: "12px",
                background: "var(--bg-panel)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              {t("auth.callback.backToSignup")}
            </Link>
          </div>
        ) : null}
      </div>

      {isProcessing ? <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style> : null}
    </div>
  );
}
