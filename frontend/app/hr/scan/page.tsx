"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { submitAttendanceScan, verifyAttendanceSession, type ScanResult, type VerifySession } from "@/lib/attendance";

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #f6f9ff 0%, #eef4ff 100%)",
  color: "#111827",
  padding: "20px 16px 28px",
} as const;

const cardStyle = {
  maxWidth: "420px",
  margin: "0 auto",
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(124, 106, 255, 0.18)",
  borderRadius: "24px",
  boxShadow: "0 20px 70px rgba(73, 106, 214, 0.14)",
  overflow: "hidden",
} as const;

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "14px",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  background: "rgba(248, 250, 252, 0.92)",
  color: "#111827",
  fontSize: "15px",
  outline: "none",
  fontFamily: "inherit",
} as const;

const buttonStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: "16px",
  border: "none",
  background: "linear-gradient(135deg, #7c6aff 0%, #4f46e5 100%)",
  color: "white",
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
} as const;

function formatClockMessage(action: string) {
  return action === "clock_out" ? { title: "Clock out", color: "#f87171" } : { title: "Clock in", color: "#34d399" };
}

async function buildDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "server";
  const source = [
    navigator.userAgent || "ua",
    navigator.language || "lang",
    navigator.platform || "platform",
    window.screen?.width || 0,
    window.screen?.height || 0,
    window.devicePixelRatio || 1,
  ].join("|");
  if (window.crypto?.subtle) {
    const buffer = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    return Array.from(new Uint8Array(buffer)).map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  return btoa(source).replace(/=+$/g, "");
}

function requestGeolocation(): Promise<{ latitude?: number; longitude?: number }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      resolve({});
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 3_000 },
    );
  });
}

function ScanPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t") || "";
  const attendanceAccessToken = searchParams.get("a") || "";
  const [verification, setVerification] = useState<VerifySession | null>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const actionMeta = useMemo(() => formatClockMessage(verification?.action || result?.action || "clock_in"), [result?.action, verification?.action]);

  useEffect(() => {
    let active = true;
    void buildDeviceFingerprint().then((value) => {
      if (active) setFingerprint(value);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setError("QR token is missing.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void verifyAttendanceSession(token, attendanceAccessToken || undefined)
      .then((payload) => {
        if (!cancelled) setVerification(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not verify this QR code.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attendanceAccessToken, token]);

  useEffect(() => {
    if (!result) return;
    const handle = window.setTimeout(() => {
      if (window.history.length > 1) {
        window.history.back();
      }
    }, 4000);
    return () => window.clearTimeout(handle);
  }, [result]);

  const submitScan = async () => {
    if (!token) return;
    if (!verification?.authenticated && pin.trim().length < 4) {
      setError("Enter your employee PIN.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const geo = await requestGeolocation();
      const response = await submitAttendanceScan({
        token,
        attendance_access_token: attendanceAccessToken || undefined,
        employee_pin: verification?.authenticated ? undefined : pin.trim(),
        device_fingerprint: fingerprint || "unknown-device",
        latitude: geo.latitude,
        longitude: geo.longitude,
        notes: note.trim() || undefined,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record attendance.");
    } finally {
      setSubmitting(false);
    }
  };

  const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "submit"];

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "420px", margin: "0 auto 18px", display: "flex", alignItems: "center", gap: "10px", color: "#1f2a44", fontWeight: 700, letterSpacing: "0.04em" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: "linear-gradient(135deg, #7c6aff 0%, #4f46e5 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px" }}>B</div>
        <div>
          <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>BENELA</div>
          <div style={{ fontSize: "20px", color: "#111827" }}>Attendance scan</div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(148, 163, 184, 0.18)" }}>
          <div style={{ fontSize: "24px", color: "#111827", fontWeight: 800 }}>{actionMeta.title}</div>
          <div style={{ fontSize: "14px", color: "#64748b", marginTop: "6px" }}>Use this page to confirm a single attendance action. Messages are shown in Uzbek and Russian.</div>
        </div>
        <div style={{ padding: "20px", display: "grid", gap: "16px" }}>
          {loading ? (
            <div style={{ display: "grid", justifyItems: "center", gap: "12px", padding: "16px 0" }}>
              <Loader2 size={32} color="#4f46e5" style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ fontSize: "14px", color: "#64748b", textAlign: "center" }}>Checking QR validity and employee session...</div>
            </div>
          ) : error ? (
            <div style={{ padding: "16px", borderRadius: "18px", background: "rgba(248, 113, 113, 0.08)", border: "1px solid rgba(248, 113, 113, 0.22)", display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#ef4444", fontSize: "17px", fontWeight: 700 }}>
                <ShieldAlert size={20} /> Attendance could not be confirmed
              </div>
              <div style={{ fontSize: "14px", color: "#7f1d1d", lineHeight: 1.6 }}>{error}</div>
            </div>
          ) : result ? (
            <div style={{ display: "grid", gap: "14px", justifyItems: "center", textAlign: "center", padding: "8px 0 14px" }}>
              <div style={{ width: "92px", height: "92px", borderRadius: "999px", background: "rgba(52, 211, 153, 0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={44} color="#10b981" />
              </div>
              <div>
                <div style={{ fontSize: "26px", color: "#111827", fontWeight: 800 }}>{result.action === "clock_out" ? "Clock out recorded" : "Clock in recorded"}</div>
                <div style={{ fontSize: "15px", color: "#475569", marginTop: "8px", lineHeight: 1.7 }}>{result.message}</div>
                <div style={{ fontSize: "15px", color: "#475569", marginTop: "4px", lineHeight: 1.7 }}>{result.message_ru}</div>
              </div>
              <div style={{ width: "100%", padding: "14px 16px", borderRadius: "18px", background: "rgba(79, 70, 229, 0.06)", border: "1px solid rgba(79, 70, 229, 0.12)", display: "grid", gap: "6px", textAlign: "left" }}>
                <div style={{ fontSize: "15px", color: "#111827", fontWeight: 700 }}>{result.employee_name}</div>
                <div style={{ fontSize: "14px", color: "#475569" }}>Time: {result.time}</div>
                <div style={{ fontSize: "14px", color: actionMeta.color }}>Status: {result.status.replace(/_/g, " ")}</div>
                {result.hours_worked != null ? <div style={{ fontSize: "14px", color: "#475569" }}>Worked: {result.hours_worked.toFixed(1)}h</div> : null}
                {result.warnings.length ? <div style={{ fontSize: "13px", color: "#b45309" }}>{result.warnings.join(" • ")}</div> : null}
              </div>
              <button type="button" style={buttonStyle} onClick={() => window.history.back()}>Done</button>
            </div>
          ) : (
            <>
              <div style={{ padding: "16px", borderRadius: "18px", background: `${actionMeta.color}10`, border: `1px solid ${actionMeta.color}30`, display: "grid", gap: "6px" }}>
                <div style={{ fontSize: "18px", color: "#111827", fontWeight: 700 }}>{verification?.employee_name || "Employee verification required"}</div>
                <div style={{ fontSize: "14px", color: "#475569" }}>{verification?.employee_role || "Enter PIN to continue"}</div>
                <div style={{ fontSize: "14px", color: actionMeta.color, fontWeight: 700 }}>{verification?.action === "clock_out" ? "🟥 Clock out" : "🟢 Clock in"}</div>
                {verification?.location_name ? <div style={{ fontSize: "13px", color: "#64748b" }}>{verification.location_name}</div> : null}
              </div>

              {!verification?.authenticated ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div style={{ fontSize: "14px", color: "#64748b", textAlign: "center" }}>Enter your employee PIN to confirm attendance.</div>
                  <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                    {Array.from({ length: Math.max(pin.length, 4) }).map((_, index) => (
                      <div key={index} style={{ width: "16px", height: "16px", borderRadius: "999px", background: index < pin.length ? "#4f46e5" : "rgba(148, 163, 184, 0.25)" }} />
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
                    {keypad.map((key) => (
                      <button
                        key={key}
                        type="button"
                        style={{
                          height: "72px",
                          borderRadius: "22px",
                          border: key === "submit" ? "none" : "1px solid rgba(148, 163, 184, 0.2)",
                          background: key === "submit" ? "linear-gradient(135deg, #7c6aff 0%, #4f46e5 100%)" : "rgba(248, 250, 252, 0.95)",
                          color: key === "submit" ? "white" : "#111827",
                          fontSize: key === "clear" ? "13px" : "24px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          if (key === "clear") {
                            setPin((current) => current.slice(0, -1));
                            return;
                          }
                          if (key === "submit") {
                            void submitScan();
                            return;
                          }
                          if (pin.length >= 6) return;
                          setPin((current) => `${current}${key}`);
                        }}
                      >
                        {key === "submit" ? "Go" : key === "clear" ? "Clear" : key}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "grid", gap: "10px" }}>
                <button type="button" onClick={() => setShowNote((current) => !current)} style={{ border: "none", background: "transparent", color: "#4f46e5", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: 0, textAlign: "left" }}>
                  {showNote ? "Hide note" : "Add a note (optional)"}
                </button>
                {showNote ? (
                  <textarea style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Short note about this scan" />
                ) : null}
              </div>

              <button type="button" style={{ ...buttonStyle, opacity: submitting ? 0.7 : 1 }} disabled={submitting} onClick={() => void submitScan()}>
                {submitting ? "Submitting..." : verification?.action === "clock_out" ? "Confirm clock out" : "Confirm clock in"}
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<main style={pageStyle}><div style={{ ...cardStyle, maxWidth: "420px", margin: "40px auto 0", padding: "24px", textAlign: "center", color: "#64748b" }}>Loading attendance scan...</div></main>}>
      <ScanPageContent />
    </Suspense>
  );
}
