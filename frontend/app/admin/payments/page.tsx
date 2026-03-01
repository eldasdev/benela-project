"use client";

import Link from "next/link";

export default function AdminPaymentsPage() {
  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f0f0f5", marginBottom: "8px" }}>
        Payments
      </h1>
      <p style={{ fontSize: "13px", color: "#555", marginBottom: "24px" }}>
        Payment history and invoices. Mark paid, retry, refund coming next.
      </p>
      <Link
        href="/admin/dashboard"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          borderRadius: "10px",
          background: "rgba(124,106,255,0.15)",
          color: "#a78bfa",
          textDecoration: "none",
          fontSize: "13px",
        }}
      >
        ← Back to Overview
      </Link>
    </div>
  );
}
