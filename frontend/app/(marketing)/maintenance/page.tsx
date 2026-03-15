"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Clock3, ShieldCheck, Wrench } from "lucide-react";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

type RuntimeStatus = {
  platform_name: string;
  support_email?: string | null;
  status_page_url?: string | null;
  maintenance_mode: boolean;
  updated_at: string;
};

export default function MaintenancePage() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`${API}/platform/runtime`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as RuntimeStatus;
        if (!cancelled) setRuntime(payload);
      } catch {
        // Keep static fallback copy when runtime metadata is unavailable.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const platformName = runtime?.platform_name || "Benela AI";

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(900px 500px at 10% 10%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%), radial-gradient(1000px 560px at 100% 0%, color-mix(in srgb, var(--accent-soft) 60%, transparent), transparent 62%), var(--bg-canvas)",
        color: "var(--text-primary)",
        display: "grid",
        placeItems: "center",
        padding: "28px",
      }}
    >
      <section
        style={{
          width: "min(920px, 100%)",
          borderRadius: "32px",
          border: "1px solid color-mix(in srgb, var(--border-default) 88%, transparent)",
          background: "color-mix(in srgb, var(--bg-surface) 96%, white 4%)",
          boxShadow: "0 32px 90px rgba(10, 20, 36, 0.18)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "28px 30px 18px",
            borderBottom: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 72%, transparent), color-mix(in srgb, var(--bg-panel) 90%, transparent))",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 14px",
              borderRadius: "999px",
              border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
              background: "color-mix(in srgb, var(--danger) 10%, transparent)",
              color: "var(--danger)",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <Wrench size={14} />
            Maintenance mode
          </div>
          <h1 style={{ margin: "18px 0 0", fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1, letterSpacing: "-0.04em" }}>
            {platformName} is temporarily unavailable
          </h1>
          <p style={{ margin: "18px 0 0", maxWidth: "700px", fontSize: "18px", lineHeight: 1.8, color: "var(--text-subtle)" }}>
            The platform is in restricted operations while maintenance is being completed. Client workspaces, dashboards, and
            module actions are paused until the service window is closed.
          </p>
        </div>

        <div style={{ padding: "28px 30px 30px", display: "grid", gap: "22px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "14px",
            }}
          >
            <StatusCard
              icon={<Clock3 size={18} />}
              title="Status"
              body="The system is intentionally restricted. Try again after the maintenance window ends."
            />
            <StatusCard
              icon={<ShieldCheck size={18} />}
              title="Admin access"
              body="Super-admin routes remain available so platform operations and recovery can continue."
            />
            <StatusCard
              icon={<AlertTriangle size={18} />}
              title="Client access"
              body="Client-facing routes and operational APIs are temporarily blocked to avoid inconsistent state."
            />
          </div>

          <div
            style={{
              display: "grid",
              gap: "10px",
              padding: "18px 20px",
              borderRadius: "20px",
              border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
              background: "color-mix(in srgb, var(--bg-panel) 94%, transparent)",
            }}
          >
            <div style={{ fontSize: "14px", fontWeight: 700 }}>Need operational updates?</div>
            <div style={{ fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.8 }}>
              {runtime?.support_email ? (
                <>
                  Contact support at{" "}
                  <a href={`mailto:${runtime.support_email}`} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                    {runtime.support_email}
                  </a>
                  .
                </>
              ) : (
                "Support contact details are temporarily unavailable."
              )}{" "}
              {runtime?.status_page_url ? (
                <>
                  Follow the live status page at{" "}
                  <a href={runtime.status_page_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                    {runtime.status_page_url}
                  </a>
                  .
                </>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <Link
              href="/admin/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "48px",
                padding: "0 18px",
                borderRadius: "14px",
                textDecoration: "none",
                fontWeight: 700,
                color: "var(--button-primary-text, #fff)",
                background: "var(--button-primary-bg, var(--accent))",
                boxShadow: "0 16px 34px color-mix(in srgb, var(--accent) 24%, transparent)",
              }}
            >
              Admin access
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "48px",
                padding: "0 18px",
                borderRadius: "14px",
                border: "1px solid color-mix(in srgb, var(--border-default) 86%, transparent)",
                background: "color-mix(in srgb, var(--bg-panel) 94%, transparent)",
                color: "var(--text-primary)",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Check again
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        padding: "18px",
        borderRadius: "20px",
        border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
        background: "color-mix(in srgb, var(--bg-panel) 95%, transparent)",
        display: "grid",
        gap: "10px",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "12px",
          display: "grid",
          placeItems: "center",
          color: "var(--accent)",
          background: "color-mix(in srgb, var(--accent-soft) 82%, transparent)",
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: "16px", fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.75 }}>{body}</div>
    </div>
  );
}
