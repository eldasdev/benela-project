"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, CreditCard, Pencil, Plus, RefreshCcw, ShieldAlert, Sparkles, TriangleAlert, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-fetch";
import { type AdminWorkspaceRow } from "@/lib/admin-client-workspaces";
import { clampPercent, formatDate, formatMoney, readErrorMessage, toDateInput, toIsoOrNull } from "@/lib/admin-utils";
import { fetchAdminPricingPlans, saveAdminPricingPlans } from "@/lib/platform-pricing";
import { type PlanFeature, type PricingPlanDefinition } from "@/lib/pricing-plans";
import {
  AdminActionMenu,
  AdminDataTable,
  AdminEmptyState,
  AdminFilterBar,
  AdminMetricCard,
  AdminMetricGrid,
  AdminModal,
  AdminPageHero,
  AdminPill,
  AdminSectionCard,
  AdminStatStrip,
  AdminTableHead,
  AdminTableRow,
  adminButtonStyle,
  adminInputStyle,
} from "@/components/admin/ui";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

type WorkspaceSubscriptionRow = {
  subscription_id?: number | null;
  account_id?: number | null;
  workspace_id?: string | null;
  business_name: string;
  business_slug?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  country?: string | null;
  plan_tier: string;
  status: string;
  billing_cycle: string;
  price_monthly: number;
  seats: number;
  modules: string;
  trial_ends_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  access_status: string;
  onboarding_completed: boolean;
  payment_required: boolean;
  documents_uploaded_count: number;
  open_reports_count: number;
  current_mrr: number;
  linked_client_org_id?: number | null;
  is_unlinked_legacy: boolean;
  created_at: string;
};

type FormState = {
  account_id: string;
  plan_tier: string;
  status: string;
  price_monthly: string;
  seats: string;
  modules: string;
  billing_cycle: string;
  trial_ends_at: string;
  current_period_start: string;
  current_period_end: string;
  cancel_reason: string;
};

type PlanEditorState = {
  id: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  users: string;
  recommended: boolean;
  features: PlanFeature[];
};

const EMPTY_FORM: FormState = {
  account_id: "",
  plan_tier: "starter",
  status: "trial",
  price_monthly: "49",
  seats: "10",
  modules: "finance,hr,sales,support",
  billing_cycle: "monthly",
  trial_ends_at: "",
  current_period_start: "",
  current_period_end: "",
  cancel_reason: "",
};

function formatStatusTone(status: string): "accent" | "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "trial":
      return "warning";
    case "cancelled":
    case "expired":
      return "danger";
    case "suspended":
      return "danger";
    default:
      return "neutral";
  }
}

function formatAccessTone(status: string): "accent" | "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "payment_required":
      return "warning";
    case "suspended":
      return "danger";
    case "setup_pending":
      return "accent";
    default:
      return "neutral";
  }
}

function planTone(plan: string): "accent" | "success" | "warning" | "danger" | "neutral" {
  switch (plan) {
    case "pro":
      return "accent";
    case "enterprise":
      return "warning";
    case "trial":
      return "warning";
    case "starter":
      return "neutral";
    default:
      return "neutral";
  }
}

function parseFeatures(textFeatures: PlanFeature[]): PlanFeature[] {
  return textFeatures
    .map((feature) => ({ label: feature.label.trim(), included: Boolean(feature.included) }))
    .filter((feature) => feature.label.length > 0);
}

export default function AdminSubscriptionsPage() {
  const searchParams = useSearchParams();
  const initialAccountFilter = searchParams.get("account_id") || "";

  const [rows, setRows] = useState<WorkspaceSubscriptionRow[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspaceRow[]>([]);
  const [pricingPlans, setPricingPlans] = useState<PricingPlanDefinition[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState(initialAccountFilter);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingRow, setEditingRow] = useState<WorkspaceSubscriptionRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [planDraft, setPlanDraft] = useState<PlanEditorState | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [subscriptionRes, workspacesRes, pricingRes] = await Promise.all([
        authFetch(`${API}/admin/subscriptions?limit=400`),
        authFetch(`${API}/admin/client-workspaces?limit=300`),
        fetchAdminPricingPlans(),
      ]);
      if (!subscriptionRes.ok) {
        const body = await subscriptionRes.json().catch(() => null);
        throw new Error(body?.detail || "Failed to load subscriptions");
      }
      if (!workspacesRes.ok) {
        const body = await workspacesRes.json().catch(() => null);
        throw new Error(body?.detail || "Failed to load client workspaces");
      }
      setRows((await subscriptionRes.json()) as WorkspaceSubscriptionRow[]);
      setWorkspaces((await workspacesRes.json()) as AdminWorkspaceRow[]);
      setPricingPlans(pricingRes);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load subscription operations."));
      setRows([]);
      setWorkspaces([]);
      setPricingPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const workspaceMap = useMemo(() => new Map(workspaces.map((item) => [item.id, item])), [workspaces]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (planFilter !== "all" && row.plan_tier !== planFilter) return false;
      if (accessFilter !== "all" && row.access_status !== accessFilter) return false;
      if (accountFilter.trim() && String(row.account_id || "") !== accountFilter.trim()) return false;
      if (!needle) return true;
      const haystack = [
        row.business_name,
        row.business_slug || "",
        row.workspace_id || "",
        row.owner_name || "",
        row.owner_email || "",
        row.plan_tier,
        row.status,
        row.billing_cycle,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, query, statusFilter, planFilter, accessFilter, accountFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((row) => row.status === "active").length;
    const trials = rows.filter((row) => row.status === "trial").length;
    const paymentRequired = rows.filter((row) => row.payment_required).length;
    const cancelled = rows.filter((row) => row.status === "cancelled").length;
    const mrr = rows.reduce((sum, row) => sum + row.current_mrr, 0);
    return { total, active, trials, paymentRequired, cancelled, mrr };
  }, [rows]);

  const planMix = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => counts.set(row.plan_tier, (counts.get(row.plan_tier) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const expiringTrials = useMemo(() => {
    const now = Date.now();
    const horizon = now + 7 * 24 * 60 * 60 * 1000;
    return rows
      .filter((row) => row.status === "trial" && row.trial_ends_at)
      .map((row) => ({ row, trialEnds: new Date(row.trial_ends_at as string).getTime() }))
      .filter((entry) => Number.isFinite(entry.trialEnds) && entry.trialEnds >= now && entry.trialEnds <= horizon)
      .sort((a, b) => a.trialEnds - b.trialEnds);
  }, [rows]);

  const openCreate = () => {
    const preferredWorkspace = accountFilter && /^\d+$/.test(accountFilter) ? workspaceMap.get(Number(accountFilter)) : null;
    setEditingRow(null);
    setForm({
      ...EMPTY_FORM,
      account_id: preferredWorkspace ? String(preferredWorkspace.id) : "",
      plan_tier: preferredWorkspace?.plan_tier || "starter",
      status: preferredWorkspace?.plan_tier === "trial" ? "trial" : "active",
      price_monthly: String(preferredWorkspace?.current_mrr || 49),
    });
    setShowEditor(true);
  };

  const openEdit = (row: WorkspaceSubscriptionRow) => {
    setEditingRow(row);
    setForm({
      account_id: String(row.account_id || ""),
      plan_tier: row.plan_tier,
      status: row.status,
      price_monthly: String(row.price_monthly),
      seats: String(row.seats),
      modules: row.modules,
      billing_cycle: row.billing_cycle,
      trial_ends_at: toDateInput(row.trial_ends_at),
      current_period_start: toDateInput(row.current_period_start),
      current_period_end: toDateInput(row.current_period_end),
      cancel_reason: row.cancel_reason || "",
    });
    setShowEditor(true);
  };

  const saveSubscription = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!/^\d+$/.test(form.account_id.trim())) throw new Error("A workspace account is required.");
      if (!form.modules.trim()) throw new Error("Modules cannot be empty.");
      if (Number(form.seats) <= 0) throw new Error("Seats must be at least 1.");
      if (Number(form.price_monthly) < 0) throw new Error("Price cannot be negative.");

      const payload = {
        account_id: Number(form.account_id),
        plan_tier: form.plan_tier,
        status: form.status,
        price_monthly: Number(form.price_monthly),
        seats: Number(form.seats),
        modules: form.modules.trim(),
        billing_cycle: form.billing_cycle,
        trial_ends_at: toIsoOrNull(form.trial_ends_at),
        current_period_start: toIsoOrNull(form.current_period_start),
        current_period_end: toIsoOrNull(form.current_period_end),
        cancel_reason: form.cancel_reason.trim() || null,
      };

      const endpoint = editingRow?.subscription_id ? `${API}/admin/subscriptions/${editingRow.subscription_id}` : `${API}/admin/subscriptions`;
      const method = editingRow?.subscription_id ? "PUT" : "POST";
      const response = await authFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to save subscription");
      }
      setNotice(editingRow ? "Subscription updated." : "Subscription created.");
      setShowEditor(false);
      setEditingRow(null);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not save subscription."));
    } finally {
      setSaving(false);
    }
  };

  const cancelSubscription = async (row: WorkspaceSubscriptionRow) => {
    if (!row.subscription_id) return;
    const reason = window.prompt(`Cancel ${row.business_name}'s subscription? Enter an optional reason.`, row.cancel_reason || "") || "";
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`${API}/admin/subscriptions/${row.subscription_id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to cancel subscription");
      }
      setNotice(`Subscription cancelled for ${row.business_name}.`);
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not cancel subscription."));
    }
  };

  const sendBillingNotice = async (row: WorkspaceSubscriptionRow) => {
    if (!row.account_id) return;
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`${API}/admin/client-workspaces/${row.account_id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Billing update for ${row.business_name}`,
          message:
            row.status === "cancelled"
              ? `Your ${row.plan_tier} subscription has been cancelled. Contact Benela support if you need reactivation or migration support.`
              : `Please review billing for your ${row.plan_tier} subscription. Current cycle: ${row.billing_cycle}. Contact Benela support if you need an adjustment or extension.`,
          type: row.payment_required ? "warning" : "info",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to send billing notice");
      }
      setNotice(`Billing notice sent to ${row.business_name}.`);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not send billing notice."));
    }
  };

  const openPlanEditor = (plan: PricingPlanDefinition) => {
    setPlanDraft({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceMonthly: String(plan.priceMonthly),
      priceYearly: String(plan.priceYearly),
      users: plan.users,
      recommended: Boolean(plan.recommended),
      features: plan.features.map((feature) => ({ ...feature })),
    });
    setShowPlanEditor(true);
  };

  const savePlanDraft = async () => {
    if (!planDraft) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const normalizedDraft: PricingPlanDefinition = {
        id: planDraft.id,
        name: planDraft.name.trim(),
        description: planDraft.description.trim(),
        priceMonthly: Number(planDraft.priceMonthly),
        priceYearly: Number(planDraft.priceYearly),
        users: planDraft.users.trim(),
        recommended: planDraft.recommended,
        features: parseFeatures(planDraft.features),
      };
      if (!normalizedDraft.name) throw new Error("Plan name is required.");
      if (!normalizedDraft.features.length) throw new Error("Add at least one feature.");
      const nextPlans = pricingPlans.map((plan) => (plan.id === normalizedDraft.id ? normalizedDraft : plan));
      const saved = await saveAdminPricingPlans(nextPlans);
      setPricingPlans(saved);
      setShowPlanEditor(false);
      setPlanDraft(null);
      setNotice(`${normalizedDraft.name} pricing updated.`);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not save pricing plan."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1520px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <AdminPageHero
        eyebrow="Revenue Operations"
        title="Subscriptions"
        subtitle="Run plan lifecycle, renewals, trials, and platform pricing from one workspace-centric billing surface."
        actions={
          <>
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => void loadData()}>
              <RefreshCcw size={16} /> Refresh
            </button>
            <button type="button" style={adminButtonStyle("primary")} onClick={openCreate}>
              <Plus size={16} /> Create Subscription
            </button>
          </>
        }
      />

      {(error || notice) && (
        <div
          className="admin-ui-surface"
          style={{
            padding: "14px 16px",
            borderColor: error ? "color-mix(in srgb, var(--danger) 42%, transparent)" : "color-mix(in srgb, #34d399 42%, transparent)",
            background: error
              ? "color-mix(in srgb, var(--danger) 10%, var(--bg-surface) 90%)"
              : "color-mix(in srgb, #34d399 10%, var(--bg-surface) 90%)",
            color: error ? "var(--danger)" : "#34d399",
          }}
        >
          {error || notice}
        </div>
      )}

      <AdminMetricGrid>
        <AdminMetricCard label="Workspace subscriptions" value={stats.total} detail="All linked and repairable billing accounts" tone="accent" />
        <AdminMetricCard label="Active" value={stats.active} detail="Currently billable client workspaces" tone="success" />
        <AdminMetricCard label="Trials" value={stats.trials} detail={`${expiringTrials.length} expiring in 7 days`} tone="warning" />
        <AdminMetricCard label="Payment required" value={stats.paymentRequired} detail="Needs billing follow-up" tone="warning" />
        <AdminMetricCard label="Cancelled" value={stats.cancelled} detail="Retention risk backlog" tone="danger" />
        <AdminMetricCard label="Portfolio MRR" value={formatMoney(stats.mrr)} detail="Live recurring exposure" tone="accent" />
      </AdminMetricGrid>

      <AdminStatStrip>
        <div className="admin-ui-surface" style={{ padding: "12px 14px", display: "grid", gap: "10px", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "2px" }}>Plan mix</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Current workspace distribution</div>
            </div>
            <Sparkles size={16} color="var(--accent)" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {planMix.length ? planMix.map(([plan, count]) => (
              <AdminPill key={plan} label={`${plan} · ${count}`} tone={planTone(plan)} />
            )) : <AdminPill label="No active subscriptions" tone="neutral" />}
          </div>
        </div>
        <div className="admin-ui-surface" style={{ padding: "12px 14px", display: "grid", gap: "10px", flex: 1.2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)", fontWeight: 700 }}>
            <TriangleAlert size={16} color="#fbbf24" /> Trial renewals approaching
          </div>
          {expiringTrials.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {expiringTrials.slice(0, 4).map(({ row }) => (
                <div key={`${row.account_id}-${row.trial_ends_at}`} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{row.business_name}</span>
                  <span style={{ color: "var(--text-subtle)" }}>{formatDate(row.trial_ends_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>No trials expiring in the next 7 days.</div>
          )}
        </div>
      </AdminStatStrip>

      <AdminSectionCard
        title="Subscription ledger"
        description="Filter client workspaces, inspect billing state, and trigger operational actions without leaving the subscriptions surface."
      >
        <AdminFilterBar>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, workspace, owner, email, plan..." style={adminInputStyle({ flex: 2, minWidth: "240px" })} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={adminInputStyle({ flex: 1, minWidth: "170px" })}>
            <option value="all">All statuses</option>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
            <option value="suspended">Suspended</option>
            <option value="expired">Expired</option>
          </select>
          <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} style={adminInputStyle({ flex: 1, minWidth: "160px" })}>
            <option value="all">All plans</option>
            <option value="trial">Trial</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)} style={adminInputStyle({ flex: 1, minWidth: "170px" })}>
            <option value="all">All access states</option>
            <option value="active">Active</option>
            <option value="setup_pending">Setup pending</option>
            <option value="payment_required">Payment required</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} style={adminInputStyle({ flex: 1.2, minWidth: "200px" })}>
            <option value="">All workspaces</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.business_name} · #{workspace.id}
              </option>
            ))}
          </select>
        </AdminFilterBar>

        {filteredRows.length ? (
          <AdminDataTable>
            <AdminTableHead
              columns={[
                <span key="company">Company</span>,
                <span key="owner">Owner</span>,
                <span key="plan">Plan</span>,
                <span key="billing">Billing</span>,
                <span key="renewal">Renewal</span>,
                <span key="health">Health</span>,
                <span key="actions">Actions</span>,
              ]}
            />
            {filteredRows.map((row) => {
              const workspace = row.account_id ? workspaceMap.get(row.account_id) : undefined;
              return (
                <AdminTableRow
                  key={`${row.account_id ?? "legacy"}-${row.subscription_id ?? row.business_slug ?? row.business_name}`}
                  style={{ gridTemplateColumns: "1.35fr 1.05fr 0.95fr 0.95fr 0.95fr 1.15fr 1.05fr" }}
                >
                  <div style={{ display: "grid", gap: "6px" }}>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "15px" }}>{row.business_name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <span>{row.business_slug || "—"}</span>
                      <span>{row.workspace_id || "No workspace"}</span>
                      {row.is_unlinked_legacy ? <AdminPill label="Legacy unlink" tone="danger" /> : null}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{row.owner_name || "Unassigned"}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.owner_email || "No email"}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.country || "No country"}</span>
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <AdminPill label={row.plan_tier} tone={planTone(row.plan_tier)} />
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.seats} seats</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.modules.split(",").slice(0, 3).join(", ")}</span>
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{formatMoney(row.price_monthly)}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)", textTransform: "capitalize" }}>{row.billing_cycle}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>MRR {formatMoney(row.current_mrr)}</span>
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <AdminPill label={row.status} tone={formatStatusTone(row.status)} />
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Trial: {formatDate(row.trial_ends_at)}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Period end: {formatDate(row.current_period_end)}</span>
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <AdminPill label={row.access_status.replaceAll("_", " ")} tone={formatAccessTone(row.access_status)} />
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Docs {row.documents_uploaded_count}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Reports {row.open_reports_count}</span>
                    {workspace ? (
                      <div style={{ display: "grid", gap: "4px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Setup {Math.round(clampPercent(workspace.setup_progress_percent))}%</span>
                        <div style={{ height: "6px", borderRadius: "999px", background: "color-mix(in srgb, var(--border-default) 44%, transparent)", overflow: "hidden" }}>
                          <div style={{ width: `${clampPercent(workspace.setup_progress_percent)}%`, height: "100%", background: "linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #34d399 45%))" }} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <AdminActionMenu>
                    {row.account_id ? (
                      <Link href={`/admin/clients/${row.account_id}`} style={adminButtonStyle("secondary", { minHeight: "36px", padding: "0 10px" })}>
                        <ShieldAlert size={14} /> Open
                      </Link>
                    ) : null}
                    <button type="button" style={adminButtonStyle("secondary", { minHeight: "36px", padding: "0 10px" })} onClick={() => openEdit(row)}>
                      <Pencil size={14} /> Edit
                    </button>
                    {row.subscription_id ? (
                      <button type="button" style={adminButtonStyle("ghost", { minHeight: "36px", padding: "0 10px" })} onClick={() => void sendBillingNotice(row)}>
                        <BellRing size={14} /> Notify
                      </button>
                    ) : null}
                    {row.subscription_id ? (
                      <button type="button" style={adminButtonStyle("danger", { minHeight: "36px", padding: "0 10px" })} onClick={() => void cancelSubscription(row)}>
                        <XCircle size={14} /> Cancel
                      </button>
                    ) : null}
                  </AdminActionMenu>
                </AdminTableRow>
              );
            })}
          </AdminDataTable>
        ) : (
          <AdminEmptyState
            title={loading ? "Loading subscriptions..." : "No subscriptions match these filters"}
            description="Adjust filters or create a workspace-linked subscription to start billing operations."
            action={<button type="button" style={adminButtonStyle("primary")} onClick={openCreate}><Plus size={16} /> Create Subscription</button>}
          />
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Pricing catalog" description="Backend-backed platform pricing. These definitions are the source of truth for admin billing operations and public plan presentation.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
          {pricingPlans.map((plan) => (
            <div key={plan.id} className="admin-ui-surface" style={{ padding: "16px", display: "grid", gap: "12px", minHeight: "100%" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "18px" }}>{plan.name}</h3>
                    {plan.recommended ? <AdminPill label="Recommended" tone="accent" /> : null}
                  </div>
                  <p style={{ margin: "6px 0 0", color: "var(--text-subtle)", fontSize: "13px", lineHeight: 1.6 }}>{plan.description}</p>
                </div>
                <button type="button" style={adminButtonStyle("secondary", { minHeight: "36px", padding: "0 10px" })} onClick={() => openPlanEditor(plan)}>
                  <Pencil size={14} /> Edit
                </button>
              </div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Monthly</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{formatMoney(plan.priceMonthly)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Yearly</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{formatMoney(plan.priceYearly)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Users</div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{plan.users}</div>
                </div>
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {plan.features.map((feature) => (
                  <div key={feature.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", fontSize: "13px" }}>
                    <span style={{ color: "var(--text-primary)" }}>{feature.label}</span>
                    <AdminPill label={feature.included ? "Included" : "Excluded"} tone={feature.included ? "success" : "neutral"} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AdminSectionCard>

      <AdminModal
        open={showEditor}
        onClose={() => {
          setShowEditor(false);
          setEditingRow(null);
          setForm(EMPTY_FORM);
        }}
        title={editingRow ? `Edit ${editingRow.business_name}` : "Create workspace subscription"}
        description="Resolve the workspace account first, then update its linked billing records through the admin compatibility layer."
        width={920}
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <div className="admin-form-grid-3" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Workspace account</span>
              <select value={form.account_id} onChange={(event) => setForm((prev) => ({ ...prev, account_id: event.target.value }))} style={adminInputStyle()}>
                <option value="">Select workspace</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.business_name} · #{workspace.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Plan tier</span>
              <select value={form.plan_tier} onChange={(event) => setForm((prev) => ({ ...prev, plan_tier: event.target.value }))} style={adminInputStyle()}>
                <option value="trial">Trial</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Status</span>
              <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} style={adminInputStyle()}>
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
            </label>
          </div>
          <div className="admin-form-grid-4" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Monthly price</span>
              <input value={form.price_monthly} onChange={(event) => setForm((prev) => ({ ...prev, price_monthly: event.target.value }))} type="number" min="0" step="0.01" style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Seats</span>
              <input value={form.seats} onChange={(event) => setForm((prev) => ({ ...prev, seats: event.target.value }))} type="number" min="1" style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Billing cycle</span>
              <select value={form.billing_cycle} onChange={(event) => setForm((prev) => ({ ...prev, billing_cycle: event.target.value }))} style={adminInputStyle()}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Trial ends</span>
              <input value={form.trial_ends_at} onChange={(event) => setForm((prev) => ({ ...prev, trial_ends_at: event.target.value }))} type="date" style={adminInputStyle()} />
            </label>
          </div>
          <div className="admin-form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Current period start</span>
              <input value={form.current_period_start} onChange={(event) => setForm((prev) => ({ ...prev, current_period_start: event.target.value }))} type="date" style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Current period end</span>
              <input value={form.current_period_end} onChange={(event) => setForm((prev) => ({ ...prev, current_period_end: event.target.value }))} type="date" style={adminInputStyle()} />
            </label>
          </div>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Enabled modules</span>
            <textarea value={form.modules} onChange={(event) => setForm((prev) => ({ ...prev, modules: event.target.value }))} style={adminInputStyle({ minHeight: "92px", padding: "12px 14px", resize: "vertical" })} />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Cancel reason</span>
            <input value={form.cancel_reason} onChange={(event) => setForm((prev) => ({ ...prev, cancel_reason: event.target.value }))} style={adminInputStyle()} placeholder="Optional reason for cancelled/expired subscriptions" />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button type="button" style={adminButtonStyle("ghost")} onClick={() => setShowEditor(false)}>
              Close
            </button>
            <button type="button" style={adminButtonStyle("primary")} onClick={() => void saveSubscription()} disabled={saving}>
              <CreditCard size={16} /> {saving ? "Saving..." : editingRow ? "Update subscription" : "Create subscription"}
            </button>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        open={showPlanEditor}
        onClose={() => {
          setShowPlanEditor(false);
          setPlanDraft(null);
        }}
        title={planDraft ? `Edit ${planDraft.name}` : "Edit pricing plan"}
        description="Persisted in backend platform settings. Public pricing consumers now read this configuration instead of browser local storage."
        width={860}
      >
        {planDraft ? (
          <div style={{ display: "grid", gap: "14px" }}>
            <div className="admin-form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Plan name</span>
                <input value={planDraft.name} onChange={(event) => setPlanDraft((prev) => prev ? { ...prev, name: event.target.value } : prev)} style={adminInputStyle()} />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>User band</span>
                <input value={planDraft.users} onChange={(event) => setPlanDraft((prev) => prev ? { ...prev, users: event.target.value } : prev)} style={adminInputStyle()} />
              </label>
            </div>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Description</span>
              <textarea value={planDraft.description} onChange={(event) => setPlanDraft((prev) => prev ? { ...prev, description: event.target.value } : prev)} style={adminInputStyle({ minHeight: "86px", padding: "12px 14px", resize: "vertical" })} />
            </label>
            <div className="admin-form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Monthly price</span>
                <input type="number" min="0" step="0.01" value={planDraft.priceMonthly} onChange={(event) => setPlanDraft((prev) => prev ? { ...prev, priceMonthly: event.target.value } : prev)} style={adminInputStyle()} />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Yearly price</span>
                <input type="number" min="0" step="0.01" value={planDraft.priceYearly} onChange={(event) => setPlanDraft((prev) => prev ? { ...prev, priceYearly: event.target.value } : prev)} style={adminInputStyle()} />
              </label>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-primary)", fontSize: "13px", fontWeight: 600 }}>
              <input type="checkbox" checked={planDraft.recommended} onChange={(event) => setPlanDraft((prev) => prev ? { ...prev, recommended: event.target.checked } : prev)} />
              Mark as recommended
            </label>
            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Feature matrix</span>
                <button
                  type="button"
                  style={adminButtonStyle("secondary", { minHeight: "34px", padding: "0 10px" })}
                  onClick={() => setPlanDraft((prev) => prev ? { ...prev, features: [...prev.features, { label: "", included: true }] } : prev)}
                >
                  <Plus size={14} /> Add feature
                </button>
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {planDraft.features.map((feature, index) => (
                  <div key={`${feature.label}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "10px", alignItems: "center" }}>
                    <input
                      value={feature.label}
                      onChange={(event) => setPlanDraft((prev) => prev ? {
                        ...prev,
                        features: prev.features.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item),
                      } : prev)}
                      placeholder="Feature description"
                      style={adminInputStyle()}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-subtle)", fontSize: "12px" }}>
                      <input
                        type="checkbox"
                        checked={feature.included}
                        onChange={(event) => setPlanDraft((prev) => prev ? {
                          ...prev,
                          features: prev.features.map((item, itemIndex) => itemIndex === index ? { ...item, included: event.target.checked } : item),
                        } : prev)}
                      />
                      Included
                    </label>
                    <button
                      type="button"
                      style={adminButtonStyle("ghost", { minHeight: "34px", padding: "0 10px" })}
                      onClick={() => setPlanDraft((prev) => prev ? { ...prev, features: prev.features.filter((_, itemIndex) => itemIndex !== index) } : prev)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" style={adminButtonStyle("ghost")} onClick={() => setShowPlanEditor(false)}>
                Close
              </button>
              <button type="button" style={adminButtonStyle("primary")} onClick={() => void savePlanDraft()} disabled={saving}>
                {saving ? "Saving..." : "Save pricing plan"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminModal>
    </div>
  );
}
