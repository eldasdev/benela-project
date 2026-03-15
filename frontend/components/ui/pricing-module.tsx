"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  priceMonthly: number;
  priceYearly: number;
  users: string;
  features: PlanFeature[];
  recommended?: boolean;
}

export interface PricingModuleProps {
  title?: string;
  subtitle?: string;
  annualBillingLabel?: string;
  buttonLabel?: string;
  plans: PricingPlan[];
  defaultAnnual?: boolean;
  className?: string;
}

export function PricingModule({
  title = "Pricing Plans",
  subtitle = "Choose a plan that fits your needs.",
  annualBillingLabel = "Annual billing",
  buttonLabel = "Get started",
  plans,
  defaultAnnual = false,
  className,
}: PricingModuleProps) {
  const { t } = useI18n();
  const [isAnnual, setIsAnnual] = React.useState(defaultAnnual);
  const planAccents = ["var(--accent)", "#60a5fa", "#34d399", "#a78bfa"];

  return (
    <section className={cn("w-full pricing-module-section", className)} style={{ padding: "88px 40px 110px" }}>
      <div
        className="pricing-module-shell"
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          borderRadius: "36px",
          padding: "48px",
          border: "1px solid color-mix(in srgb, var(--border-default) 88%, transparent)",
          background:
            "radial-gradient(880px 420px at 0% 0%, color-mix(in srgb, var(--accent-soft) 70%, transparent), transparent 68%), radial-gradient(760px 360px at 100% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 62%), color-mix(in srgb, var(--bg-surface) 94%, white 6%)",
          boxShadow: "0 28px 80px color-mix(in srgb, var(--brand-glow) 14%, transparent)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to right, color-mix(in srgb, var(--border-default) 18%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border-default) 16%, transparent) 1px, transparent 1px)",
            backgroundSize: "84px 84px",
            opacity: 0.28,
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "12px", color: "var(--accent)", letterSpacing: "0.16em", fontFamily: "monospace", marginBottom: "14px" }}>
            {t("pricing.eyebrow")}
          </div>
          <h2 style={{ fontSize: "clamp(38px, 4.8vw, 62px)", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.04, letterSpacing: "-0.04em", marginBottom: "16px" }}>
            {title}
          </h2>
          <p style={{ fontSize: "17px", color: "var(--text-subtle)", maxWidth: "620px", margin: "0 auto 28px", lineHeight: 1.8 }}>
            {subtitle}
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              border: "1px solid color-mix(in srgb, var(--border-default) 88%, transparent)",
              borderRadius: "16px",
              padding: "6px",
              background: "color-mix(in srgb, var(--bg-panel) 94%, white 6%)",
              boxShadow: "0 16px 34px color-mix(in srgb, var(--brand-glow) 8%, transparent)",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => setIsAnnual(false)}
              style={{
                height: "38px",
                borderRadius: "12px",
                border: "none",
                padding: "0 18px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 700,
                background: !isAnnual
                  ? "linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 96%, white 4%), var(--bg-elevated))"
                  : "transparent",
                color: !isAnnual ? "var(--text-primary)" : "var(--text-subtle)",
                boxShadow: !isAnnual ? "inset 0 0 0 1px color-mix(in srgb, var(--border-default) 74%, transparent)" : "none",
              }}
            >
              {t("pricing.monthly")}
            </button>
            <button
              type="button"
              onClick={() => setIsAnnual(true)}
              style={{
                height: "38px",
                borderRadius: "12px",
                border: "none",
                padding: "0 18px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 700,
                background: isAnnual
                  ? "linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 96%, white 4%), var(--bg-elevated))"
                  : "transparent",
                color: isAnnual ? "var(--text-primary)" : "var(--text-subtle)",
                boxShadow: isAnnual ? "inset 0 0 0 1px color-mix(in srgb, var(--border-default) 74%, transparent)" : "none",
              }}
            >
              {t("pricing.annual")}
            </button>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--success)",
                background: "color-mix(in srgb, var(--success) 14%, white 86%)",
                border: "1px solid color-mix(in srgb, var(--success) 28%, transparent)",
                borderRadius: "11px",
                padding: "9px 12px",
              }}
            >
              {annualBillingLabel}
            </span>
          </div>
        </div>

        <div
          className="pricing-module-grid"
          style={{
            position: "relative",
            display: "grid",
            gap: "22px",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            alignItems: "stretch",
          }}
        >
          {plans.map((plan, index) => {
            const yearlySavings = plan.priceMonthly > 0 ? plan.priceMonthly * 12 - plan.priceYearly : 0;
            const color = planAccents[index % planAccents.length];
            return (
              <div
                key={plan.id}
                className="pricing-plan-card"
                style={{
                  background:
                    plan.recommended
                      ? `linear-gradient(180deg, color-mix(in srgb, ${color} 9%, var(--bg-surface) 91%), var(--bg-surface))`
                      : "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 96%, white 4%), var(--bg-surface))",
                  border: plan.recommended
                    ? `1px solid color-mix(in srgb, ${color} 42%, var(--border-default))`
                    : "1px solid var(--border-default)",
                  borderRadius: "24px",
                  padding: "26px",
                  position: "relative",
                  overflow: "hidden",
                  transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: "100%",
                  boxShadow: plan.recommended
                    ? `0 24px 60px color-mix(in srgb, ${color} 16%, transparent)`
                    : "0 16px 42px color-mix(in srgb, var(--brand-glow) 8%, transparent)",
                  transform: plan.recommended ? "translateY(-6px)" : "none",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${color} 34%, var(--border-default))`;
                  (e.currentTarget as HTMLElement).style.transform = plan.recommended ? "translateY(-10px)" : "translateY(-4px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 28px 64px color-mix(in srgb, ${color} 18%, transparent)`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = plan.recommended
                    ? `color-mix(in srgb, ${color} 42%, var(--border-default))`
                    : "var(--border-default)";
                  (e.currentTarget as HTMLElement).style.transform = plan.recommended ? "translateY(-6px)" : "none";
                  (e.currentTarget as HTMLElement).style.boxShadow = plan.recommended
                    ? `0 24px 60px color-mix(in srgb, ${color} 16%, transparent)`
                    : "0 16px 42px color-mix(in srgb, var(--brand-glow) 8%, transparent)";
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: "0 auto auto 0",
                    width: "100%",
                    height: "1px",
                    background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${color} 50%, transparent), transparent)`,
                  }}
                />

                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "14px",
                      background: `color-mix(in srgb, ${color} 14%, white 86%)`,
                      border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: `inset 0 1px 0 color-mix(in srgb, white 60%, transparent)`,
                    }}
                  >
                    {plan.icon}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "var(--text-subtle)",
                        letterSpacing: "0.12em",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
                        borderRadius: "999px",
                        padding: "6px 10px",
                        background: "color-mix(in srgb, var(--bg-panel) 96%, transparent)",
                      }}
                    >
                      {plan.users}
                    </div>
                    {plan.recommended && (
                      <div
                        style={{
                          fontSize: "10px",
                          color: color,
                          letterSpacing: "0.12em",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
                          borderRadius: "999px",
                          padding: "6px 10px",
                          background: `color-mix(in srgb, ${color} 14%, white 86%)`,
                        }}
                      >
                        {t("pricing.recommended")}
                      </div>
                    )}
                  </div>
                </div>

                <h3 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "10px", letterSpacing: "-0.03em" }}>{plan.name}</h3>
                <p style={{ fontSize: "15px", color: "var(--text-subtle)", lineHeight: 1.8, minHeight: "84px", marginBottom: "18px" }}>
                  {plan.description}
                </p>

                <div style={{ display: "grid", gap: "8px", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "clamp(50px, 6vw, 64px)", fontWeight: 700, color: "var(--text-primary)", lineHeight: 0.92, letterSpacing: "-0.06em" }}>
                      $
                      {(isAnnual ? plan.priceYearly : plan.priceMonthly).toLocaleString()}
                    </span>
                    <span style={{ fontSize: "15px", color: "var(--text-subtle)", fontWeight: 600 }}>
                      / {isAnnual ? t("pricing.perYear") : t("pricing.perMonth")}
                    </span>
                  </div>
                  <div style={{ minHeight: "18px", fontSize: "12px", fontWeight: 700, color: yearlySavings > 0 && isAnnual ? "var(--success)" : "var(--text-quiet)" }}>
                    {isAnnual && yearlySavings > 0
                      ? t("pricing.saveAnnually", { amount: yearlySavings.toLocaleString() })
                      : "7-day trial included"}
                  </div>
                </div>

                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "center",
                    padding: "13px 14px",
                    borderRadius: "14px",
                    background: plan.recommended
                      ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
                      : `linear-gradient(180deg, color-mix(in srgb, ${color} 9%, var(--bg-panel) 91%), color-mix(in srgb, var(--bg-panel) 96%, white 4%))`,
                    border: plan.recommended ? "none" : `1px solid color-mix(in srgb, ${color} 22%, var(--border-default))`,
                    color: plan.recommended ? "white" : "var(--text-primary)",
                    fontSize: "15px",
                    fontWeight: 700,
                    marginBottom: "22px",
                    cursor: "pointer",
                    boxShadow: plan.recommended
                      ? "0 16px 32px color-mix(in srgb, var(--accent) 24%, transparent)"
                      : `0 10px 24px color-mix(in srgb, ${color} 12%, transparent)`,
                  }}
                >
                  {buttonLabel}
                </button>

                <div
                  style={{
                    display: "grid",
                    gap: "16px",
                    marginTop: "auto",
                    paddingTop: "18px",
                    borderTop: "1px solid color-mix(in srgb, var(--border-default) 84%, transparent)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", letterSpacing: "0.01em" }}>
                      {t("pricing.overview")}
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "14px",
                        color: "var(--text-muted)",
                        borderRadius: "999px",
                        padding: "8px 12px",
                        background: "color-mix(in srgb, var(--bg-panel) 94%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--border-default) 78%, transparent)",
                      }}
                    >
                      <Check size={14} style={{ color: "var(--success)", flexShrink: 0 }} />
                      {plan.users}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "10px", letterSpacing: "0.01em" }}>
                      {t("pricing.highlights")}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {plan.features.map((feature, featureIndex) => (
                        <div
                          key={featureIndex}
                          style={{
                            display: "flex",
                            alignItems: "start",
                            gap: "10px",
                            opacity: feature.included ? 1 : 0.68,
                          }}
                        >
                          <div
                            style={{
                              width: "20px",
                              height: "20px",
                              borderRadius: "999px",
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                              background: feature.included
                                ? "color-mix(in srgb, var(--success) 12%, transparent)"
                                : "color-mix(in srgb, var(--bg-panel) 92%, transparent)",
                              border: feature.included
                                ? "1px solid color-mix(in srgb, var(--success) 24%, transparent)"
                                : "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
                              marginTop: "1px",
                            }}
                          >
                            {feature.included ? (
                              <Check size={13} style={{ color: "var(--success)" }} />
                            ) : (
                              <X size={12} style={{ color: "var(--text-quiet)" }} />
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: "14px",
                              lineHeight: 1.65,
                              color: feature.included ? "var(--text-muted)" : "var(--text-subtle)",
                            }}
                          >
                            {feature.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    position: "absolute",
                    inset: "auto -20% -35% auto",
                    width: "180px",
                    height: "180px",
                    borderRadius: "50%",
                    background: `radial-gradient(circle, color-mix(in srgb, ${color} 12%, transparent), transparent 72%)`,
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "2px",
                    background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${color} 30%, transparent), transparent)`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .pricing-module-section {
            padding: 72px 20px 84px !important;
          }

          .pricing-module-shell {
            padding: 28px !important;
            border-radius: 28px !important;
          }
        }

        @media (max-width: 640px) {
          .pricing-module-shell {
            padding: 22px !important;
          }

          .pricing-module-grid {
            gap: 18px !important;
          }

          .pricing-plan-card {
            padding: 22px !important;
            transform: none !important;
          }
        }
      `}</style>
    </section>
  );
}
