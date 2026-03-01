"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Loader2, Lock } from "lucide-react";

const input: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: "10px",
  background: "#0e0e14",
  border: "1px solid #1e1e2a",
  color: "#f0f0f5",
  fontSize: "14px",
  outline: "none",
  fontFamily: "inherit",
  transition: "border 0.15s",
  boxSizing: "border-box",
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
    if (role !== "admin") {
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
        background: "#060608",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "500px",
          height: "300px",
          background: "radial-gradient(ellipse, rgba(239,68,68,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ width: "100%", maxWidth: "400px", position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: "6px",
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.25)",
              fontSize: "10px",
              fontWeight: 700,
              color: "#ef4444",
              letterSpacing: "0.12em",
              marginBottom: "20px",
            }}
          >
            ADMIN PANEL
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 20px rgba(239,68,68,0.25)",
              }}
            >
              <Lock size={20} color="white" />
            </div>
            <span style={{ fontSize: "22px", fontWeight: 700, color: "#f0f0f5", letterSpacing: "0.5px" }}>
              Admin Access
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "#555" }}>Owner and super-admin only</p>
        </div>

        <div
          style={{
            background: "#0e0e14",
            border: "1px solid #1e1e2a",
            borderRadius: "16px",
            padding: "28px",
          }}
        >
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "#555", marginBottom: "6px", display: "block" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@benela.dev"
                style={input}
                onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = "#ef4444")}
                onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = "#1e1e2a")}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "#555", marginBottom: "6px", display: "block" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={input}
                onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = "#ef4444")}
                onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = "#1e1e2a")}
                required
              />
            </div>

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "9px",
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  fontSize: "13px",
                  color: "#f87171",
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
                borderRadius: "10px",
                background: "linear-gradient(135deg, #ef4444, #b91c1c)",
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
        </div>

        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "12px", color: "#444" }}>
          Not an admin?{" "}
          <a href="/login" style={{ color: "#7c6aff", textDecoration: "none" }}>
            Back to platform login
          </a>
        </p>
      </div>
    </div>
  );
}
