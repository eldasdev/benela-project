"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
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
  const [isAnnual, setIsAnnual] = React.useState(defaultAnnual);
  const planAccents = ["var(--accent)", "#60a5fa", "#34d399", "#a78bfa"];

  return (
    <section className={cn("w-full", className)} style={{ padding: "100px 40px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{ fontSize: "12px", color: "var(--accent)", letterSpacing: "0.1em", fontFamily: "monospace", marginBottom: "12px" }}>
            PRICING
          </div>
          <h2 style={{ fontSize: "42px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: "16px" }}>
            {title}
          </h2>
          <p style={{ fontSize: "16px", color: "var(--text-subtle)", maxWidth: "560px", margin: "0 auto 22px" }}>
            {subtitle}
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              border: "1px solid var(--border-default)",
              borderRadius: "10px",
              padding: "4px",
              background: "var(--bg-surface)",
            }}
          >
            <button
              type="button"
              onClick={() => setIsAnnual(false)}
              style={{
                height: "32px",
                borderRadius: "8px",
                border: "none",
                padding: "0 14px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                background: !isAnnual ? "var(--bg-elevated)" : "transparent",
                color: !isAnnual ? "var(--text-primary)" : "var(--text-subtle)",
              }}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setIsAnnual(true)}
              style={{
                height: "32px",
                borderRadius: "8px",
                border: "none",
                padding: "0 14px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                background: isAnnual ? "var(--bg-elevated)" : "transparent",
                color: isAnnual ? "var(--text-primary)" : "var(--text-subtle)",
              }}
            >
              Annual
            </button>
            <span
              style={{
                marginLeft: "4px",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--success)",
                background: "color-mix(in srgb, var(--success) 14%, transparent)",
                border: "1px solid color-mix(in srgb, var(--success) 25%, transparent)",
                borderRadius: "7px",
                padding: "6px 8px",
              }}
            >
              {annualBillingLabel}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {plans.map((plan, index) => {
            const yearlySavings = plan.priceMonthly > 0 ? plan.priceMonthly * 12 - plan.priceYearly : 0;
            const color = planAccents[index % planAccents.length];
            return (
              <div
                key={plan.id}
                style={{
                  background: "var(--bg-surface)",
                  border: plan.recommended
                    ? `1px solid color-mix(in srgb, ${color} 42%, var(--border-default))`
                    : "1px solid var(--border-default)",
                  borderRadius: "16px",
                  padding: "24px",
                  position: "relative",
                  overflow: "hidden",
                  transition: "border 0.2s",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: "100%",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${color} 34%, var(--border-default))`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = plan.recommended
                    ? `color-mix(in srgb, ${color} 42%, var(--border-default))`
                    : "var(--border-default)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: `color-mix(in srgb, ${color} 14%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {plan.icon}
                  </div>
                  {plan.recommended && (
                    <div
                      style={{
                        fontSize: "10px",
                        color: color,
                        letterSpacing: "0.1em",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
                        borderRadius: "999px",
                        padding: "4px 8px",
                        background: `color-mix(in srgb, ${color} 14%, transparent)`,
                      }}
                    >
                      Recommended
                    </div>
                  )}
                </div>

                <h3 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "10px" }}>{plan.name}</h3>
                <p style={{ fontSize: "14px", color: "var(--text-subtle)", lineHeight: 1.7, minHeight: "72px", marginBottom: "16px" }}>
                  {plan.description}
                </p>

                <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "10px" }}>
                  <span style={{ fontSize: "56px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                    ${(isAnnual ? plan.priceYearly : plan.priceMonthly).toLocaleString()}
                  </span>
                  <span style={{ fontSize: "14px", color: "var(--text-subtle)" }}>/ {isAnnual ? "year" : "month"}</span>
                </div>
                <div style={{ minHeight: "18px", marginBottom: "14px", fontSize: "12px", fontWeight: 600, color: "var(--success)" }}>
                  {isAnnual && yearlySavings > 0 ? `Save $${yearlySavings.toLocaleString()} annually` : ""}
                </div>

                <button
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "center",
                    padding: "11px",
                    borderRadius: "10px",
                    background: plan.recommended
                      ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
                      : "var(--bg-elevated)",
                    border: plan.recommended ? "none" : "1px solid var(--border-default)",
                    color: plan.recommended ? "white" : "var(--text-muted)",
                    fontSize: "14px",
                    fontWeight: 600,
                    marginBottom: "20px",
                    cursor: "pointer",
                  }}
                >
                  {buttonLabel}
                </button>

                <div style={{ marginTop: "auto" }}>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>Overview</div>
                  <div style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "14px" }}>✓ {plan.users}</div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>Highlights</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {plan.features.map((feature, featureIndex) => (
                      <div key={featureIndex} style={{ display: "flex", alignItems: "start", gap: "10px" }}>
                        {feature.included ? (
                          <Check size={16} style={{ color: "var(--success)", marginTop: "1px", flexShrink: 0 }} />
                        ) : (
                          <X size={16} style={{ color: "var(--text-quiet)", marginTop: "1px", flexShrink: 0 }} />
                        )}
                        <span
                          style={{
                            fontSize: "13px",
                            color: feature.included ? "var(--text-muted)" : "var(--text-quiet)",
                            textDecoration: feature.included ? "none" : "line-through",
                          }}
                        >
                          {feature.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "1px",
                    background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${color} 22%, transparent), transparent)`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
