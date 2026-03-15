"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { readClientSettings, saveClientSettings } from "@/lib/client-settings";
import { upsertClientOnboarding, type PaidPlanTier } from "@/lib/client-account";
import { useI18n } from "@/components/i18n/LanguageProvider";

export default function SignupPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [trialNotice, setTrialNotice] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [country, setCountry] = useState("Uzbekistan");
  const [city, setCity] = useState("");
  const [employeeCount, setEmployeeCount] = useState("10");
  const [planTier, setPlanTier] = useState<PaidPlanTier>("starter");
  const planOptions: Array<{ value: PaidPlanTier; label: string; subtitle: string }> = [
    {
      value: "starter",
      label: t("common.planTiers.starter"),
      subtitle: t("auth.signup.plans.starter"),
    },
    {
      value: "pro",
      label: t("common.planTiers.pro"),
      subtitle: t("auth.signup.plans.pro"),
    },
    {
      value: "enterprise",
      label: t("common.planTiers.enterprise"),
      subtitle: t("auth.signup.plans.enterprise"),
    },
  ];

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setTrialNotice("");

    try {
      const supabase = getSupabase();
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: "client",
          },
        },
      });

      if (signupError) {
        throw signupError;
      }

      const userId = data.user?.id;
      if (userId) {
        const account = await upsertClientOnboarding({
          user_id: userId,
          user_email: email.trim(),
          owner_name: fullName.trim(),
          business_name: businessName.trim(),
          country: country.trim(),
          city: city.trim() || null,
          employee_count: Number.parseInt(employeeCount, 10) || null,
          plan_tier: planTier,
        });

        if (account.workspace_id) {
          const current = readClientSettings();
          saveClientSettings({
            workspaceId: account.workspace_id,
            defaultSection: current.defaultSection || "dashboard",
            notifications: current.notifications,
          });
        }

        if (account.payment_required) {
          setTrialNotice(t("auth.signup.paymentRequiredNotice"));
        } else {
          setTrialNotice(t("auth.signup.trialActiveNotice"));
        }
      }

      setDone(true);
    } catch (signupErr: unknown) {
      setError(signupErr instanceof Error ? signupErr.message : t("auth.signup.createError"));
    } finally {
      setLoading(false);
    }
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: "10px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    fontSize: "14px",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-canvas)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: "500px", padding: "24px" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CheckCircle size={24} color="#34d399" />
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
            {t("auth.signup.accountCreated")}
          </h2>
          <p
            style={{ fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{
              __html: t("auth.signup.activationNotice", { email }),
            }}
          />
          {trialNotice ? (
            <p
              style={{
                marginTop: "12px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid var(--border-default)",
                background: "var(--bg-surface)",
                color: "var(--text-muted)",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              {trialNotice}
            </p>
          ) : null}
          <Link href="/login" style={{ display: "inline-block", marginTop: "24px", fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>
            {t("auth.signup.backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "560px", position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: "26px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(124,106,255,0.3)" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <polygon points="9,2 16,6 16,12 9,16 2,12 2,6" stroke="white" strokeWidth="1.5" fill="none" />
                <path d="M9 5 L12 9 L9 13 L6 9 Z" stroke="white" strokeWidth="1.5" fill="none" />
                <circle cx="9" cy="9" r="1.5" fill="white" />
              </svg>
            </div>
            <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "1px" }}>BENELA</span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-subtle)" }}>
            {t("auth.signup.subtitle")}
          </p>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "20px", padding: "24px" }}>
          <form onSubmit={handleSignup} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" }}>{t("auth.signup.fullName")}</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("auth.signup.fullNamePlaceholder")}
                style={input}
                required
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" }}>{t("auth.signup.workEmail")}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.signup.workEmailPlaceholder")} style={input} required />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" }}>{t("auth.signup.password")}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.signup.passwordPlaceholder")} style={input} minLength={8} required />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" }}>{t("auth.signup.businessName")}</label>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder={t("auth.signup.businessNamePlaceholder")} style={input} required />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" }}>{t("auth.signup.country")}</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder={t("auth.signup.countryPlaceholder")} style={input} required />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" }}>{t("auth.signup.city")}</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("auth.signup.cityPlaceholder")} style={input} />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" }}>{t("auth.signup.employees")}</label>
              <input
                type="number"
                min={1}
                value={employeeCount}
                onChange={(e) => setEmployeeCount(e.target.value)}
                placeholder="10"
                style={input}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" }}>{t("auth.signup.plan")}</label>
              <select value={planTier} onChange={(e) => setPlanTier(e.target.value as PaidPlanTier)} style={input}>
                {planOptions.map((plan) => (
                  <option key={plan.value} value={plan.value}>
                    {plan.label} · {plan.subtitle}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <div style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: "9px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", fontSize: "13px", color: "#f87171" }}>
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              style={{
                gridColumn: "1 / -1",
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
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
                  {t("auth.signup.creatingAccount")}
                </>
              ) : (
                t("auth.signup.createAccount")
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "var(--text-subtle)" }}>
          {t("auth.signup.alreadyHave")}{" "}
          <Link href="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
            {t("auth.signup.signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
