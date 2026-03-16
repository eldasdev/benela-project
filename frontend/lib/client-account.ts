import { authFetch } from "@/lib/auth-fetch";
import { readClientSettings, saveClientSettings } from "@/lib/client-settings";

const API =
  typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

export type PaidPlanTier = "starter" | "pro" | "enterprise";

export interface ClientAccountProfile {
  id: number;
  user_id: string;
  user_email?: string | null;
  workspace_id: string;
  business_name: string;
  business_slug: string;
  registration_number?: string | null;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  employee_count?: number | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  plan_tier: PaidPlanTier;
  payment_required: boolean;
  onboarding_completed: boolean;
  duplicate_of_account_id?: number | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  trial_seconds_total: number;
  trial_seconds_remaining: number;
  trial_progress_percent: number;
  documents_uploaded_count: number;
  missing_setup_fields: string[];
  setup_progress_percent: number;
  created_at: string;
  updated_at: string;
}

export interface ClientSidebarSummary {
  exists: boolean;
  workspace_id?: string | null;
  business_name?: string | null;
  owner_name?: string | null;
  plan_tier?: PaidPlanTier | null;
  payment_required: boolean;
  onboarding_completed: boolean;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  trial_seconds_total: number;
  trial_seconds_remaining: number;
  trial_progress_percent: number;
  documents_uploaded_count: number;
  missing_setup_fields: string[];
  setup_progress_percent: number;
  trial_label: string;
}

export interface ClientBusinessDocument {
  id: number;
  file_name: string;
  mime_type?: string | null;
  size_bytes: number;
  document_type: string;
  verification_status: string;
  created_at: string;
  download_url: string;
}

export interface EnsureClientWorkspaceResult {
  summary: ClientSidebarSummary | null;
  bootstrapped: boolean;
}

export interface ClientOnboardingPayload {
  user_id: string;
  user_email?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  business_name: string;
  registration_number?: string | null;
  industry?: string | null;
  country: string;
  city?: string | null;
  address?: string | null;
  employee_count?: number | null;
  plan_tier: PaidPlanTier;
}

export interface ClientProfilePatchPayload {
  owner_name?: string;
  owner_phone?: string;
  business_name?: string;
  registration_number?: string;
  industry?: string;
  country?: string;
  city?: string;
  address?: string;
  employee_count?: number | null;
  plan_tier?: PaidPlanTier;
  onboarding_completed?: boolean;
}

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const payload = await res.json();
    const detail = payload?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  } catch {
    // ignore
  }
  return fallback;
}

export function planLabel(plan?: string | null): string {
  if (!plan) return "Starter";
  const normalized = plan.toLowerCase();
  if (normalized === "enterprise") return "Enterprise";
  if (normalized === "pro") return "Pro";
  return "Starter";
}

export function formatTrialRemaining(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  if (!safe) return "Trial ended";
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.max(1, Math.floor((safe % 3600) / 60));
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h ${minutes}m left`;
}

export async function upsertClientOnboarding(
  payload: ClientOnboardingPayload,
  accessToken?: string | null,
): Promise<ClientAccountProfile> {
  const res = await authFetch(`${API}/client-account/onboard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Could not save onboarding information."));
  }
  return (await res.json()) as ClientAccountProfile;
}

export async function fetchClientAccountProfile(userId: string): Promise<ClientAccountProfile | null> {
  const query = new URLSearchParams({ user_id: userId });
  const res = await authFetch(`${API}/client-account/profile?${query.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(await parseError(res, "Could not load company profile."));
  }
  return (await res.json()) as ClientAccountProfile;
}

export async function patchClientAccountProfile(
  userId: string,
  payload: ClientProfilePatchPayload
): Promise<ClientAccountProfile> {
  const query = new URLSearchParams({ user_id: userId });
  const res = await authFetch(`${API}/client-account/profile?${query.toString()}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Could not save company profile."));
  }
  return (await res.json()) as ClientAccountProfile;
}

export async function fetchClientSidebarSummary(userId: string): Promise<ClientSidebarSummary> {
  const query = new URLSearchParams({ user_id: userId });
  const res = await authFetch(`${API}/client-account/sidebar?${query.toString()}`);
  if (!res.ok) {
    throw new Error(await parseError(res, "Could not load account summary."));
  }
  return (await res.json()) as ClientSidebarSummary;
}

export async function createClientPlatformReport(payload: {
  user_id: string;
  user_email?: string | null;
  title: string;
  message: string;
}) {
  const res = await authFetch(`${API}/client-account/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Could not submit report."));
  }
  return (await res.json()) as {
    id: number;
    workspace_id?: string | null;
    title: string;
    message: string;
    status: string;
    created_at: string;
  };
}

export async function listClientBusinessDocuments(userId: string): Promise<ClientBusinessDocument[]> {
  const query = new URLSearchParams({ user_id: userId, limit: "200" });
  const res = await authFetch(`${API}/client-account/documents?${query.toString()}`);
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(await parseError(res, "Could not load business documents."));
  }
  return (await res.json()) as ClientBusinessDocument[];
}

export async function uploadClientBusinessDocument(
  userId: string,
  file: File,
  documentType = "official"
): Promise<ClientBusinessDocument> {
  const form = new FormData();
  form.append("user_id", userId);
  form.append("document_type", documentType);
  form.append("file", file);

  const res = await authFetch(`${API}/client-account/documents`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Could not upload document."));
  }
  return (await res.json()) as ClientBusinessDocument;
}

export async function syncWorkspaceFromClientAccount(userId: string): Promise<ClientSidebarSummary | null> {
  const summary = await fetchClientSidebarSummary(userId).catch(() => null);
  if (!summary?.exists || !summary.workspace_id) return summary;

  const current = readClientSettings();
  if (current.workspaceId !== summary.workspace_id) {
    saveClientSettings({
      ...current,
      workspaceId: summary.workspace_id,
    });
  }
  return summary;
}

export async function bootstrapClientWorkspaceAccount(): Promise<ClientAccountProfile> {
  const res = await authFetch(`${API}/client-account/bootstrap`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Could not initialize client workspace."));
  }
  return (await res.json()) as ClientAccountProfile;
}

export async function ensureClientWorkspaceAccount(
  userId: string
): Promise<EnsureClientWorkspaceResult> {
  let summary = await syncWorkspaceFromClientAccount(userId).catch(() => null);
  if (summary?.exists) {
    return { summary, bootstrapped: false };
  }

  const draft = await bootstrapClientWorkspaceAccount();
  if (draft.workspace_id) {
    const current = readClientSettings();
    saveClientSettings({
      ...current,
      workspaceId: draft.workspace_id,
    });
  }

  summary = await syncWorkspaceFromClientAccount(userId).catch(() => null);
  return { summary, bootstrapped: true };
}
