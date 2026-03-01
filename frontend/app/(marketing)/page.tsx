"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Sparkles, BarChart3, Users, ShieldCheck, Zap, Globe, ChevronRight, Check } from "lucide-react";

const NAV_LINKS = ["Features", "Pricing", "About"];

const FEATURES = [
  { icon: Sparkles, title: "AI Copilot in Every Module", desc: "Context-aware AI assistant embedded in Finance, HR, Sales and every other module. Ask questions, get insights, take action.", color: "#7c6aff" },
  { icon: BarChart3, title: "Real-Time Analytics", desc: "Live dashboards pulling from your actual data. No more spreadsheets or manual reports.", color: "#34d399" },
  { icon: Users, title: "HR & People Management", desc: "Employees, positions, departments — all in one place with full CRUD operations.", color: "#60a5fa" },
  { icon: ShieldCheck, title: "Enterprise Security", desc: "SOC2 compliant, end-to-end encryption, role-based access control and full audit logs.", color: "#f59e0b" },
  { icon: Zap, title: "Instant Automation", desc: "AI agents handle repetitive tasks across modules automatically. Set rules, let AI execute.", color: "#f87171" },
  { icon: Globe, title: "Multi-Region Deployment", desc: "Deploy in the region closest to your team. GDPR compliant. Data never leaves your region.", color: "#a78bfa" },
];

const PRICING = [
  {
    name: "Starter", price: "$49", period: "/mo",
    desc: "Perfect for small teams just getting started",
    features: ["Up to 10 users", "Finance + HR modules", "AI Copilot (100 queries/mo)", "Email support"],
    cta: "Start free trial", highlight: false,
  },
  {
    name: "Pro", price: "$149", period: "/mo",
    desc: "For growing companies that need more power",
    features: ["Up to 50 users", "All 9 modules", "AI Copilot (unlimited)", "Priority support", "Custom integrations", "Advanced analytics"],
    cta: "Start free trial", highlight: true,
  },
  {
    name: "Enterprise", price: "Custom", period: "",
    desc: "Tailored for large organizations",
    features: ["Unlimited users", "All modules + custom", "Dedicated AI model", "24/7 support + SLA", "On-premise option", "SSO + SCIM"],
    cta: "Contact sales", highlight: false,
  },
];

const TESTIMONIALS = [
  { name: "Sarah Chen", role: "CFO at Acme Corp", text: "Benela replaced three separate tools for us. The AI assistant in the Finance module alone saves our team 4 hours a week.", avatar: "SC" },
  { name: "Marcus Johnson", role: "VP Sales at TechStart", text: "The sales pipeline view with AI deal scoring changed how our team prioritizes. Win rate up 23% in 3 months.", avatar: "MJ" },
  { name: "Priya Sharma", role: "Head of HR at GlobalCo", text: "Onboarding new employees used to take days. With Benela AI it takes 20 minutes. The automation is incredible.", avatar: "PS" },
];

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div style={{ background: "#080808", color: "#f0f0f5", fontFamily: "system-ui, -apple-system, sans-serif", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(8,8,8,0.8)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 16px rgba(124,106,255,0.3)" }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <polygon points="9,2 16,6 16,12 9,16 2,12 2,6" stroke="white" strokeWidth="1.5" fill="none"/>
              <path d="M9 5 L12 9 L9 13 L6 9 Z" stroke="white" strokeWidth="1.5" fill="none"/>
              <circle cx="9" cy="9" r="1.5" fill="white"/>
            </svg>
          </div>
          <span style={{ fontSize: "17px", fontWeight: 700, color: "#f0f0f5", letterSpacing: "1px" }}>BENELA</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          {NAV_LINKS.map(link => (
            <a key={link} href={`#${link.toLowerCase()}`} style={{ fontSize: "14px", color: "#555", textDecoration: "none", transition: "color 0.15s" }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = "#f0f0f5"}
              onMouseLeave={e => (e.target as HTMLElement).style.color = "#555"}>
              {link}
            </a>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link href="/login" style={{ padding: "8px 18px", borderRadius: "9px", background: "transparent", border: "1px solid #222", color: "#888", fontSize: "14px", textDecoration: "none", transition: "all 0.15s" }}>
            Sign in
          </Link>
          <Link href="/signup" style={{ padding: "8px 18px", borderRadius: "9px", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", border: "none", color: "white", fontSize: "14px", fontWeight: 500, textDecoration: "none", boxShadow: "0 0 20px rgba(124,106,255,0.25)" }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: "160px", paddingBottom: "100px", textAlign: "center", position: "relative", overflow: "hidden", padding: "160px 24px 100px" }}>
        {/* Glow */}
        <div style={{ position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)", width: "800px", height: "600px", background: "radial-gradient(ellipse, rgba(124,106,255,0.08) 0%, transparent 65%)", pointerEvents: "none" }} />

        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 14px", borderRadius: "99px", background: "rgba(124,106,255,0.08)", border: "1px solid rgba(124,106,255,0.2)", fontSize: "12px", color: "#a89aff", marginBottom: "32px" }}>
          <Sparkles size={12} />
          AI-Native Enterprise ERP — Now in Beta
          <ChevronRight size={12} />
        </div>

        <h1 style={{ fontSize: "clamp(40px, 6vw, 72px)", fontWeight: 800, lineHeight: 1.1, marginBottom: "24px", maxWidth: "900px", margin: "0 auto 24px", letterSpacing: "-1px" }}>
          The ERP built for the
          <span style={{ background: "linear-gradient(135deg, #7c6aff, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", display: "block" }}>
            AI era
          </span>
        </h1>

        <p style={{ fontSize: "18px", color: "#555", maxWidth: "600px", margin: "0 auto 48px", lineHeight: 1.7 }}>
          Finance, HR, Sales, and 6 more modules — all with an AI copilot that understands your business data and helps you move faster.
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", flexWrap: "wrap" }}>
          <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "14px 28px", borderRadius: "12px", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", color: "white", fontSize: "15px", fontWeight: 600, textDecoration: "none", boxShadow: "0 0 30px rgba(124,106,255,0.35)" }}>
            Start free trial <ArrowRight size={16} />
          </Link>
          <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "14px 28px", borderRadius: "12px", background: "transparent", border: "1px solid #222", color: "#888", fontSize: "15px", textDecoration: "none" }}>
            Sign in →
          </Link>
        </div>

        <p style={{ fontSize: "12px", color: "#333", marginTop: "20px" }}>No credit card required · 14-day free trial</p>

        {/* Dashboard screenshot */}
        <div style={{ maxWidth: "1200px", margin: "80px auto 0", borderRadius: "20px", overflow: "hidden", boxShadow: "0 40px 100px rgba(124,106,255,0.15), 0 20px 60px rgba(0,0,0,0.5)", border: "1px solid rgba(124,106,255,0.2)" }}>
          <img src="/dashboard-screenshot.png" alt="Benela AI Dashboard" style={{ width: "100%", height: "auto", display: "block" }} />
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: "100px 40px", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <div style={{ fontSize: "12px", color: "#7c6aff", letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: "12px" }}>FEATURES</div>
          <h2 style={{ fontSize: "42px", fontWeight: 700, color: "#f0f0f5", lineHeight: 1.2, marginBottom: "16px" }}>
            Everything your enterprise needs
          </h2>
          <p style={{ fontSize: "16px", color: "#555", maxWidth: "500px", margin: "0 auto" }}>
            Built from the ground up with AI at the core, not bolted on as an afterthought.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "16px", padding: "28px", position: "relative", overflow: "hidden", transition: "border 0.2s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = `${f.color}30`}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "#1c1c1c"}>
                <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: `${f.color}12`, border: `1px solid ${f.color}20`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
                  <Icon size={20} color={f.color} />
                </div>
                <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#e0e0e0", marginBottom: "10px" }}>{f.title}</h3>
                <p style={{ fontSize: "13px", color: "#444", lineHeight: 1.7 }}>{f.desc}</p>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "1px", background: `linear-gradient(90deg, transparent, ${f.color}20, transparent)` }} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: "100px 40px", background: "#0a0a0a", borderTop: "1px solid #111", borderBottom: "1px solid #111" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "64px" }}>
            <div style={{ fontSize: "12px", color: "#7c6aff", letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: "12px" }}>PRICING</div>
            <h2 style={{ fontSize: "42px", fontWeight: 700, color: "#f0f0f5", lineHeight: 1.2, marginBottom: "16px" }}>Simple, transparent pricing</h2>
            <p style={{ fontSize: "16px", color: "#555" }}>Start free. Scale as you grow. Cancel anytime.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px", alignItems: "start" }}>
            {PRICING.map((plan) => (
              <div key={plan.name} style={{ background: plan.highlight ? "linear-gradient(135deg, rgba(124,106,255,0.08), rgba(79,61,232,0.04))" : "#0d0d0d", border: plan.highlight ? "1px solid rgba(124,106,255,0.3)" : "1px solid #1c1c1c", borderRadius: "20px", padding: "32px", position: "relative", overflow: "hidden" }}>
                {plan.highlight && (
                  <div style={{ position: "absolute", top: "16px", right: "16px", padding: "4px 10px", borderRadius: "99px", background: "rgba(124,106,255,0.15)", border: "1px solid rgba(124,106,255,0.3)", fontSize: "11px", color: "#a89aff" }}>
                    Most popular
                  </div>
                )}
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e0", marginBottom: "8px" }}>{plan.name}</h3>
                <p style={{ fontSize: "12px", color: "#444", marginBottom: "20px" }}>{plan.desc}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "24px" }}>
                  <span style={{ fontSize: "40px", fontWeight: 700, color: "#f0f0f5" }}>{plan.price}</span>
                  <span style={{ fontSize: "14px", color: "#555" }}>{plan.period}</span>
                </div>
                <Link href="/signup" style={{ display: "block", textAlign: "center", padding: "11px", borderRadius: "10px", background: plan.highlight ? "linear-gradient(135deg, #7c6aff, #4f3de8)" : "#111", border: plan.highlight ? "none" : "1px solid #222", color: plan.highlight ? "white" : "#888", fontSize: "14px", fontWeight: 500, textDecoration: "none", marginBottom: "24px" }}>
                  {plan.cta}
                </Link>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "rgba(52,211,153,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Check size={10} color="#34d399" />
                      </div>
                      <span style={{ fontSize: "13px", color: "#555" }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding: "100px 40px", maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <div style={{ fontSize: "12px", color: "#7c6aff", letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: "12px" }}>TESTIMONIALS</div>
          <h2 style={{ fontSize: "42px", fontWeight: 700, color: "#f0f0f5", lineHeight: 1.2 }}>Loved by finance and ops teams</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px" }}>
          {TESTIMONIALS.map((t) => (
            <div key={t.name} style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "16px", padding: "28px" }}>
              <div style={{ fontSize: "32px", color: "#7c6aff", marginBottom: "16px", lineHeight: 1 }}>"</div>
              <p style={{ fontSize: "14px", color: "#666", lineHeight: 1.7, marginBottom: "24px" }}>{t.text}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600, color: "white", flexShrink: 0 }}>
                  {t.avatar}
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "#ccc" }}>{t.name}</div>
                  <div style={{ fontSize: "12px", color: "#444" }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "100px 40px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "600px", height: "400px", background: "radial-gradient(ellipse, rgba(124,106,255,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: "600px", margin: "0 auto", position: "relative" }}>
          <h2 style={{ fontSize: "48px", fontWeight: 800, color: "#f0f0f5", lineHeight: 1.2, marginBottom: "20px", letterSpacing: "-0.5px" }}>
            Ready to modernize your ERP?
          </h2>
          <p style={{ fontSize: "17px", color: "#555", marginBottom: "40px", lineHeight: 1.7 }}>
            Join the waitlist and get early access to Benela AI. Free for the first 100 companies.
          </p>
          <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "16px 36px", borderRadius: "14px", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", color: "white", fontSize: "16px", fontWeight: 600, textDecoration: "none", boxShadow: "0 0 40px rgba(124,106,255,0.3)" }}>
            Get early access <ArrowRight size={18} />
          </Link>
          <p style={{ fontSize: "12px", color: "#333", marginTop: "16px" }}>No credit card · Cancel anytime · GDPR compliant</p>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "40px", borderTop: "1px solid #111", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "linear-gradient(135deg, #7c6aff, #4f3de8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
              <polygon points="9,2 16,6 16,12 9,16 2,12 2,6" stroke="white" strokeWidth="1.5" fill="none"/>
              <circle cx="9" cy="9" r="1.5" fill="white"/>
            </svg>
          </div>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#555" }}>BENELA AI</span>
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          {["Privacy", "Terms", "Contact"].map(link => (
            <a key={link} href="#" style={{ fontSize: "13px", color: "#333", textDecoration: "none" }}>{link}</a>
          ))}
        </div>
        <span style={{ fontSize: "12px", color: "#2a2a2a" }}>© 2025 Benela AI. All rights reserved.</span>
      </footer>
    </div>
  );
}