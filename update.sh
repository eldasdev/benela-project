#!/bin/bash
# Benela AI — Auto-update script
# Run this from your project root: ~/Desktop/benela-ai
# Usage: bash update.sh

set -e
echo "🚀 Updating Benela AI project files..."

# ─── base_agent.py ────────────────────────────────────────────────────────────
cat > backend/agents/base_agent.py << 'EOF'
import ssl
import certifi
import urllib.request
import urllib.error
import json
from core.config import settings


class BaseAgent:
    """
    Every Benela AI agent inherits from this.
    Calls Anthropic Claude API directly — no heavy dependencies needed.
    """

    def __init__(self, name: str, system_prompt: str):
        self.name = name
        self.system_prompt = system_prompt
        self.api_key = settings.ANTHROPIC_API_KEY
        self.api_url = "https://api.anthropic.com/v1/messages"

    def run(self, user_message: str) -> str:
        """Send a message to Claude and get a response."""

        payload = {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 1024,
            "system": self.system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_message
                }
            ]
        }

        data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(
            self.api_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01"
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(
                req,
                context=ssl.create_default_context(cafile=certifi.where())
            ) as response:
                result = json.loads(response.read().decode("utf-8"))
                return result["content"][0]["text"]

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            raise Exception(f"Claude API error {e.code}: {error_body}")
EOF
echo "✅ backend/agents/base_agent.py"

# ─── lib/supabase.ts ──────────────────────────────────────────────────────────
cat > frontend/lib/supabase.ts << 'EOF'
import { createBrowserClient } from "@supabase/ssr";

export function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
EOF
echo "✅ frontend/lib/supabase.ts"

# ─── types/index.ts ───────────────────────────────────────────────────────────
cat > frontend/types/index.ts << 'EOF'
export type Section =
  | "dashboard"
  | "projects"
  | "finance"
  | "hr"
  | "sales"
  | "support"
  | "legal"
  | "marketing"
  | "supply_chain"
  | "procurement"
  | "insights";
EOF
echo "✅ frontend/types/index.ts"

# ─── app/dashboard/page.tsx ───────────────────────────────────────────────────
cat > frontend/app/dashboard/page.tsx << 'EOF'
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import AIPanel from "@/components/AIPanel";
import { Section } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/login");
      else setLoading(false);
    });
  }, []);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#080808" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: "32px", height: "32px", borderRadius: "50%",
        border: "2px solid #1c1c1c", borderTopColor: "#7c6aff",
        animation: "spin 0.8s linear infinite"
      }} />
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#080808" }}>
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Dashboard
          activeSection={activeSection}
          aiPanelOpen={aiPanelOpen}
          onToggleAI={() => setAiPanelOpen(o => !o)}
        />
      </div>
      <AIPanel isOpen={aiPanelOpen} section={activeSection} onClose={() => setAiPanelOpen(false)} />
    </div>
  );
}
EOF
echo "✅ frontend/app/dashboard/page.tsx"

# ─── app/(marketing)/login/page.tsx ──────────────────────────────────────────
cat > "frontend/app/(marketing)/login/page.tsx" << 'EOF'
"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else router.push("/dashboard");
  };

  const handleGoogle = async () => {
    await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  };

  const input: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: "10px",
    background: "#0d0d0d", border: "1px solid #222",
    color: "#f0f0f5", fontSize: "14px", outline: "none",
    fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: "600px", height: "400px", background: "radial-gradient(ellipse, rgba(124,106,255,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ width: "100%", maxWidth: "400px", position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(124,106,255,0.3)" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <polygon points="9,2 16,6 16,12 9,16 2,12 2,6" stroke="white" strokeWidth="1.5" fill="none"/>
                <path d="M9 5 L12 9 L9 13 L6 9 Z" stroke="white" strokeWidth="1.5" fill="none"/>
                <circle cx="9" cy="9" r="1.5" fill="white"/>
              </svg>
            </div>
            <span style={{ fontSize: "22px", fontWeight: 700, color: "#f0f0f5", letterSpacing: "1px" }}>BENELA</span>
          </div>
          <p style={{ fontSize: "13px", color: "#444" }}>Sign in to your workspace</p>
        </div>
        <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "20px", padding: "32px" }}>
          <button onClick={handleGoogle}
            style={{ width: "100%", padding: "11px", borderRadius: "10px", background: "#111", border: "1px solid #222", color: "#ccc", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "24px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <div style={{ flex: 1, height: "1px", background: "#1c1c1c" }} />
            <span style={{ fontSize: "12px", color: "#333" }}>or</span>
            <div style={{ flex: 1, height: "1px", background: "#1c1c1c" }} />
          </div>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "#555", marginBottom: "6px", display: "block" }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={input}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "#7c6aff"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "#222"} required />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ fontSize: "12px", color: "#555" }}>Password</label>
                <Link href="/forgot-password" style={{ fontSize: "12px", color: "#7c6aff", textDecoration: "none" }}>Forgot?</Link>
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={input}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "#7c6aff"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "#222"} required />
            </div>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: "9px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", fontSize: "13px", color: "#f87171" }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: "12px", borderRadius: "10px", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", border: "none", color: "white", fontSize: "14px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "4px" }}>
              {loading ? <><Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> Signing in...</> : "Sign in"}
            </button>
          </form>
        </div>
        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#444" }}>
          Don't have an account?{" "}
          <Link href="/signup" style={{ color: "#7c6aff", textDecoration: "none", fontWeight: 500 }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
EOF
echo "✅ frontend/app/(marketing)/login/page.tsx"

# ─── app/(marketing)/signup/page.tsx ─────────────────────────────────────────
cat > "frontend/app/(marketing)/signup/page.tsx" << 'EOF'
"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { Loader2, CheckCircle } from "lucide-react";

export default function SignupPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [done, setDone]         = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const sb = getSupabase();
    const { error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: name } },
    });
    if (error) { setError(error.message); setLoading(false); }
    else setDone(true);
  };

  const handleGoogle = async () => {
    await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  };

  const input: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: "10px",
    background: "#0d0d0d", border: "1px solid #222",
    color: "#f0f0f5", fontSize: "14px", outline: "none",
    fontFamily: "inherit", boxSizing: "border-box",
  };

  if (done) return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: "400px", padding: "24px" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <CheckCircle size={24} color="#34d399" />
        </div>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#f0f0f5", marginBottom: "8px" }}>Check your email</h2>
        <p style={{ fontSize: "14px", color: "#555", lineHeight: 1.6 }}>
          We sent a confirmation link to <strong style={{ color: "#888" }}>{email}</strong>. Click it to activate your account.
        </p>
        <Link href="/login" style={{ display: "inline-block", marginTop: "24px", fontSize: "13px", color: "#7c6aff", textDecoration: "none" }}>
          Back to login →
        </Link>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: "600px", height: "400px", background: "radial-gradient(ellipse, rgba(124,106,255,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ width: "100%", maxWidth: "400px", position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(124,106,255,0.3)" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <polygon points="9,2 16,6 16,12 9,16 2,12 2,6" stroke="white" strokeWidth="1.5" fill="none"/>
                <path d="M9 5 L12 9 L9 13 L6 9 Z" stroke="white" strokeWidth="1.5" fill="none"/>
                <circle cx="9" cy="9" r="1.5" fill="white"/>
              </svg>
            </div>
            <span style={{ fontSize: "22px", fontWeight: 700, color: "#f0f0f5", letterSpacing: "1px" }}>BENELA</span>
          </div>
          <p style={{ fontSize: "13px", color: "#444" }}>Create your workspace</p>
        </div>
        <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "20px", padding: "32px" }}>
          <button onClick={handleGoogle}
            style={{ width: "100%", padding: "11px", borderRadius: "10px", background: "#111", border: "1px solid #222", color: "#ccc", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "24px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <div style={{ flex: 1, height: "1px", background: "#1c1c1c" }} />
            <span style={{ fontSize: "12px", color: "#333" }}>or</span>
            <div style={{ flex: 1, height: "1px", background: "#1c1c1c" }} />
          </div>
          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "#555", marginBottom: "6px", display: "block" }}>Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" style={input}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "#7c6aff"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "#222"} required />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "#555", marginBottom: "6px", display: "block" }}>Work Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={input}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "#7c6aff"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "#222"} required />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "#555", marginBottom: "6px", display: "block" }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" style={input}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "#7c6aff"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "#222"} minLength={8} required />
            </div>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: "9px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", fontSize: "13px", color: "#f87171" }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: "12px", borderRadius: "10px", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", border: "none", color: "white", fontSize: "14px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "4px" }}>
              {loading ? <><Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> Creating account...</> : "Create account"}
            </button>
          </form>
        </div>
        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#444" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#7c6aff", textDecoration: "none", fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
EOF
echo "✅ frontend/app/(marketing)/signup/page.tsx"

# ─── Dockerfile ───────────────────────────────────────────────────────────────
cat > frontend/Dockerfile << 'EOF'
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
EOF
echo "✅ frontend/Dockerfile"

# ─── Commit and push ──────────────────────────────────────────────────────────
echo ""
echo "📦 Committing and pushing all changes..."
git add .
git commit -m "Apply all accumulated updates — Claude API, auth fixes, Dockerfile, types"
git push

echo ""
echo "✅ All done! DigitalOcean will auto-deploy now."
