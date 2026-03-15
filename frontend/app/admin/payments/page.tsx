"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, CreditCard, DollarSign, Pencil, Plus, RefreshCcw, Wallet } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { type AdminWorkspaceRow } from "@/lib/admin-client-workspaces";
import { formatCompactMoney, formatDate, formatDateTime, formatMoney, readErrorMessage } from "@/lib/admin-utils";
import {
  AdminActionMenu,
  AdminDataTable,
  AdminDrawer,
  AdminEmptyState,
  AdminFilterBar,
  AdminMetricCard,
  AdminMetricGrid,
  AdminModal,
  AdminPageHero,
  AdminPill,
  AdminSectionCard,
  AdminTableHead,
  AdminTableRow,
  adminButtonStyle,
  adminInputStyle,
} from "@/components/admin/ui";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
type PaymentMethodType = "card" | "bank" | "wallet" | "manual" | "other";

type PaymentSummary = {
  total_payments: number;
  paid_count: number;
  pending_count: number;
  failed_count: number;
  refunded_count: number;
  paid_volume: number;
  pending_volume: number;
};

type PaymentRow = {
  id: number;
  account_id?: number | null;
  workspace_id?: string | null;
  business_name: string;
  owner_email?: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus | string;
  payment_method?: string | null;
  invoice_number?: string | null;
  transaction_id?: string | null;
  description?: string | null;
  paid_at?: string | null;
  created_at: string;
  linked_subscription_id?: number | null;
  linked_client_org_id?: number | null;
  plan_tier?: string | null;
  is_unlinked_legacy: boolean;
};

type PaymentMethod = {
  id: number;
  name: string;
  provider: string;
  method_type: PaymentMethodType;
  details?: string | null;
  fee_percent: number;
  fee_fixed: number;
  supports_refunds: boolean;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type MethodForm = {
  name: string;
  provider: string;
  method_type: PaymentMethodType;
  details: string;
  fee_percent: string;
  fee_fixed: string;
  supports_refunds: boolean;
  is_active: boolean;
  is_default: boolean;
};

type PaymentForm = {
  account_id: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  payment_method: string;
  description: string;
  invoice_number: string;
  transaction_id: string;
};

const EMPTY_METHOD_FORM: MethodForm = {
  name: "",
  provider: "",
  method_type: "card",
  details: "",
  fee_percent: "0",
  fee_fixed: "0",
  supports_refunds: true,
  is_active: true,
  is_default: false,
};

const EMPTY_PAYMENT_FORM: PaymentForm = {
  account_id: "",
  amount: "",
  currency: "USD",
  status: "pending",
  payment_method: "",
  description: "",
  invoice_number: "",
  transaction_id: "",
};

function statusTone(status: string): "accent" | "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "paid":
      return "success";
    case "pending":
      return "warning";
    case "failed":
      return "danger";
    case "refunded":
      return "neutral";
    default:
      return "neutral";
  }
}

export default function AdminPaymentsPage() {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspaceRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showMethodModal, setShowMethodModal] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [methodForm, setMethodForm] = useState<MethodForm>(EMPTY_METHOD_FORM);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(EMPTY_PAYMENT_FORM);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (methodFilter) params.set("method", methodFilter);
      if (accountFilter) params.set("account_id", accountFilter);
      if (query.trim()) params.set("q", query.trim());
      params.set("limit", "300");

      const [summaryRes, paymentsRes, methodsRes, workspacesRes] = await Promise.all([
        authFetch(`${API}/admin/payments/summary${accountFilter ? `?account_id=${accountFilter}` : ""}`),
        authFetch(`${API}/admin/payments?${params.toString()}`),
        authFetch(`${API}/admin/payment-methods`),
        authFetch(`${API}/admin/client-workspaces?limit=300`),
      ]);

      if (!summaryRes.ok || !paymentsRes.ok || !methodsRes.ok || !workspacesRes.ok) {
        throw new Error("Failed to load payments operations");
      }

      setSummary((await summaryRes.json()) as PaymentSummary);
      setPayments((await paymentsRes.json()) as PaymentRow[]);
      setMethods((await methodsRes.json()) as PaymentMethod[]);
      setWorkspaces((await workspacesRes.json()) as AdminWorkspaceRow[]);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load payment operations."));
      setSummary(null);
      setPayments([]);
      setMethods([]);
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, [accountFilter, methodFilter, query, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const workspaceOptions = useMemo(() => workspaces.map((item) => ({ id: item.id, label: `${item.business_name} · #${item.id}` })), [workspaces]);
  const activeMethods = useMemo(() => methods.filter((item) => item.is_active), [methods]);
  const pendingRows = useMemo(() => payments.filter((item) => item.status === "pending"), [payments]);
  const failedRows = useMemo(() => payments.filter((item) => item.status === "failed"), [payments]);

  const openCreatePayment = () => {
    setPaymentForm({
      ...EMPTY_PAYMENT_FORM,
      account_id: accountFilter || "",
      payment_method: activeMethods.find((item) => item.is_default)?.name || activeMethods[0]?.name || "",
    });
    setShowPaymentModal(true);
  };

  const openMethodEditor = (method?: PaymentMethod) => {
    setEditingMethod(method || null);
    setMethodForm(
      method
        ? {
            name: method.name,
            provider: method.provider,
            method_type: method.method_type,
            details: method.details || "",
            fee_percent: String(method.fee_percent),
            fee_fixed: String(method.fee_fixed),
            supports_refunds: method.supports_refunds,
            is_active: method.is_active,
            is_default: method.is_default,
          }
        : EMPTY_METHOD_FORM,
    );
    setShowMethodModal(true);
  };

  const saveMethod = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!methodForm.name.trim()) throw new Error("Method name is required.");
      if (!methodForm.provider.trim()) throw new Error("Provider is required.");
      const response = await authFetch(`${API}${editingMethod ? `/admin/payment-methods/${editingMethod.id}` : "/admin/payment-methods"}`, {
        method: editingMethod ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: methodForm.name.trim(),
          provider: methodForm.provider.trim(),
          method_type: methodForm.method_type,
          details: methodForm.details.trim() || null,
          fee_percent: Number(methodForm.fee_percent || 0),
          fee_fixed: Number(methodForm.fee_fixed || 0),
          supports_refunds: methodForm.supports_refunds,
          is_active: methodForm.is_active,
          is_default: methodForm.is_default,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to save payment method");
      }
      setNotice(editingMethod ? "Payment method updated." : "Payment method created.");
      setShowMethodModal(false);
      setEditingMethod(null);
      setMethodForm(EMPTY_METHOD_FORM);
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not save payment method."));
    } finally {
      setSaving(false);
    }
  };

  const savePayment = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!/^\d+$/.test(paymentForm.account_id.trim())) throw new Error("A workspace account is required.");
      if (!paymentForm.amount.trim() || Number(paymentForm.amount) <= 0) throw new Error("Amount must be greater than 0.");
      const response = await authFetch(`${API}/admin/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: Number(paymentForm.account_id),
          amount: Number(paymentForm.amount),
          currency: paymentForm.currency.toUpperCase(),
          status: paymentForm.status,
          payment_method: paymentForm.payment_method || null,
          description: paymentForm.description.trim() || null,
          invoice_number: paymentForm.invoice_number.trim() || null,
          transaction_id: paymentForm.transaction_id.trim() || null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to create payment");
      }
      setNotice("Payment created.");
      setShowPaymentModal(false);
      setPaymentForm(EMPTY_PAYMENT_FORM);
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not create payment."));
    } finally {
      setSaving(false);
    }
  };

  const updatePaymentStatus = async (payment: PaymentRow, status: PaymentStatus) => {
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`${API}/admin/payments/${payment.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, paid_at: status === "paid" ? new Date().toISOString() : null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update payment status");
      }
      setNotice(`Payment #${payment.id} marked ${status}.`);
      await loadData();
      if (selectedPayment?.id === payment.id) {
        const updated = (await response.json().catch(() => null)) as PaymentRow | null;
        if (updated) setSelectedPayment(updated);
      }
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update payment status."));
    }
  };

  const setMethodAsDefault = async (methodId: number) => {
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`${API}/admin/payment-methods/${methodId}/default`, { method: "PATCH" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to set default method");
      }
      setNotice("Default payment method updated.");
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update default method."));
    }
  };

  const toggleMethod = async (method: PaymentMethod, isActive: boolean) => {
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`${API}/admin/payment-methods/${method.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update method status");
      }
      setNotice(`${method.name} ${isActive ? "enabled" : "disabled"}.`);
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update payment method status."));
    }
  };

  const copyText = async (value?: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
    } catch {
      setError("Could not copy this value.");
    }
  };

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1540px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <AdminPageHero
        eyebrow="Billing Operations"
        title="Payments"
        subtitle="Run workspace-linked payment operations, triage pending and failed collections, and manage the platform’s payment rails."
        actions={
          <>
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => void loadData()}>
              <RefreshCcw size={16} /> Refresh
            </button>
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => openMethodEditor()}>
              <Wallet size={16} /> Add Method
            </button>
            <button type="button" style={adminButtonStyle("primary")} onClick={openCreatePayment}>
              <Plus size={16} /> Add Payment
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
        <AdminMetricCard label="Total payments" value={summary?.total_payments ?? 0} detail="All workspace-linked payment records" tone="accent" />
        <AdminMetricCard label="Paid" value={summary?.paid_count ?? 0} detail={formatMoney(summary?.paid_volume ?? 0)} tone="success" />
        <AdminMetricCard label="Pending" value={summary?.pending_count ?? 0} detail={formatMoney(summary?.pending_volume ?? 0)} tone="warning" />
        <AdminMetricCard label="Failed" value={summary?.failed_count ?? 0} detail={`${failedRows.length} in current ledger view`} tone="danger" />
        <AdminMetricCard label="Refunded" value={summary?.refunded_count ?? 0} detail="Chargeback / manual refund backlog" tone="neutral" />
        <AdminMetricCard label="Collections focus" value={pendingRows.length + failedRows.length} detail="Pending + failed items needing action" tone="warning" />
      </AdminMetricGrid>

      <div style={{ display: "grid", gridTemplateColumns: "1.65fr 1fr", gap: "18px", alignItems: "start" }}>
        <AdminSectionCard title="Payments ledger" description="Inspect live payment flow by workspace account, status, method, and billing context.">
          <AdminFilterBar>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, workspace, owner, invoice, transaction..." style={adminInputStyle({ flex: 2, minWidth: "240px" })} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={adminInputStyle({ flex: 1, minWidth: "160px" })}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} style={adminInputStyle({ flex: 1, minWidth: "180px" })}>
              <option value="">All methods</option>
              {methods.map((method) => (
                <option key={method.id} value={method.name.toLowerCase()}>{method.name}</option>
              ))}
            </select>
            <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} style={adminInputStyle({ flex: 1.2, minWidth: "210px" })}>
              <option value="">All workspaces</option>
              {workspaceOptions.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.label}</option>
              ))}
            </select>
          </AdminFilterBar>

          {payments.length ? (
            <AdminDataTable>
              <AdminTableHead
                columns={[
                  <span key="company">Company</span>,
                  <span key="amount">Amount</span>,
                  <span key="method">Method</span>,
                  <span key="status">Status</span>,
                  <span key="timestamps">Created / Paid</span>,
                  <span key="actions">Actions</span>,
                ]}
              />
              {payments.map((payment) => (
                <AdminTableRow key={payment.id} style={{ gridTemplateColumns: "1.45fr 0.8fr 0.95fr 0.8fr 1fr 1fr" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedPayment(payment)}
                      style={{
                        background: "none",
                        border: 0,
                        padding: 0,
                        margin: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        color: "var(--text-primary)",
                        fontWeight: 700,
                        fontSize: "15px",
                      }}
                    >
                      {payment.business_name}
                    </button>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <span>{payment.workspace_id || "Legacy record"}</span>
                      <span>{payment.owner_email || "No owner email"}</span>
                      {payment.is_unlinked_legacy ? <AdminPill label="Legacy unlink" tone="danger" /> : null}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{payment.currency} {Number(payment.amount).toLocaleString()}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{payment.plan_tier || "No plan"}</span>
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{payment.payment_method || "Manual / missing"}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{payment.invoice_number || "No invoice"}</span>
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <AdminPill label={payment.status} tone={statusTone(payment.status)} />
                    <select
                      value={payment.status}
                      onChange={(event) => void updatePaymentStatus(payment, event.target.value as PaymentStatus)}
                      style={adminInputStyle({ minHeight: "36px", fontSize: "12px", padding: "0 10px" })}
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="failed">Failed</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>Created {formatDate(payment.created_at)}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Paid {formatDate(payment.paid_at)}</span>
                  </div>
                  <AdminActionMenu>
                    {payment.account_id ? (
                      <Link href={`/admin/clients/${payment.account_id}`} style={adminButtonStyle("secondary", { minHeight: "36px", padding: "0 10px" })}>
                        Open
                      </Link>
                    ) : null}
                    <button type="button" style={adminButtonStyle("ghost", { minHeight: "36px", padding: "0 10px" })} onClick={() => setSelectedPayment(payment)}>
                      Details
                    </button>
                  </AdminActionMenu>
                </AdminTableRow>
              ))}
            </AdminDataTable>
          ) : (
            <AdminEmptyState
              title={loading ? "Loading payments..." : "No payments match the current filters"}
              description="Change filters, add a payment, or connect missing billing context from the client workspace surface."
              action={<button type="button" style={adminButtonStyle("primary")} onClick={openCreatePayment}><Plus size={16} /> Add Payment</button>}
            />
          )}
        </AdminSectionCard>

        <div style={{ display: "grid", gap: "18px" }}>
          <AdminSectionCard title="Payment methods" description="Global payment rails used by the platform billing layer.">
            <div style={{ display: "grid", gap: "12px" }}>
              {methods.length ? methods.map((method) => (
                <div key={method.id} className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "10px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>{method.name}</span>
                        {method.is_default ? <AdminPill label="Default" tone="success" /> : null}
                        <AdminPill label={method.is_active ? "Active" : "Disabled"} tone={method.is_active ? "success" : "neutral"} />
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--text-subtle)" }}>
                        {method.provider} · {method.method_type} · {method.fee_percent}% + ${method.fee_fixed}
                      </div>
                    </div>
                    <button type="button" style={adminButtonStyle("secondary", { minHeight: "36px", padding: "0 10px" })} onClick={() => openMethodEditor(method)}>
                      <Pencil size={14} /> Edit
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {!method.is_default ? (
                      <button type="button" style={adminButtonStyle("ghost", { minHeight: "34px", padding: "0 10px" })} onClick={() => void setMethodAsDefault(method.id)}>
                        <CheckCircle2 size={14} /> Set default
                      </button>
                    ) : null}
                    <button type="button" style={adminButtonStyle(method.is_active ? "danger" : "secondary", { minHeight: "34px", padding: "0 10px" })} onClick={() => void toggleMethod(method, !method.is_active)}>
                      {method.is_active ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              )) : <AdminEmptyState title="No payment methods configured" description="Create at least one active method before issuing live payments." />}
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Collections queue" description="Quick operational read on payment items that still need intervention.">
            <div style={{ display: "grid", gap: "10px" }}>
              <div className="admin-ui-surface" style={{ padding: "14px", display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Pending collection</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{pendingRows.length}</div>
                </div>
                <DollarSign size={18} color="#fbbf24" />
              </div>
              <div className="admin-ui-surface" style={{ padding: "14px", display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Failed charges</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{failedRows.length}</div>
                </div>
                <CreditCard size={18} color="var(--danger)" />
              </div>
            </div>
          </AdminSectionCard>
        </div>
      </div>

      <AdminModal
        open={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentForm(EMPTY_PAYMENT_FORM);
        }}
        title="Create payment"
        description="Create a payment against a workspace account. The backend resolves the linked billing context and keeps the compatibility tables in sync."
        width={760}
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Workspace account</span>
              <select value={paymentForm.account_id} onChange={(event) => setPaymentForm((prev) => ({ ...prev, account_id: event.target.value }))} style={adminInputStyle()}>
                <option value="">Select workspace</option>
                {workspaceOptions.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Amount</span>
              <input value={paymentForm.amount} onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))} type="number" min="0" step="0.01" style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Currency</span>
              <input value={paymentForm.currency} onChange={(event) => setPaymentForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))} style={adminInputStyle()} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Status</span>
              <select value={paymentForm.status} onChange={(event) => setPaymentForm((prev) => ({ ...prev, status: event.target.value as PaymentStatus }))} style={adminInputStyle()}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Payment method</span>
              <select value={paymentForm.payment_method} onChange={(event) => setPaymentForm((prev) => ({ ...prev, payment_method: event.target.value }))} style={adminInputStyle()}>
                <option value="">Manual / not specified</option>
                {activeMethods.map((method) => <option key={method.id} value={method.name}>{method.name}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Description</span>
            <textarea value={paymentForm.description} onChange={(event) => setPaymentForm((prev) => ({ ...prev, description: event.target.value }))} style={adminInputStyle({ minHeight: "86px", padding: "12px 14px", resize: "vertical" })} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Invoice number</span>
              <input value={paymentForm.invoice_number} onChange={(event) => setPaymentForm((prev) => ({ ...prev, invoice_number: event.target.value }))} style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Transaction ID</span>
              <input value={paymentForm.transaction_id} onChange={(event) => setPaymentForm((prev) => ({ ...prev, transaction_id: event.target.value }))} style={adminInputStyle()} />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button type="button" style={adminButtonStyle("ghost")} onClick={() => setShowPaymentModal(false)}>Close</button>
            <button type="button" style={adminButtonStyle("primary")} onClick={() => void savePayment()} disabled={saving}>
              <Plus size={16} /> {saving ? "Saving..." : "Create payment"}
            </button>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        open={showMethodModal}
        onClose={() => {
          setShowMethodModal(false);
          setEditingMethod(null);
          setMethodForm(EMPTY_METHOD_FORM);
        }}
        title={editingMethod ? `Edit ${editingMethod.name}` : "Add payment method"}
        description="Manage the global payment rails exposed to platform billing operations."
        width={760}
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Method name</span>
              <input value={methodForm.name} onChange={(event) => setMethodForm((prev) => ({ ...prev, name: event.target.value }))} style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Provider</span>
              <input value={methodForm.provider} onChange={(event) => setMethodForm((prev) => ({ ...prev, provider: event.target.value }))} style={adminInputStyle()} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Type</span>
              <select value={methodForm.method_type} onChange={(event) => setMethodForm((prev) => ({ ...prev, method_type: event.target.value as PaymentMethodType }))} style={adminInputStyle()}>
                <option value="card">Card</option>
                <option value="bank">Bank</option>
                <option value="wallet">Wallet</option>
                <option value="manual">Manual</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Fee %</span>
              <input value={methodForm.fee_percent} onChange={(event) => setMethodForm((prev) => ({ ...prev, fee_percent: event.target.value }))} type="number" min="0" step="0.01" style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Fixed fee</span>
              <input value={methodForm.fee_fixed} onChange={(event) => setMethodForm((prev) => ({ ...prev, fee_fixed: event.target.value }))} type="number" min="0" step="0.01" style={adminInputStyle()} />
            </label>
          </div>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Operational notes</span>
            <textarea value={methodForm.details} onChange={(event) => setMethodForm((prev) => ({ ...prev, details: event.target.value }))} style={adminInputStyle({ minHeight: "86px", padding: "12px 14px", resize: "vertical" })} />
          </label>
          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)", fontSize: "13px" }}>
              <input type="checkbox" checked={methodForm.supports_refunds} onChange={(event) => setMethodForm((prev) => ({ ...prev, supports_refunds: event.target.checked }))} />
              Supports refunds
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)", fontSize: "13px" }}>
              <input type="checkbox" checked={methodForm.is_active} onChange={(event) => setMethodForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
              Active
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)", fontSize: "13px" }}>
              <input type="checkbox" checked={methodForm.is_default} onChange={(event) => setMethodForm((prev) => ({ ...prev, is_default: event.target.checked }))} />
              Default method
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button type="button" style={adminButtonStyle("ghost")} onClick={() => setShowMethodModal(false)}>Close</button>
            <button type="button" style={adminButtonStyle("primary")} onClick={() => void saveMethod()} disabled={saving}>
              {saving ? "Saving..." : editingMethod ? "Update method" : "Create method"}
            </button>
          </div>
        </div>
      </AdminModal>

      <AdminDrawer
        open={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
        title={selectedPayment ? `Payment #${selectedPayment.id}` : "Payment detail"}
        description={selectedPayment ? `${selectedPayment.business_name} · ${selectedPayment.workspace_id || "legacy"}` : undefined}
        width={560}
      >
        {selectedPayment ? (
          <div style={{ display: "grid", gap: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="admin-ui-surface" style={{ padding: "14px" }}>
                <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Amount</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginTop: "6px" }}>{selectedPayment.currency} {Number(selectedPayment.amount).toLocaleString()}</div>
              </div>
              <div className="admin-ui-surface" style={{ padding: "14px" }}>
                <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Status</div>
                <div style={{ marginTop: "8px" }}><AdminPill label={selectedPayment.status} tone={statusTone(selectedPayment.status)} /></div>
              </div>
            </div>

            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "10px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Workspace context</div>
              <div style={{ display: "grid", gap: "8px", fontSize: "13px" }}>
                <div><strong>Company:</strong> {selectedPayment.business_name}</div>
                <div><strong>Workspace:</strong> {selectedPayment.workspace_id || "Legacy / unlinked"}</div>
                <div><strong>Owner:</strong> {selectedPayment.owner_email || "No owner email"}</div>
                <div><strong>Plan:</strong> {selectedPayment.plan_tier || "No plan tier"}</div>
                <div><strong>Linked subscription:</strong> {selectedPayment.linked_subscription_id || "—"}</div>
                <div><strong>Linked client org:</strong> {selectedPayment.linked_client_org_id || "—"}</div>
              </div>
              {selectedPayment.account_id ? (
                <Link href={`/admin/clients/${selectedPayment.account_id}`} style={adminButtonStyle("secondary", { width: "fit-content" })}>
                  Open client console
                </Link>
              ) : null}
            </div>

            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "10px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Payment metadata</div>
              <div style={{ display: "grid", gap: "8px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span>Invoice number</span>
                  <button type="button" style={adminButtonStyle("ghost", { minHeight: "32px", padding: "0 8px" })} onClick={() => void copyText(selectedPayment.invoice_number)}>
                    <Copy size={14} /> {selectedPayment.invoice_number || "None"}
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span>Transaction ID</span>
                  <button type="button" style={adminButtonStyle("ghost", { minHeight: "32px", padding: "0 8px" })} onClick={() => void copyText(selectedPayment.transaction_id)}>
                    <Copy size={14} /> {selectedPayment.transaction_id || "None"}
                  </button>
                </div>
                <div><strong>Created:</strong> {formatDateTime(selectedPayment.created_at)}</div>
                <div><strong>Paid:</strong> {formatDateTime(selectedPayment.paid_at)}</div>
                <div><strong>Method:</strong> {selectedPayment.payment_method || "Manual / missing"}</div>
                <div><strong>Description:</strong> {selectedPayment.description || "—"}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {(["pending", "paid", "failed", "refunded"] as const).map((status) => (
                <button key={status} type="button" style={adminButtonStyle(selectedPayment.status === status ? "primary" : "secondary", { minHeight: "36px", padding: "0 10px" })} onClick={() => void updatePaymentStatus(selectedPayment, status)}>
                  {status}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </AdminDrawer>
    </div>
  );
}
