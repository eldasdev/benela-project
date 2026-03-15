import { authFetch } from "@/lib/auth-fetch";
import { DEFAULT_PRICING_PLANS, clonePricingPlans, type PricingPlanDefinition } from "@/lib/pricing-plans";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

type ApiPlanFeature = {
  label: string;
  included: boolean;
};

type ApiPricingPlan = {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  users: string;
  features: ApiPlanFeature[];
  recommended?: boolean;
};

export function apiPlanToUiPlan(plan: ApiPricingPlan): PricingPlanDefinition {
  return {
    id: String(plan.id),
    name: String(plan.name),
    description: String(plan.description || ""),
    priceMonthly: Number(plan.price_monthly || 0),
    priceYearly: Number(plan.price_yearly || 0),
    users: String(plan.users || ""),
    features: Array.isArray(plan.features)
      ? plan.features.map((feature) => ({
          label: String(feature.label || ""),
          included: Boolean(feature.included),
        }))
      : [],
    recommended: Boolean(plan.recommended),
  };
}

export function uiPlanToApiPlan(plan: PricingPlanDefinition): ApiPricingPlan {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price_monthly: plan.priceMonthly,
    price_yearly: plan.priceYearly,
    users: plan.users,
    recommended: Boolean(plan.recommended),
    features: plan.features.map((feature) => ({
      label: feature.label,
      included: feature.included,
    })),
  };
}

export async function fetchPublicPricingPlans(): Promise<PricingPlanDefinition[]> {
  try {
    const response = await fetch(`${API}/platform/pricing-plans`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Failed to load pricing plans");
    const payload = (await response.json()) as ApiPricingPlan[];
    if (!Array.isArray(payload) || !payload.length) return clonePricingPlans(DEFAULT_PRICING_PLANS);
    return payload.map(apiPlanToUiPlan);
  } catch {
    return clonePricingPlans(DEFAULT_PRICING_PLANS);
  }
}

export async function fetchAdminPricingPlans(): Promise<PricingPlanDefinition[]> {
  const response = await authFetch(`${API}/admin/platform-pricing`);
  if (!response.ok) throw new Error("Failed to load platform pricing");
  const payload = (await response.json()) as ApiPricingPlan[];
  return Array.isArray(payload) && payload.length
    ? payload.map(apiPlanToUiPlan)
    : clonePricingPlans(DEFAULT_PRICING_PLANS);
}

export async function saveAdminPricingPlans(plans: PricingPlanDefinition[]): Promise<PricingPlanDefinition[]> {
  const response = await authFetch(`${API}/admin/platform-pricing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plans: plans.map(uiPlanToApiPlan) }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || "Failed to save platform pricing");
  }
  const payload = (await response.json()) as ApiPricingPlan[];
  return payload.map(apiPlanToUiPlan);
}
