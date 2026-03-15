"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Loader2, Lock, ShieldCheck, Sparkles } from "lucide-react";

function isAdminRole(role: unknown): boolean {
  if (typeof role !== "string") return false;
  return ["admin", "owner", "super_admin"].includes(role);
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--bg-surface) 86%, var(--accent-soft) 14%)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  fontSize: "14px",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 0.18s ease, box-shadow 0.18s ease",
  boxSizing: "border-box",
  boxShadow: "0 12px 24px rgba(5, 10, 24, 0.2)",
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: signInError } = await getSupabase().auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    const role = data.user?.user_metadata?.role;
    if (!isAdminRole(role)) {
      await getSupabase().auth.signOut();
      router.push("/login");
      setLoading(false);
      return;
    }
    router.push("/admin/dashboard");
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
        padding: "clamp(16px, 3vw, 32px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          position: "fixed",
          top: "-16%",
          left: "-8%",
          width: "min(54vw, 640px)",
          height: "min(54vw, 640px)",
          borderRadius: "999px",
          background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          right: "-16%",
          bottom: "-20%",
          width: "min(52vw, 620px)",
          height: "min(52vw, 620px)",
          borderRadius: "999px",
          background: "radial-gradient(circle, color-mix(in srgb, var(--accent-2) 18%, transparent) 0%, transparent 74%)",
          pointerEvents: "none",
        }}
      />

      <div
        className="admin-login-shell"
        style={{
          width: "100%",
          maxWidth: "980px",
          borderRadius: "24px",
          border: "1px solid var(--border-default)",
          background:
            "linear-gradient(145deg, color-mix(in srgb, var(--bg-panel) 84%, var(--accent-soft) 16%) 0%, color-mix(in srgb, var(--bg-panel) 94%, transparent) 100%)",
          boxShadow: "0 34px 88px rgba(4, 8, 20, 0.45)",
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <section
          className="admin-login-intro"
          style={{
            padding: "clamp(24px, 4vw, 48px)",
            borderRight: "1px solid var(--border-default)",
            background:
              "linear-gradient(160deg, color-mix(in srgb, var(--bg-elevated) 84%, var(--accent-soft) 16%) 0%, color-mix(in srgb, var(--bg-panel) 96%, transparent) 100%)",
            display: "grid",
            alignContent: "space-between",
            gap: "18px",
          }}
        >
          <div style={{ display: "grid", gap: "16px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                width: "fit-content",
                padding: "6px 12px",
                borderRadius: "999px",
                background: "color-mix(in srgb, var(--accent-soft) 76%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--border-default) 72%)",
                color: "var(--accent)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.1em",
              }}
            >
              <ShieldCheck size={14} />
              ADMIN PANEL
            </div>
            <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.04, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
              Benela Admin Control Center
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.65, maxWidth: "460px" }}>
              Secure access for super-admin operations, billing oversight, and platform governance.
            </p>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            {[
              "Cross-workspace operations and audit visibility",
              "AI Trainer, subscriptions, payments, and client controls",
              "Security-first sign-in for owner-level access",
            ].map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                <Sparkles size={13} color="var(--accent)" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            padding: "clamp(20px, 3vw, 32px)",
            display: "grid",
            alignContent: "center",
          }}
        >
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "6px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "12px",
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--accent) 82%, #fff 18%), var(--accent-2))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 14px 34px color-mix(in srgb, var(--accent) 32%, transparent)",
                }}
              >
                <Lock size={20} color="white" />
              </div>
              <span style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                Admin Sign In
              </span>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-subtle)" }}>Owner and super-admin only</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@benela.dev"
                style={input}
                onFocus={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = "var(--accent)";
                  (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)";
                }}
                onBlur={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = "var(--border-default)";
                  (e.target as HTMLInputElement).style.boxShadow = "0 12px 24px rgba(5, 10, 24, 0.2)";
                }}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={input}
                onFocus={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = "var(--accent)";
                  (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)";
                }}
                onBlur={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = "var(--border-default)";
                  (e.target as HTMLInputElement).style.boxShadow = "0 12px 24px rgba(5, 10, 24, 0.2)";
                }}
                required
              />
            </div>

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "9px",
                  background: "var(--danger-soft-bg)",
                  border: "1px solid var(--danger-soft-border)",
                  fontSize: "13px",
                  color: "var(--danger)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "12px",
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--accent) 82%, #fff 18%), var(--accent-2))",
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
                marginTop: "4px",
                boxShadow: "0 16px 34px color-mix(in srgb, var(--accent) 32%, transparent)",
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: "18px", fontSize: "12px", color: "var(--text-subtle)" }}>
            Not an admin?{" "}
            <a href="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
              Back to platform login
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
