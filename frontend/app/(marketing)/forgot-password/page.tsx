"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { useI18n } from "@/components/i18n/LanguageProvider";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (resetError) {
      setError(resetError.message || t("auth.forgotPassword.sendError"));
    } else {
      setSuccess(t("auth.forgotPassword.sentSuccess"));
    }
    setLoading(false);
  };

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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "20px",
            padding: "28px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <MailCheck size={18} />
            <h1 style={{ margin: 0, fontSize: "20px", color: "var(--text-primary)" }}>{t("auth.forgotPassword.title")}</h1>
          </div>
          <p style={{ marginTop: 0, fontSize: "13px", color: "var(--text-subtle)" }}>
            {t("auth.forgotPassword.subtitle")}
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.forgotPassword.emailPlaceholder")}
              required
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: "10px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            {error ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "9px",
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  color: "#f87171",
                  fontSize: "13px",
                }}
              >
                {error}
              </div>
            ) : null}

            {success ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "9px",
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.25)",
                  color: "#22c55e",
                  fontSize: "13px",
                }}
              >
                {success}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                border: "none",
                color: "white",
                fontSize: "14px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} />
                  {t("auth.forgotPassword.sending")}
                </>
              ) : (
                t("auth.forgotPassword.sendLink")
              )}
            </button>
          </form>

          <p style={{ marginTop: "14px", fontSize: "13px", color: "var(--text-subtle)" }}>
            {t("auth.forgotPassword.backTo")}{" "}
            <Link href="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
              {t("auth.forgotPassword.signIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
