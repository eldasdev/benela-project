export type AdminWorkspaceDocument = {
  id: number;
  file_name: string;
  mime_type?: string | null;
  size_bytes: number;
  document_type: string;
  verification_status: "pending" | "approved" | "rejected" | string;
  created_at: string;
  download_url: string;
};

export type AdminWorkspaceReport = {
  id: number;
  title: string;
  message: string;
  status: "open" | "reviewing" | "resolved" | "dismissed" | string;
  user_id: string;
  user_email?: string | null;
  created_at: string;
  resolved_at?: string | null;
};

export type AdminWorkspaceRow = {
  id: number;
  user_id: string;
  user_email?: string | null;
  workspace_id: string;
  business_name: string;
  business_slug: string;
  registration_number?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  country?: string | null;
  city?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  plan_tier: string;
  payment_required: boolean;
  onboarding_completed: boolean;
  duplicate_of_account_id?: number | null;
  linked_client_org_id?: number | null;
  linked_subscription_id?: number | null;
  is_suspended: boolean;
  access_status: "active" | "setup_pending" | "payment_required" | "suspended" | string;
  access_label: string;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  trial_seconds_remaining: number;
  trial_progress_percent: number;
  documents_uploaded_count: number;
  open_reports_count: number;
  setup_progress_percent: number;
  current_mrr: number;
  created_at: string;
  updated_at: string;
};

export type AdminWorkspaceDetail = AdminWorkspaceRow & {
  address?: string | null;
  missing_setup_fields: string[];
  documents: AdminWorkspaceDocument[];
  reports: AdminWorkspaceReport[];
  linked_client?: {
    id: number;
    name: string;
    slug: string;
    is_active: boolean;
    is_suspended: boolean;
  } | null;
  linked_subscription?: {
    id: number;
    plan_tier: string;
    status: string;
    price_monthly: number;
    billing_cycle: string;
    seats: number;
    current_period_end?: string | null;
    created_at: string;
  } | null;
};

export function formatWorkspaceAccessTone(status: AdminWorkspaceRow["access_status"]) {
  switch (status) {
    case "active":
      return {
        text: "#34d399",
        border: "color-mix(in srgb, #34d399 36%, transparent)",
        bg: "color-mix(in srgb, #34d399 14%, transparent)",
      };
    case "payment_required":
      return {
        text: "#f59e0b",
        border: "color-mix(in srgb, #f59e0b 36%, transparent)",
        bg: "color-mix(in srgb, #f59e0b 14%, transparent)",
      };
    case "suspended":
      return {
        text: "#f87171",
        border: "color-mix(in srgb, #f87171 36%, transparent)",
        bg: "color-mix(in srgb, #f87171 14%, transparent)",
      };
    default:
      return {
        text: "var(--accent)",
        border: "color-mix(in srgb, var(--accent) 34%, transparent)",
        bg: "color-mix(in srgb, var(--accent-soft) 20%, transparent)",
      };
  }
}

export function formatFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

export function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString()}`;
}
