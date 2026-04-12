"use client";

import { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

export default function FacebookOAuthCallbackPage() {
  const [message, setMessage] = useState("Completing Facebook connection…");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error_description") || params.get("error");

      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          {
            type: "facebook_oauth_code",
            code,
            state,
            error,
          },
          window.location.origin,
        );
        setMessage(
          error
            ? "Facebook authorization failed. You can close this window."
            : "Connected! You can close this window.",
        );
        setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
        }, 600);
      } else {
        setMessage(
          error
            ? `Facebook returned an error: ${error}. Please close this window and try again.`
            : "Popup opener not found. Please close this window and return to the app.",
        );
      }
    } catch (err: any) {
      setMessage(`Unexpected error: ${err?.message || "unknown"}`);
    }
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-surface, #0b0f17)",
        color: "var(--text-primary, #e6e8ee)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "420px",
          textAlign: "center",
          border: "1px solid var(--border-default, #1f2937)",
          borderRadius: "14px",
          padding: "28px 24px",
          background: "var(--bg-panel, #111827)",
        }}
      >
        <div
          style={{
            width: "46px",
            height: "46px",
            borderRadius: "10px",
            margin: "0 auto 16px",
            background: "linear-gradient(135deg, #1877f2, #4267B2)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "18px",
          }}
        >
          f
        </div>
        <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "8px" }}>Facebook Ads</div>
        <div style={{ fontSize: "13px", color: "var(--text-subtle, #9aa3b2)" }}>{message}</div>
      </div>
    </div>
  );
}
