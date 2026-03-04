export type PlanFeature = {
  label: string;
  included: boolean;
};

export type PricingPlanDefinition = {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  users: string;
  features: PlanFeature[];
  recommended?: boolean;
};

export const PRICING_STORAGE_KEY = "benela_admin_pricing_plans_v1";

export const DEFAULT_PRICING_PLANS: PricingPlanDefinition[] = [
  {
    id: "trial",
    name: "Trial",
    description: "Fast onboarding for early teams validating workflows.",
    priceMonthly: 0,
    priceYearly: 0,
    users: "Up to 5 users",
    features: [
      { label: "Core dashboard and AI assistant", included: true },
      { label: "Finance + HR modules", included: true },
      { label: "Advanced automations", included: false },
      { label: "Priority support", included: false },
    ],
  },
  {
    id: "starter",
    name: "Starter",
    description: "For small organizations building their ERP foundation.",
    priceMonthly: 49,
    priceYearly: 490,
    users: "Up to 10 users",
    features: [
      { label: "Finance, HR, Sales, Support", included: true },
      { label: "AI copilots for all included modules", included: true },
      { label: "Marketplace app installs", included: true },
      { label: "Custom integrations", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "For scaling teams that need full operational visibility.",
    priceMonthly: 149,
    priceYearly: 1490,
    users: "Up to 50 users",
    features: [
      { label: "All Benela core modules", included: true },
      { label: "Unlimited AI assistant prompts", included: true },
      { label: "Advanced analytics and forecasting", included: true },
      { label: "Dedicated success manager", included: true },
    ],
    recommended: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For regulated and multi-entity organizations with custom SLAs.",
    priceMonthly: 499,
    priceYearly: 4990,
    users: "Unlimited users",
    features: [
      { label: "Private deployment options", included: true },
      { label: "SSO / SCIM and custom RBAC policies", included: true },
      { label: "24/7 priority support and SLA", included: true },
      { label: "Custom AI model routing", included: true },
    ],
  },
];

export function clonePricingPlans(plans: PricingPlanDefinition[]): PricingPlanDefinition[] {
  return plans.map((plan) => ({
    ...plan,
    features: plan.features.map((feature) => ({ ...feature })),
  }));
}

export function normalizePricingPlan(value: unknown): PricingPlanDefinition | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PricingPlanDefinition>;
  if (!row.id || !row.name) return null;
  if (!Number.isFinite(row.priceMonthly) || !Number.isFinite(row.priceYearly)) return null;
  if (!Array.isArray(row.features)) return null;
  const normalizedFeatures = row.features
    .filter((feature) => feature && typeof feature.label === "string")
    .map((feature) => ({ label: feature.label, included: Boolean(feature.included) }));
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description || ""),
    users: String(row.users || ""),
    priceMonthly: Number(row.priceMonthly),
    priceYearly: Number(row.priceYearly),
    recommended: Boolean(row.recommended),
    features: normalizedFeatures,
  };
}
