"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, CreditCard, RefreshCcw } from "lucide-react";
import {
  DEFAULT_PRICING_PLANS,
  PRICING_STORAGE_KEY,
  clonePricingPlans,
  normalizePricingPlan,
  type PricingPlanDefinition,
} from "@/lib/pricing-plans";

const API = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `/api` : "http://localhost:8000");

type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
type PaymentMethodType = "card" | "bank" | "wallet" | "manual" | "other";

type Payment = {
  id: number;
  client_id: number;
  subscription_id?: number | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method?: string | null;
  transaction_id?: string | null;
  description?: string | null;
  invoice_number?: string | null;
  paid_at?: string | null;
  created_at: string;
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

type PaymentSummary = {
  total_payments: number;
  paid_count: number;
  pending_count: number;
  failed_count: number;
  refunded_count: number;
  paid_volume: number;
  pending_volume: number;
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
  client_id: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  payment_method: string;
  description: string;
  invoice_number: string;
  transaction_id: string;
};

type PricingPlanForm = {
  id: string;
  name: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  users: string;
  recommended: boolean;
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
  client_id: "",
  amount: "",
  currency: "USD",
  status: "pending",
  payment_method: "",
  description: "",
  invoice_number: "",
  transaction_id: "",
};

export default function AdminPaymentsPage() {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | PaymentStatus>("");
  const [clientFilter, setClientFilter] = useState("");
  const [queryClientFilter, setQueryClientFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showMethodModal, setShowMethodModal] = useState(false);
  const [editingMethodId, setEditingMethodId] = useState<number | null>(null);
  const [methodForm, setMethodForm] = useState<MethodForm>(EMPTY_METHOD_FORM);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(EMPTY_PAYMENT_FORM);
  const [pricingPlans, setPricingPlans] = useState<PricingPlanDefinition[]>(() => clonePricingPlans(DEFAULT_PRICING_PLANS));
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState<PricingPlanForm | null>(null);

  const activeMethods = useMemo(() => methods.filter((m) => m.is_active), [methods]);
  const paymentMethodTableColumns = "minmax(180px, 1.1fr) 0.8fr 0.8fr 0.8fr minmax(220px, 1fr)";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (/^\d+$/.test(queryClientFilter.trim())) {
      params.set("client_id", queryClientFilter.trim());
    }
    params.set("limit", "300");
    try {
      const [summaryRes, paymentsRes, methodsRes] = await Promise.all([
        fetch(`${API}/admin/payments/summary`),
        fetch(`${API}/admin/payments?${params.toString()}`),
        fetch(`${API}/admin/payment-methods`),
      ]);

      setSummary(summaryRes.ok ? ((await summaryRes.json()) as PaymentSummary) : null);
      setPayments(paymentsRes.ok ? ((await paymentsRes.json()) as Payment[]) : []);
      setMethods(methodsRes.ok ? ((await methodsRes.json()) as PaymentMethod[]) : []);
    } catch (e) {
      console.error("Failed to load payments admin data", e);
      setError("Could not load payments data.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, queryClientFilter]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(PRICING_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .map(normalizePricingPlan)
        .filter((row): row is PricingPlanDefinition => Boolean(row));
      if (normalized.length) {
        setPricingPlans(normalized);
      }
    } catch (e) {
      console.warn("Could not load pricing plan configuration from local storage", e);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(pricingPlans));
  }, [pricingPlans]);

  const submitMethod = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        name: methodForm.name,
        provider: methodForm.provider,
        method_type: methodForm.method_type,
        details: methodForm.details || null,
        fee_percent: Number(methodForm.fee_percent || "0"),
        fee_fixed: Number(methodForm.fee_fixed || "0"),
        supports_refunds: methodForm.supports_refunds,
        is_active: methodForm.is_active,
        is_default: methodForm.is_default,
      };
      const path = editingMethodId ? `/admin/payment-methods/${editingMethodId}` : "/admin/payment-methods";
      const method = editingMethodId ? "PUT" : "POST";
      const res = await fetch(`${API}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to save payment method");
      }
      setShowMethodModal(false);
      setEditingMethodId(null);
      setMethodForm(EMPTY_METHOD_FORM);
      setNotice("Payment method saved.");
      await loadData();
    } catch (e: unknown) {
      setError(readErrorMessage(e, "Failed to save payment method."));
    } finally {
      setSaving(false);
    }
  };

  const submitPayment = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!/^\d+$/.test(paymentForm.client_id.trim())) {
        throw new Error("Client ID must be a valid number.");
      }
      if (!paymentForm.amount.trim() || Number(paymentForm.amount) <= 0) {
        throw new Error("Amount must be greater than 0.");
      }
      const res = await fetch(`${API}/admin/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: Number(paymentForm.client_id),
          amount: Number(paymentForm.amount),
          currency: paymentForm.currency.toUpperCase(),
          status: paymentForm.status,
          payment_method: paymentForm.payment_method || null,
          description: paymentForm.description || null,
          invoice_number: paymentForm.invoice_number || null,
          transaction_id: paymentForm.transaction_id || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to create payment");
      }
      setShowPaymentModal(false);
      setPaymentForm(EMPTY_PAYMENT_FORM);
      setNotice("Payment created.");
      await loadData();
    } catch (e: unknown) {
      setError(readErrorMessage(e, "Failed to create payment."));
    } finally {
      setSaving(false);
    }
  };

  const updatePaymentStatus = async (paymentId: number, status: PaymentStatus) => {
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API}/admin/payments/${paymentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update payment status");
      }
      setNotice("Payment status updated.");
      await loadData();
    } catch (e: unknown) {
      setError(readErrorMessage(e, "Failed to update payment status."));
    }
  };

  const setDefaultMethod = async (methodId: number) => {
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API}/admin/payment-methods/${methodId}/default`, { method: "PATCH" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to set default method");
      }
      setNotice("Default payment method updated.");
      await loadData();
    } catch (e: unknown) {
      setError(readErrorMessage(e, "Failed to set default payment method."));
    }
  };

  const toggleMethodStatus = async (method: PaymentMethod, isActive: boolean) => {
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API}/admin/payment-methods/${method.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update method status");
      }
      setNotice("Payment method status updated.");
      await loadData();
    } catch (e: unknown) {
      setError(readErrorMessage(e, "Failed to update payment method status."));
    }
  };

  const openEditMethod = (method: PaymentMethod) => {
    setEditingMethodId(method.id);
    setMethodForm({
      name: method.name,
      provider: method.provider,
      method_type: method.method_type,
      details: method.details || "",
      fee_percent: String(method.fee_percent),
      fee_fixed: String(method.fee_fixed),
      supports_refunds: method.supports_refunds,
      is_active: method.is_active,
      is_default: method.is_default,
    });
    setShowMethodModal(true);
  };

  const openCreateMethod = () => {
    setEditingMethodId(null);
    setMethodForm(EMPTY_METHOD_FORM);
    setShowMethodModal(true);
  };

  const openCreatePayment = () => {
    const defaultMethod = methods.find((m) => m.is_default && m.is_active) || methods.find((m) => m.is_active);
    setPaymentForm((prev) => ({
      ...EMPTY_PAYMENT_FORM,
      currency: summary ? "USD" : prev.currency,
      payment_method: defaultMethod?.name || "",
    }));
    setShowPaymentModal(true);
  };

  const openEditPricingPlan = (plan: PricingPlanDefinition) => {
    setPlanForm({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price_monthly: String(plan.priceMonthly),
      price_yearly: String(plan.priceYearly),
      users: plan.users,
      recommended: Boolean(plan.recommended),
    });
    setShowPlanModal(true);
  };

  const submitPricingPlan = () => {
    if (!planForm) return;
    const monthly = Number(planForm.price_monthly);
    const yearly = Number(planForm.price_yearly);
    if (!Number.isFinite(monthly) || monthly < 0) {
      setError("Monthly price must be 0 or greater.");
      return;
    }
    if (!Number.isFinite(yearly) || yearly < 0) {
      setError("Yearly price must be 0 or greater.");
      return;
    }
    setPricingPlans((prev) =>
      prev.map((plan) =>
        plan.id === planForm.id
          ? {
              ...plan,
              name: planForm.name.trim() || plan.name,
              description: planForm.description.trim() || plan.description,
              users: planForm.users.trim() || plan.users,
              priceMonthly: monthly,
              priceYearly: yearly,
              recommended: planForm.recommended,
            }
          : { ...plan, recommended: planForm.recommended ? false : plan.recommended },
      ),
    );
    setNotice("Pricing plan updated for platform pricing views.");
    setError("");
    setShowPlanModal(false);
    setPlanForm(null);
  };

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1450px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Payments</h1>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
            Manage transactions, statuses, and payment methods for all client organizations.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" style={secondaryBtn} onClick={() => void loadData()}>
            <RefreshCcw size={12} /> Refresh
          </button>
          <button type="button" style={secondaryBtn} onClick={openCreateMethod}>
            <CreditCard size={13} /> Add Method
          </button>
          <button type="button" style={primaryBtn} onClick={openCreatePayment}>
            <Plus size={13} /> Add Payment
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "9px",
            border: error ? "1px solid rgba(248,113,113,0.25)" : "1px solid rgba(52,211,153,0.25)",
            background: error ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)",
            color: error ? "#f87171" : "#34d399",
            fontSize: "12px",
          }}
        >
          {error || notice}
        </div>
      )}

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "10px", marginBottom: "16px" }}>
          {[
            { label: "Total Payments", value: summary.total_payments, color: "var(--accent)" },
            { label: "Paid", value: summary.paid_count, color: "#34d399" },
            { label: "Pending", value: summary.pending_count, color: "#fbbf24" },
            { label: "Failed", value: summary.failed_count, color: "#f87171" },
            { label: "Refunded", value: summary.refunded_count, color: "#60a5fa" },
            { label: "Paid Volume", value: `$${summary.paid_volume.toLocaleString()}`, color: "#34d399" },
            { label: "Pending Volume", value: `$${summary.pending_volume.toLocaleString()}`, color: "#f59e0b" },
          ].map((card) => (
            <div key={card.label} style={kpiCard(card.color)}>
              <div style={{ fontSize: "10px", color: "var(--text-subtle)", marginBottom: "6px" }}>{card.label}</div>
              <div style={{ fontSize: "20px", color: "var(--text-primary)", fontWeight: 700 }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
        <section style={panelStyle}>
          <div style={panelHeader}>Payment Methods</div>
          <div style={tableHead(paymentMethodTableColumns)}>
            {["Method", "Type", "Fees", "Status", "Actions"].map((h) => (
              <span key={h} style={thStyle}>
                {h}
              </span>
            ))}
          </div>
          {methods.map((method) => (
            <div key={method.id} style={tableRow(paymentMethodTableColumns)}>
              <span style={{ fontSize: "12px", color: "var(--text-primary)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                {method.name}
                {method.is_default && (
                  <span style={{ fontSize: "10px", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)", borderRadius: "999px", padding: "1px 6px" }}>
                    Default
                  </span>
                )}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{method.method_type}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {method.fee_percent}% + ${method.fee_fixed}
              </span>
              <span style={{ fontSize: "12px", color: method.is_active ? "#34d399" : "var(--text-muted)" }}>
                {method.is_active ? "Active" : "Inactive"}
              </span>
              <div style={methodActionCellStyle}>
                <button
                  type="button"
                  onClick={() => openEditMethod(method)}
                  style={miniBtn}
                >
                  Edit
                </button>
                {!method.is_default && method.is_active && (
                  <button
                    type="button"
                    onClick={() => void setDefaultMethod(method.id)}
                    style={miniBtn}
                  >
                    Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void toggleMethodStatus(method, !method.is_active)}
                  style={miniBtn}
                >
                  {method.is_active ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
          ))}
        </section>

        <section style={panelStyle}>
          <div style={panelHeader}>Payments</div>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #1e1e2a", display: "flex", gap: "8px" }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | PaymentStatus)} style={inputStyle}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <input
              placeholder="Client ID"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setQueryClientFilter(clientFilter.replace(/\D/g, ""))}
              style={miniBtn}
            >
              Apply
            </button>
          </div>
          <div style={tableHead("0.7fr 1fr 0.8fr 0.8fr 120px")}>
            {["Client", "Amount", "Method", "Status", "Actions"].map((h) => (
              <span key={h} style={thStyle}>
                {h}
              </span>
            ))}
          </div>
          {payments.map((payment) => (
            <div key={payment.id} style={tableRow("0.7fr 1fr 0.8fr 0.8fr 120px")}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>#{payment.client_id}</span>
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                {payment.currency} {payment.amount.toLocaleString()}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{payment.payment_method || "—"}</span>
              <span style={{ fontSize: "12px", color: statusColor(payment.status) }}>{payment.status}</span>
              <select
                value={payment.status}
                onChange={(e) => void updatePaymentStatus(payment.id, e.target.value as PaymentStatus)}
                style={{ ...inputStyle, height: "28px", fontSize: "11px" }}
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
          ))}
          {!payments.length && !loading && (
            <div style={{ padding: "12px", fontSize: "12px", color: "var(--text-muted)" }}>No payments match the current filters.</div>
          )}
        </section>
      </div>

      <section style={{ ...panelStyle, marginBottom: "16px" }}>
        <div style={panelHeader}>Pricing Plans</div>
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #1a1a24",
            fontSize: "12px",
            color: "var(--text-subtle)",
          }}
        >
          Update public plan names, pricing, and seat limits used by the platform pricing presentation.
        </div>
        <div style={tableHead("1.2fr 0.7fr 0.7fr 0.8fr 130px")}>
          {["Plan", "Monthly", "Yearly", "Seats", "Actions"].map((h) => (
            <span key={h} style={thStyle}>
              {h}
            </span>
          ))}
        </div>
        {pricingPlans.map((plan) => (
          <div key={plan.id} style={tableRow("1.2fr 0.7fr 0.7fr 0.8fr 130px")}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>
                {plan.name}
                {plan.recommended ? (
                  <span
                    style={{
                      marginLeft: "6px",
                      fontSize: "10px",
                      color: "#60a5fa",
                      border: "1px solid rgba(96,165,250,0.35)",
                      borderRadius: "999px",
                      padding: "1px 6px",
                    }}
                  >
                    Recommended
                  </span>
                ) : null}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{plan.description}</span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>${plan.priceMonthly}</span>
            <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>${plan.priceYearly}</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{plan.users}</span>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => openEditPricingPlan(plan)} style={miniBtn}>
                Edit Plan
              </button>
            </div>
          </div>
        ))}
      </section>

      {showMethodModal && (
        <Modal title={editingMethodId ? "Edit Payment Method" : "Add Payment Method"} onClose={() => setShowMethodModal(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <input
              placeholder="Method name"
              value={methodForm.name}
              onChange={(e) => setMethodForm((f) => ({ ...f, name: e.target.value }))}
              style={inputStyle}
            />
            <input
              placeholder="Provider"
              value={methodForm.provider}
              onChange={(e) => setMethodForm((f) => ({ ...f, provider: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <select
              value={methodForm.method_type}
              onChange={(e) => setMethodForm((f) => ({ ...f, method_type: e.target.value as PaymentMethodType }))}
              style={inputStyle}
            >
              <option value="card">Card</option>
              <option value="bank">Bank</option>
              <option value="wallet">Wallet</option>
              <option value="manual">Manual</option>
              <option value="other">Other</option>
            </select>
            <input
              type="number"
              step="0.1"
              min={0}
              max={100}
              placeholder="Fee %"
              value={methodForm.fee_percent}
              onChange={(e) => setMethodForm((f) => ({ ...f, fee_percent: e.target.value }))}
              style={inputStyle}
            />
            <input
              type="number"
              step="0.01"
              min={0}
              placeholder="Fixed fee"
              value={methodForm.fee_fixed}
              onChange={(e) => setMethodForm((f) => ({ ...f, fee_fixed: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <input
            placeholder="Details (masked, optional)"
            value={methodForm.details}
            onChange={(e) => setMethodForm((f) => ({ ...f, details: e.target.value }))}
            style={{ ...inputStyle, marginBottom: "10px" }}
          />
          <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "var(--text-muted)", marginBottom: "14px" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <input
                type="checkbox"
                checked={methodForm.supports_refunds}
                onChange={(e) => setMethodForm((f) => ({ ...f, supports_refunds: e.target.checked }))}
              />
              Supports refunds
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <input
                type="checkbox"
                checked={methodForm.is_active}
                onChange={(e) => setMethodForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <input
                type="checkbox"
                checked={methodForm.is_default}
                onChange={(e) => setMethodForm((f) => ({ ...f, is_default: e.target.checked }))}
              />
              Default
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button type="button" onClick={() => setShowMethodModal(false)} style={secondaryBtn}>
              Cancel
            </button>
            <button type="button" onClick={() => void submitMethod()} disabled={saving} style={primaryBtn}>
              {saving ? "Saving..." : "Save Method"}
            </button>
          </div>
        </Modal>
      )}

      {showPlanModal && planForm && (
        <Modal title={`Edit ${planForm.name} Plan`} onClose={() => setShowPlanModal(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <input
              placeholder="Plan name"
              value={planForm.name}
              onChange={(e) => setPlanForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              style={inputStyle}
            />
            <input
              placeholder="Seat limit summary"
              value={planForm.users}
              onChange={(e) => setPlanForm((prev) => (prev ? { ...prev, users: e.target.value } : prev))}
              style={inputStyle}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <input
              type="number"
              min={0}
              step="1"
              placeholder="Monthly price"
              value={planForm.price_monthly}
              onChange={(e) => setPlanForm((prev) => (prev ? { ...prev, price_monthly: e.target.value } : prev))}
              style={inputStyle}
            />
            <input
              type="number"
              min={0}
              step="1"
              placeholder="Yearly price"
              value={planForm.price_yearly}
              onChange={(e) => setPlanForm((prev) => (prev ? { ...prev, price_yearly: e.target.value } : prev))}
              style={inputStyle}
            />
          </div>
          <textarea
            rows={3}
            placeholder="Plan description"
            value={planForm.description}
            onChange={(e) => setPlanForm((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
            style={{ ...inputStyle, height: "auto", padding: "8px 10px", marginBottom: "12px", resize: "vertical" }}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)", marginBottom: "14px" }}>
            <input
              type="checkbox"
              checked={planForm.recommended}
              onChange={(e) => setPlanForm((prev) => (prev ? { ...prev, recommended: e.target.checked } : prev))}
            />
            Mark as recommended
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button type="button" onClick={() => setShowPlanModal(false)} style={secondaryBtn}>
              Cancel
            </button>
            <button type="button" onClick={submitPricingPlan} style={primaryBtn}>
              Save Plan
            </button>
          </div>
        </Modal>
      )}

      {showPaymentModal && (
        <Modal title="Add Payment" onClose={() => setShowPaymentModal(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <input
              type="number"
              min={1}
              placeholder="Client ID"
              value={paymentForm.client_id}
              onChange={(e) => setPaymentForm((f) => ({ ...f, client_id: e.target.value }))}
              style={inputStyle}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="Amount"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <input
              placeholder="Currency"
              value={paymentForm.currency}
              onChange={(e) => setPaymentForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              style={inputStyle}
            />
            <select
              value={paymentForm.status}
              onChange={(e) => setPaymentForm((f) => ({ ...f, status: e.target.value as PaymentStatus }))}
              style={inputStyle}
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <select
              value={paymentForm.payment_method}
              onChange={(e) => setPaymentForm((f) => ({ ...f, payment_method: e.target.value }))}
              style={inputStyle}
            >
              <option value="">No method</option>
              {activeMethods.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <input
            placeholder="Invoice number"
            value={paymentForm.invoice_number}
            onChange={(e) => setPaymentForm((f) => ({ ...f, invoice_number: e.target.value }))}
            style={{ ...inputStyle, marginBottom: "10px" }}
          />
          <input
            placeholder="Transaction ID"
            value={paymentForm.transaction_id}
            onChange={(e) => setPaymentForm((f) => ({ ...f, transaction_id: e.target.value }))}
            style={{ ...inputStyle, marginBottom: "10px" }}
          />
          <input
            placeholder="Description"
            value={paymentForm.description}
            onChange={(e) => setPaymentForm((f) => ({ ...f, description: e.target.value }))}
            style={{ ...inputStyle, marginBottom: "14px" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button type="button" onClick={() => setShowPaymentModal(false)} style={secondaryBtn}>
              Cancel
            </button>
            <button type="button" onClick={() => void submitPayment()} disabled={saving} style={primaryBtn}>
              {saving ? "Saving..." : "Create Payment"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "620px",
          maxWidth: "92vw",
          background: "var(--bg-surface)",
          border: "1px solid #1e1e2a",
          borderRadius: "14px",
          padding: "18px",
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: "15px", color: "var(--text-primary)" }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function readErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function statusColor(status: PaymentStatus): string {
  if (status === "paid") return "#34d399";
  if (status === "pending") return "#fbbf24";
  if (status === "failed") return "#f87171";
  return "#60a5fa";
}

function kpiCard(color: string): React.CSSProperties {
  return {
    background: "var(--bg-surface)",
    border: "1px solid #1e1e2a",
    borderRadius: "10px",
    padding: "12px",
    position: "relative",
    overflow: "hidden",
    boxShadow: `inset 0 -1px 0 ${color}45`,
  };
}

function tableHead(columns: string): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: columns,
    padding: "9px 12px",
    borderBottom: "1px solid #1a1a24",
    background: "var(--bg-panel)",
    gap: "8px",
  };
}

function tableRow(columns: string): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: columns,
    padding: "10px 12px",
    borderBottom: "1px solid #171721",
    alignItems: "center",
    gap: "8px",
  };
}

const panelStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid #1e1e2a",
  borderRadius: "12px",
  overflow: "hidden",
};

const panelHeader: React.CSSProperties = {
  height: "40px",
  display: "flex",
  alignItems: "center",
  padding: "0 12px",
  borderBottom: "1px solid #1e1e2a",
  fontSize: "13px",
  color: "#e0e0e6",
  fontWeight: 600,
};

const thStyle: React.CSSProperties = {
  fontSize: "10px",
  color: "#3f3f50",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontFamily: "monospace",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "32px",
  borderRadius: "8px",
  border: "1px solid #2a2a36",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  outline: "none",
  padding: "0 10px",
  fontSize: "12px",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  height: "32px",
  borderRadius: "8px",
  border: "none",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 82%, #fff 18%), var(--accent-2))",
  color: "white",
  fontSize: "12px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "5px",
  padding: "0 11px",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  height: "32px",
  borderRadius: "8px",
  border: "1px solid #2a2a36",
  background: "var(--bg-elevated)",
  color: "#bbb",
  fontSize: "12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "5px",
  padding: "0 11px",
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  height: "28px",
  borderRadius: "7px",
  border: "1px solid #2a2a36",
  background: "var(--bg-elevated)",
  color: "#aaa",
  fontSize: "11px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8px",
  cursor: "pointer",
};

const methodActionCellStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: "6px",
};
