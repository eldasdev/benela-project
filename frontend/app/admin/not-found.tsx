import Link from "next/link";
import { ArrowLeft, ShieldAlert, LayoutDashboard } from "lucide-react";

export default function AdminNotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px",
        background: "var(--bg-canvas)",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "720px",
          borderRadius: "24px",
          border: "1px solid var(--border-default)",
          background:
            "linear-gradient(155deg, color-mix(in srgb, var(--bg-panel) 86%, var(--accent-soft) 14%), color-mix(in srgb, var(--bg-surface) 94%, transparent))",
          boxShadow: "0 30px 70px rgba(8, 14, 28, 0.28)",
          padding: "36px",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "999px",
            border: "1px solid color-mix(in srgb, var(--accent) 24%, var(--border-default) 76%)",
            background: "color-mix(in srgb, var(--accent-soft) 72%, transparent)",
            color: "var(--accent)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <ShieldAlert size={14} />
          Admin Route Not Found
        </div>

        <h1
          style={{
            marginTop: "18px",
            fontSize: "clamp(30px, 4vw, 42px)",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
          }}
        >
          This admin page does not exist.
        </h1>
        <p
          style={{
            marginTop: "12px",
            maxWidth: "560px",
            fontSize: "15px",
            lineHeight: 1.7,
            color: "var(--text-subtle)",
          }}
        >
          Stay inside the control center. Use the admin dashboard to continue platform operations
          or return to admin sign-in if the session changed.
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "28px" }}>
          <Link
            href="/admin/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 16px",
              borderRadius: "14px",
              textDecoration: "none",
              fontWeight: 600,
              color: "white",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              boxShadow: "0 14px 34px color-mix(in srgb, var(--accent) 28%, transparent)",
            }}
          >
            <LayoutDashboard size={16} />
            Open Admin Dashboard
          </Link>
          <Link
            href="/admin/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 16px",
              borderRadius: "14px",
              textDecoration: "none",
              fontWeight: 600,
              color: "var(--text-primary)",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
            }}
          >
            <ArrowLeft size={16} />
            Admin Sign In
          </Link>
        </div>
      </section>
    </main>
  );
}
