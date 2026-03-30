"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Loader2, QrCode, RefreshCcw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { fetchTodayPresence, getCurrentQRCode, type QRCurrent, type TodayPresence } from "@/lib/attendance";

const pageStyle = {
  minHeight: "100vh",
  background: "radial-gradient(circle at top, rgba(124, 106, 255, 0.18), transparent 45%), #080808",
  color: "#f0f0f5",
  padding: "24px",
} as const;

const shellStyle = {
  maxWidth: "1200px",
  margin: "0 auto",
  background: "rgba(13, 13, 13, 0.92)",
  border: "1px solid #1c1c1c",
  borderRadius: "28px",
  minHeight: "calc(100vh - 48px)",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  overflow: "hidden",
  boxShadow: "0 30px 120px rgba(0,0,0,0.45)",
} as const;

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

function AttendanceDisplayPageContent() {
  const searchParams = useSearchParams();
  const locationId = Number(searchParams.get("location_id") || 0) || undefined;
  const [now, setNow] = useState(() => new Date());
  const [qr, setQr] = useState<QRCurrent | null>(null);
  const [stats, setStats] = useState<TodayPresence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const secondsRemaining = useMemo(() => {
    if (!qr?.expires_at) return 0;
    const delta = Math.max(0, Math.floor((new Date(qr.expires_at).getTime() - now.getTime()) / 1000));
    return delta;
  }, [now, qr?.expires_at]);

  const fetchDisplayData = async () => {
    try {
      const [qrRow, today] = await Promise.all([getCurrentQRCode(locationId), fetchTodayPresence()]);
      setQr(qrRow);
      setStats(today);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to attendance display services.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDisplayData();
  }, [locationId]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const qrTimer = window.setInterval(() => {
      void getCurrentQRCode(locationId)
        .then((payload) => {
          setQr(payload);
          setError(null);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Could not refresh QR token.");
        });
    }, 25000);
    return () => window.clearInterval(qrTimer);
  }, [locationId]);

  useEffect(() => {
    const statsTimer = window.setInterval(() => {
      void fetchTodayPresence()
        .then((payload) => {
          setStats(payload);
          setError(null);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Could not refresh live attendance statistics.");
        });
    }, 30000);
    return () => window.clearInterval(statsTimer);
  }, []);

  useEffect(() => {
    if (secondsRemaining > 5 || locationId == null) return;
    void getCurrentQRCode(locationId)
      .then((payload) => setQr(payload))
      .catch(() => undefined);
  }, [locationId, secondsRemaining]);

  const progressPercent = qr?.seconds_remaining ? Math.max(0, Math.min(100, (secondsRemaining / qr.seconds_remaining) * 100)) : 0;

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "14px", padding: "22px 26px", borderBottom: "1px solid #1c1c1c", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "16px", background: "linear-gradient(135deg, #7c6aff 0%, #4f3de8 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800 }}>B</div>
            <div>
              <div style={{ fontSize: "14px", color: "#8b9bb7", letterSpacing: "0.08em", fontFamily: "monospace" }}>BENELA ATTENDANCE</div>
              <div style={{ fontSize: "28px", color: "#f0f0f5", fontWeight: 800 }}>{qr?.location_name || "Office entrance"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => void fetchDisplayData()} style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "12px", border: "1px solid #2a2a2a", background: "#101010", color: "#e5e7eb", cursor: "pointer" }}>
              <RefreshCcw size={14} /> Refresh
            </button>
            <button type="button" onClick={() => window.open("/hr", "_blank", "noopener,noreferrer")} style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "12px", border: "1px solid #2a2a2a", background: "#101010", color: "#e5e7eb", cursor: "pointer" }}>
              <ExternalLink size={14} /> HR dashboard
            </button>
            <div style={{ minWidth: "120px", textAlign: "right" }}>
              <div style={{ fontSize: "14px", color: "#8b9bb7", letterSpacing: "0.08em", fontFamily: "monospace" }}>LOCAL TIME</div>
              <div style={{ fontSize: "28px", color: "#f0f0f5", fontWeight: 800 }}>{formatClock(now)}</div>
            </div>
          </div>
        </header>

        <section style={{ display: "grid", alignItems: "center", justifyItems: "center", padding: "36px 24px", gap: "20px" }}>
          {loading ? (
            <div style={{ display: "grid", gap: "12px", justifyItems: "center" }}>
              <Loader2 size={40} color="#7c6aff" style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ fontSize: "16px", color: "#9ca3af" }}>Connecting to attendance services...</div>
            </div>
          ) : qr ? (
            <>
              <div style={{ position: "relative", width: "min(72vw, 420px)", height: "min(72vw, 420px)", display: "grid", placeItems: "center" }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: "absolute", inset: 0 }}>
                  <circle cx="50" cy="50" r="46" stroke="rgba(124, 106, 255, 0.12)" strokeWidth="4" fill="none" />
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    stroke="#7c6aff"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={289.03}
                    strokeDashoffset={289.03 - (289.03 * progressPercent) / 100}
                    transform="rotate(-90 50 50)"
                    style={{ transition: "stroke-dashoffset 0.4s ease" }}
                  />
                </svg>
                <div style={{ width: "78%", height: "78%", borderRadius: "28px", background: "white", display: "grid", placeItems: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
                  <QRCodeSVG value={qr.scan_url} size={320} bgColor="transparent" fgColor="#151515" includeMargin />
                </div>
              </div>
              <div style={{ textAlign: "center", display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "34px", color: "#f0f0f5", fontWeight: 800 }}>Scan to Clock In / Clock Out</div>
                <div style={{ fontSize: "16px", color: "#a7b0c0" }}>Refresh window: {secondsRemaining}s remaining</div>
              </div>
              <div style={{ width: "min(760px, 88vw)", height: "18px", borderRadius: "999px", background: "rgba(255,255,255,0.06)", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ width: `${progressPercent}%`, height: "100%", borderRadius: "999px", background: "linear-gradient(90deg, #7c6aff 0%, #4f3de8 100%)", transition: "width 0.8s linear" }} />
              </div>
              {error ? <div style={{ fontSize: "14px", color: "#fbbf24" }}>{error}</div> : null}
            </>
          ) : (
            <div style={{ display: "grid", gap: "12px", justifyItems: "center" }}>
              <QrCode size={40} color="#7c6aff" />
              <div style={{ fontSize: "16px", color: "#9ca3af" }}>No QR token available yet.</div>
            </div>
          )}
        </section>

        <footer style={{ borderTop: "1px solid #1c1c1c", padding: "18px 26px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px" }}>
          {[
            { label: "In Office", value: stats?.present_count ?? 0, tone: "#34d399" },
            { label: "Late", value: stats?.late_arrivals.length ?? 0, tone: "#fbbf24" },
            { label: "Absent", value: stats?.not_arrived.length ?? 0, tone: "#f87171" },
          ].map((item) => (
            <button key={item.label} type="button" onClick={() => window.open("/hr", "_blank", "noopener,noreferrer")} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "18px", padding: "18px 16px", color: "inherit", cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontSize: "13px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{item.label}</div>
              <div style={{ fontSize: "32px", color: item.tone, fontWeight: 800, marginTop: "10px" }}>{item.value}</div>
            </button>
          ))}
        </footer>
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

export default function AttendanceDisplayPage() {
  return (
    <Suspense fallback={<main style={pageStyle}><div style={{ ...shellStyle, minHeight: "320px", display: "grid", placeItems: "center", color: "#9ca3af" }}>Loading attendance display...</div></main>}>
      <AttendanceDisplayPageContent />
    </Suspense>
  );
}
