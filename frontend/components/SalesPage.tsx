"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  TrendingUp,
  TrendingDown,
  Package,
  ShoppingCart,
  Boxes,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "9px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-soft)",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
} as const;

const labelStyle = {
  fontSize: "11px",
  color: "var(--text-subtle)",
  marginBottom: "6px",
  display: "block",
} as const;

type SalesProduct = {
  id: number;
  sku: string;
  name: string;
  category: string;
  brand?: string | null;
  description?: string | null;
  status: "active" | "low_stock" | "out_of_stock" | "discontinued" | "archived";
  is_current: boolean;
  unit_price: number;
  unit_cost: number;
  stock_qty: number;
  reorder_level: number;
  location?: string | null;
  tags?: string | null;
  total_sold_units: number;
  total_revenue: number;
  last_sold_at?: string | null;
  updated_at: string;
};

type SalesOrderItem = {
  id: number;
  order_id: number;
  product_id?: number | null;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_discount: number;
  line_total: number;
  created_at: string;
};

type SalesOrder = {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  channel: "direct" | "online" | "marketplace" | "partner" | "wholesale" | "retail";
  status: "draft" | "pending" | "paid" | "fulfilled" | "cancelled" | "refunded";
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  shipping_total: number;
  total: number;
  order_date: string;
  due_date?: string | null;
  fulfilled_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  items: SalesOrderItem[];
};

type SalesInventoryAdjustment = {
  id: number;
  product_id: number;
  order_id?: number | null;
  change_qty: number;
  reason: string;
  reference?: string | null;
  notes?: string | null;
  actor?: string | null;
  created_at: string;
};

type SalesSummary = {
  total_products: number;
  current_products: number;
  non_current_products: number;
  low_stock_products: number;
  out_of_stock_products: number;
  inventory_units: number;
  inventory_cost_value: number;
  inventory_retail_value: number;
  total_orders: number;
  pending_orders: number;
  closed_orders: number;
  cancelled_orders: number;
  revenue_total: number;
  cogs_total: number;
  gross_profit: number;
  gross_margin_percent: number;
  avg_order_value: number;
  sell_through_percent: number;
  inventory_turnover: number;
  pending_pipeline_value: number;
  units_sold: number;
  recent_30d_revenue: number;
  revenue_change_vs_prev_30d: string;
  revenue_change_is_positive: boolean;
};

type SalesReportProduct = {
  id: number;
  sku: string;
  name: string;
  category: string;
  status: string;
  is_current: boolean;
  stock_qty: number;
  reorder_level: number;
  unit_price: number;
  unit_cost: number;
  total_sold_units: number;
  total_revenue: number;
  last_sold_at?: string | null;
  updated_at?: string | null;
};

type SalesReports = {
  top_products: SalesReportProduct[];
  current_products: SalesReportProduct[];
  non_current_products: SalesReportProduct[];
  low_stock_products: SalesReportProduct[];
  stale_current_products: SalesReportProduct[];
  revenue_trend: { months: string[]; revenue: number[] };
};

type ModalType = null | "add_product" | "edit_product" | "add_order" | "edit_order" | "inventory_adjust";
type TabType = "products" | "orders" | "inventory" | "reports";

type OrderItemForm = {
  row_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  quantity: string;
  unit_price: string;
  unit_cost: string;
  line_discount: string;
};

type ProductForm = {
  sku: string;
  name: string;
  category: string;
  brand: string;
  description: string;
  status: SalesProduct["status"];
  is_current: boolean;
  unit_price: string;
  unit_cost: string;
  stock_qty: string;
  reorder_level: string;
  location: string;
  tags: string;
};

type OrderForm = {
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  channel: SalesOrder["channel"];
  status: SalesOrder["status"];
  currency: string;
  discount_total: string;
  tax_total: string;
  shipping_total: string;
  order_date: string;
  due_date: string;
  notes: string;
  items: OrderItemForm[];
};

type AdjustmentForm = {
  product_id: string;
  change_qty: string;
  reason: string;
  reference: string;
  notes: string;
  actor: string;
};

const statusColor: Record<string, string> = {
  active: "#34d399",
  low_stock: "#fbbf24",
  out_of_stock: "#f87171",
  discontinued: "#a78bfa",
  archived: "var(--text-muted)",
  draft: "var(--text-muted)",
  pending: "#fbbf24",
  paid: "#34d399",
  fulfilled: "#22c55e",
  cancelled: "#f87171",
  refunded: "#f97316",
};

const productStatusOptions = [
  "active",
  "low_stock",
  "out_of_stock",
  "discontinued",
  "archived",
] as const;

const orderStatusOptions = [
  "draft",
  "pending",
  "paid",
  "fulfilled",
  "cancelled",
  "refunded",
] as const;

const orderChannelOptions = [
  "online",
  "direct",
  "marketplace",
  "partner",
  "wholesale",
  "retail",
] as const;

const makeRowId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const blankOrderItem = (): OrderItemForm => ({
  row_id: makeRowId(),
  product_id: "",
  sku: "",
  product_name: "",
  quantity: "1",
  unit_price: "",
  unit_cost: "",
  line_discount: "0",
});

const emptyProductForm: ProductForm = {
  sku: "",
  name: "",
  category: "",
  brand: "",
  description: "",
  status: "active",
  is_current: true,
  unit_price: "",
  unit_cost: "",
  stock_qty: "",
  reorder_level: "",
  location: "",
  tags: "",
};

const emptyOrderForm: OrderForm = {
  order_number: "",
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  channel: "online",
  status: "pending",
  currency: "USD",
  discount_total: "0",
  tax_total: "0",
  shipping_total: "0",
  order_date: "",
  due_date: "",
  notes: "",
  items: [blankOrderItem()],
};

const emptyAdjustmentForm: AdjustmentForm = {
  product_id: "",
  change_qty: "",
  reason: "manual_adjustment",
  reference: "",
  notes: "",
  actor: "manager",
};

const toNum = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtMoney = (value: number) =>
  "$" +
  Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });

const fmtPct = (value: number) => `${Number(value || 0).toFixed(1)}%`;

const toInputDate = (value?: string | null): string => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const toIsoOrNull = (value: string): string | null =>
  value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;

const shortDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
};

export default function SalesPage() {
  const isMobile = useIsMobile(900);
  const isTablet = useIsMobile(1180);
  const isDenseLayout = isMobile || isTablet;

  const [tab, setTab] = useState<TabType>("products");
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [adjustments, setAdjustments] = useState<SalesInventoryAdjustment[]>([]);
  const [reports, setReports] = useState<SalesReports | null>(null);

  const [modal, setModal] = useState<ModalType>(null);
  const [selectedProduct, setSelectedProduct] = useState<SalesProduct | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [orderForm, setOrderForm] = useState<OrderForm>(emptyOrderForm);
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentForm>(emptyAdjustmentForm);

  const productMap = useMemo(() => {
    const map: Record<number, SalesProduct> = {};
    for (const row of products) map[row.id] = row;
    return map;
  }, [products]);

  const adjustmentRows = useMemo(
    () =>
      adjustments.map((row) => ({
        ...row,
        product_label: productMap[row.product_id]
          ? `${productMap[row.product_id].name} (${productMap[row.product_id].sku})`
          : `Product #${row.product_id}`,
      })),
    [adjustments, productMap]
  );

  const orderPreviewTotals = useMemo(() => {
    const subtotal = orderForm.items.reduce((sum, item) => {
      const product = item.product_id ? productMap[Number(item.product_id)] : null;
      const qty = Math.max(1, toNum(item.quantity) || 1);
      const price = item.unit_price ? toNum(item.unit_price) : Number(product?.unit_price || 0);
      const discount = Math.max(0, toNum(item.line_discount));
      return sum + Math.max(qty * price - discount, 0);
    }, 0);
    const total =
      subtotal - Math.max(0, toNum(orderForm.discount_total)) + Math.max(0, toNum(orderForm.tax_total)) + Math.max(0, toNum(orderForm.shipping_total));
    return {
      subtotal: Math.max(0, subtotal),
      total: Math.max(0, total),
    };
  }, [orderForm, productMap]);

  const load = async () => {
    setLoadError("");
    try {
      const [summaryRes, productsRes, ordersRes, adjustmentsRes, reportsRes] = await Promise.all([
        fetch(`${API}/sales/summary`),
        fetch(`${API}/sales/products?limit=300`),
        fetch(`${API}/sales/orders?limit=300`),
        fetch(`${API}/sales/inventory/adjustments?limit=400`),
        fetch(`${API}/sales/reports`),
      ]);

      if (!summaryRes.ok) {
        const payload = await summaryRes.json().catch(() => null);
        setLoadError(payload?.detail || "Could not load sales command board.");
      }

      setSummary(summaryRes.ok ? await summaryRes.json() : null);
      setProducts(productsRes.ok ? await productsRes.json() : []);
      setOrders(ordersRes.ok ? await ordersRes.json() : []);
      setAdjustments(adjustmentsRes.ok ? await adjustmentsRes.json() : []);
      setReports(reportsRes.ok ? await reportsRes.json() : null);
    } catch {
      setLoadError("Failed to connect to the sales service.");
      setSummary(null);
      setProducts([]);
      setOrders([]);
      setAdjustments([]);
      setReports(null);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const openProductEdit = (row: SalesProduct) => {
    setSelectedProduct(row);
    setProductForm({
      sku: row.sku,
      name: row.name,
      category: row.category,
      brand: row.brand || "",
      description: row.description || "",
      status: row.status,
      is_current: row.is_current,
      unit_price: String(row.unit_price ?? ""),
      unit_cost: String(row.unit_cost ?? ""),
      stock_qty: String(row.stock_qty ?? ""),
      reorder_level: String(row.reorder_level ?? ""),
      location: row.location || "",
      tags: row.tags || "",
    });
    setModal("edit_product");
  };

  const resetProductForm = () => {
    setSelectedProduct(null);
    setProductForm(emptyProductForm);
  };

  const openOrderEdit = (row: SalesOrder) => {
    setSelectedOrder(row);
    setOrderForm({
      order_number: row.order_number,
      customer_name: row.customer_name,
      customer_email: row.customer_email || "",
      customer_phone: row.customer_phone || "",
      channel: row.channel,
      status: row.status,
      currency: row.currency || "USD",
      discount_total: String(row.discount_total ?? 0),
      tax_total: String(row.tax_total ?? 0),
      shipping_total: String(row.shipping_total ?? 0),
      order_date: toInputDate(row.order_date),
      due_date: toInputDate(row.due_date),
      notes: row.notes || "",
      items:
        row.items.length > 0
          ? row.items.map((item) => ({
              row_id: makeRowId(),
              product_id: item.product_id ? String(item.product_id) : "",
              sku: item.sku,
              product_name: item.product_name,
              quantity: String(item.quantity),
              unit_price: String(item.unit_price),
              unit_cost: String(item.unit_cost),
              line_discount: String(item.line_discount || 0),
            }))
          : [blankOrderItem()],
    });
    setModal("edit_order");
  };

  const resetOrderForm = () => {
    setSelectedOrder(null);
    setOrderForm(emptyOrderForm);
  };

  const resetAdjustmentForm = () => {
    setAdjustmentForm(emptyAdjustmentForm);
  };

  const saveProduct = async () => {
    if (!productForm.sku.trim() || !productForm.name.trim()) {
      alert("SKU and Product Name are required.");
      return;
    }
    setLoading(true);
    const payload = {
      sku: productForm.sku.trim().toUpperCase(),
      name: productForm.name.trim(),
      category: productForm.category.trim() || "general",
      brand: productForm.brand.trim() || null,
      description: productForm.description.trim() || null,
      status: productForm.status,
      is_current: productForm.is_current,
      unit_price: toNum(productForm.unit_price),
      unit_cost: toNum(productForm.unit_cost),
      stock_qty: Math.round(toNum(productForm.stock_qty)),
      reorder_level: Math.max(0, Math.round(toNum(productForm.reorder_level))),
      location: productForm.location.trim() || null,
      tags: productForm.tags.trim() || null,
    };

    const endpoint =
      modal === "add_product" ? `${API}/sales/products` : `${API}/sales/products/${selectedProduct?.id}`;
    const method = modal === "add_product" ? "POST" : "PUT";

    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to save product.");
      setLoading(false);
      return;
    }
    await load();
    setModal(null);
    setLoading(false);
  };

  const deleteProduct = async (id: number) => {
    if (!confirm("Delete this product from the sales catalog?")) return;
    const res = await fetch(`${API}/sales/products/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to delete product.");
      return;
    }
    await load();
  };

  const updateOrderItem = (rowId: string, key: keyof OrderItemForm, value: string) => {
    setOrderForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.row_id !== rowId) return item;
        const updated = { ...item, [key]: value };
        if (key === "product_id") {
          const product = value ? productMap[Number(value)] : null;
          if (product) {
            updated.sku = product.sku;
            updated.product_name = product.name;
            updated.unit_price = String(product.unit_price ?? 0);
            updated.unit_cost = String(product.unit_cost ?? 0);
          }
        }
        return updated;
      }),
    }));
  };

  const addOrderItem = () => {
    setOrderForm((prev) => ({ ...prev, items: [...prev.items, blankOrderItem()] }));
  };

  const removeOrderItem = (rowId: string) => {
    setOrderForm((prev) => {
      if (prev.items.length <= 1) return prev;
      return { ...prev, items: prev.items.filter((item) => item.row_id !== rowId) };
    });
  };

  const saveOrder = async () => {
    if (!orderForm.order_number.trim() || !orderForm.customer_name.trim()) {
      alert("Order number and customer name are required.");
      return;
    }
    if (!orderForm.items.length) {
      alert("At least one sold item is required.");
      return;
    }

    const normalizedItems = orderForm.items.map((item, index) => {
      const product = item.product_id ? productMap[Number(item.product_id)] : null;
      const quantity = Math.max(1, Math.round(toNum(item.quantity)));
      const unitPrice = item.unit_price ? toNum(item.unit_price) : Number(product?.unit_price || 0);
      const unitCost = item.unit_cost ? toNum(item.unit_cost) : Number(product?.unit_cost || 0);
      return {
        product_id: item.product_id ? Number(item.product_id) : null,
        sku: item.sku.trim() || product?.sku || `ITEM-${index + 1}`,
        product_name: item.product_name.trim() || product?.name || `Item ${index + 1}`,
        quantity,
        unit_price: unitPrice,
        unit_cost: unitCost,
        line_discount: Math.max(0, toNum(item.line_discount)),
      };
    });

    setLoading(true);
    const payload = {
      order_number: orderForm.order_number.trim().toUpperCase(),
      customer_name: orderForm.customer_name.trim(),
      customer_email: orderForm.customer_email.trim() || null,
      customer_phone: orderForm.customer_phone.trim() || null,
      channel: orderForm.channel,
      status: orderForm.status,
      currency: orderForm.currency.trim() || "USD",
      discount_total: Math.max(0, toNum(orderForm.discount_total)),
      tax_total: Math.max(0, toNum(orderForm.tax_total)),
      shipping_total: Math.max(0, toNum(orderForm.shipping_total)),
      order_date: toIsoOrNull(orderForm.order_date),
      due_date: toIsoOrNull(orderForm.due_date),
      notes: orderForm.notes.trim() || null,
      items: normalizedItems,
    };

    const endpoint =
      modal === "add_order" ? `${API}/sales/orders` : `${API}/sales/orders/${selectedOrder?.id}`;
    const method = modal === "add_order" ? "POST" : "PUT";
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to save order.");
      setLoading(false);
      return;
    }
    await load();
    setModal(null);
    setLoading(false);
  };

  const deleteOrder = async (id: number) => {
    if (!confirm("Delete this sold order record? Inventory movements will be reverted.")) return;
    const res = await fetch(`${API}/sales/orders/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to delete order.");
      return;
    }
    await load();
  };

  const createAdjustment = async () => {
    if (!adjustmentForm.product_id || !adjustmentForm.change_qty) {
      alert("Product and quantity change are required.");
      return;
    }
    setLoading(true);
    const payload = {
      product_id: Number(adjustmentForm.product_id),
      change_qty: Math.round(toNum(adjustmentForm.change_qty)),
      reason: adjustmentForm.reason.trim() || "manual_adjustment",
      reference: adjustmentForm.reference.trim() || null,
      notes: adjustmentForm.notes.trim() || null,
      actor: adjustmentForm.actor.trim() || null,
    };
    const res = await fetch(`${API}/sales/inventory/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to apply inventory adjustment.");
      setLoading(false);
      return;
    }
    await load();
    setModal(null);
    setLoading(false);
  };

  const kpiCards = summary
    ? [
        {
          label: "Revenue (closed)",
          value: fmtMoney(summary.revenue_total),
          meta: `${summary.revenue_change_vs_prev_30d} vs prev 30d`,
          up: summary.revenue_change_is_positive,
          color: "#34d399",
          icon: <TrendingUp size={13} />,
        },
        {
          label: "Gross Profit",
          value: fmtMoney(summary.gross_profit),
          meta: `Margin ${fmtPct(summary.gross_margin_percent)}`,
          up: summary.gross_profit >= 0,
          color: summary.gross_profit >= 0 ? "#34d399" : "#f87171",
          icon: summary.gross_profit >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />,
        },
        {
          label: "Orders",
          value: String(summary.total_orders),
          meta: `${summary.closed_orders} closed · ${summary.pending_orders} pending`,
          up: summary.closed_orders >= summary.pending_orders,
          color: "#60a5fa",
          icon: <ShoppingCart size={13} />,
        },
        {
          label: "Catalog Health",
          value: `${summary.current_products}/${summary.total_products}`,
          meta: `${summary.non_current_products} non-current`,
          up: summary.non_current_products <= summary.current_products,
          color: "#a78bfa",
          icon: <Package size={13} />,
        },
        {
          label: "Inventory Value",
          value: fmtMoney(summary.inventory_cost_value),
          meta: `${summary.inventory_units} units on hand`,
          up: summary.inventory_units > 0,
          color: "#22c55e",
          icon: <Boxes size={13} />,
        },
        {
          label: "Risk Alerts",
          value: String(summary.low_stock_products + summary.out_of_stock_products),
          meta: `${summary.low_stock_products} low · ${summary.out_of_stock_products} out`,
          up: summary.low_stock_products + summary.out_of_stock_products === 0,
          color: summary.low_stock_products + summary.out_of_stock_products === 0 ? "#34d399" : "#f87171",
          icon: <AlertTriangle size={13} />,
        },
      ]
    : [];

  const maxTrend = useMemo(() => {
    if (!reports?.revenue_trend?.revenue?.length) return 1;
    return Math.max(...reports.revenue_trend.revenue, 1);
  }, [reports]);

  const productTableMinWidth = 1040;
  const orderTableMinWidth = 980;
  const inventoryWatchlistMinWidth = 560;
  const inventoryLedgerMinWidth = 760;
  const reportTableMinWidth = 640;

  return (
    <div style={{ padding: isDenseLayout ? "14px" : "24px", maxWidth: "1320px", margin: "0 auto", overflowX: "hidden" }}>
      {loadError ? (
        <div
          style={{
            marginBottom: "14px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid var(--danger-soft-border)",
            background: "var(--danger-soft-bg)",
            color: "var(--danger)",
            fontSize: "12px",
          }}
        >
          {loadError}
        </div>
      ) : null}

      {summary ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            {kpiCards.map((card) => (
              <div
                key={card.label}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "12px",
                  padding: "16px",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{card.label}</span>
                  <span style={{ color: card.color, display: "inline-flex", alignItems: "center" }}>{card.icon}</span>
                </div>
                <div style={{ fontSize: "30px", fontWeight: 650, color: "var(--text-primary)", marginTop: "6px" }}>
                  {card.value}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "11px",
                    color: card.up ? "var(--success)" : "var(--danger)",
                  }}
                >
                  {card.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {card.meta}
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "1px",
                    background: `linear-gradient(90deg, transparent, ${card.color}55, transparent)`,
                  }}
                />
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "8px",
              marginBottom: "18px",
            }}
          >
            {[
              { label: "Average order value", value: fmtMoney(summary.avg_order_value) },
              { label: "Sell-through", value: fmtPct(summary.sell_through_percent) },
              { label: "Inventory turnover", value: `${summary.inventory_turnover.toFixed(2)}x` },
              { label: "Pipeline (open orders)", value: fmtMoney(summary.pending_pipeline_value) },
              { label: "Units sold", value: String(summary.units_sold) },
              { label: "30-day revenue", value: fmtMoney(summary.recent_30d_revenue) },
            ].map((metric) => (
              <div
                key={metric.label}
                style={{
                  padding: "9px 11px",
                  borderRadius: "9px",
                  border: "1px solid var(--border-soft)",
                  background: "var(--bg-panel)",
                  display: "grid",
                  gap: "3px",
                }}
              >
                <span style={{ fontSize: "10px", color: "var(--text-quiet)", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "monospace" }}>
                  {metric.label}
                </span>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>{metric.value}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "14px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "10px",
          padding: "4px",
          width: isDenseLayout ? "100%" : "fit-content",
          flexWrap: "nowrap",
          overflowX: "auto",
          scrollbarWidth: "thin",
        }}
      >
        {(
          [
            { key: "products", label: "Products", icon: <Package size={13} /> },
            { key: "orders", label: "Sold Items", icon: <ShoppingCart size={13} /> },
            { key: "inventory", label: "Inventory", icon: <Boxes size={13} /> },
            { key: "reports", label: "Reports", icon: <ClipboardList size={13} /> },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              background: tab === item.key ? "var(--bg-elevated)" : "transparent",
              color: tab === item.key ? "var(--text-primary)" : "var(--text-subtle)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === "products" ? (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-default)",
            }}
          >
            <div style={{ display: "grid", gap: "2px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Product Catalog</span>
              <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                Manage active and non-current products with sales velocity and stock health.
              </span>
            </div>
            <button
              onClick={() => {
                resetProductForm();
                setModal("add_product");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "9px",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Plus size={14} />
              Add Product
            </button>
          </div>

          <div style={{ overflowX: "auto", scrollbarWidth: "thin" }}>
            <div
              style={{
                minWidth: `${productTableMinWidth}px`,
                display: "grid",
                gridTemplateColumns: "0.9fr 1.8fr 1fr 1fr 0.9fr 0.8fr 0.8fr 92px",
                gap: "10px",
                padding: "10px 18px",
                borderBottom: "1px solid var(--border-soft)",
                background: "var(--bg-panel)",
              }}
            >
              {["SKU", "Product", "Category", "Price / Cost", "Stock", "Status", "Revenue", "Actions"].map((head) => (
                <span
                  key={head}
                  style={{
                    fontSize: "10px",
                    color: "var(--text-quiet)",
                    fontFamily: "monospace",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  {head}
                </span>
              ))}
            </div>
            {products.map((row, index) => (
              <div
                key={row.id}
                style={{
                  minWidth: `${productTableMinWidth}px`,
                  display: "grid",
                  gridTemplateColumns: "0.9fr 1.8fr 1fr 1fr 0.9fr 0.8fr 0.8fr 92px",
                  gap: "10px",
                  padding: "12px 18px",
                  borderBottom: index < products.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "12px", color: "var(--accent)", fontFamily: "monospace" }}>{row.sku}</span>
                <div style={{ display: "grid", gap: "2px" }}>
                <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{row.name}</span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                  {row.brand || "Unbranded"} · sold {row.total_sold_units}
                </span>
              </div>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.category}</span>
              <div style={{ display: "grid", gap: "2px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{fmtMoney(row.unit_price)}</span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>cost {fmtMoney(row.unit_cost)}</span>
              </div>
              <div style={{ display: "grid", gap: "2px" }}>
                <span style={{ fontSize: "12px", color: row.stock_qty <= row.reorder_level ? "var(--danger)" : "var(--text-primary)" }}>
                  {row.stock_qty}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>reorder {row.reorder_level}</span>
              </div>
                <span
                  style={{
                    fontSize: "11px",
                    color: statusColor[row.status] || "var(--text-muted)",
                    background: `${statusColor[row.status] || "#6b7280"}1A`,
                    border: `1px solid ${statusColor[row.status] || "#6b7280"}44`,
                    borderRadius: "999px",
                    padding: "3px 9px",
                    width: "fit-content",
                    textTransform: "capitalize",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.status.replace("_", " ")}
                </span>
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{fmtMoney(row.total_revenue)}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => openProductEdit(row)}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Pencil size={12} color="var(--text-muted)" />
                </button>
                <button
                  onClick={() => void deleteProduct(row.id)}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={12} color="var(--danger)" />
                </button>
              </div>
              </div>
            ))}
          </div>
          {!products.length ? (
            <div style={{ padding: "26px 18px", color: "var(--text-subtle)", fontSize: "13px" }}>
              No products in the catalog yet.
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "orders" ? (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-default)",
            }}
          >
            <div style={{ display: "grid", gap: "2px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Sold Items Ledger</span>
              <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                Track all sales orders and status transitions from draft to fulfilled.
              </span>
            </div>
            <button
              onClick={() => {
                resetOrderForm();
                setModal("add_order");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "9px",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Plus size={14} />
              Add Sold Order
            </button>
          </div>
          <div style={{ overflowX: "auto", scrollbarWidth: "thin" }}>
            <div
              style={{
                minWidth: `${orderTableMinWidth}px`,
                display: "grid",
                gridTemplateColumns: "0.9fr 1.2fr 0.8fr 0.8fr 0.7fr 0.7fr 0.7fr 96px",
                gap: "10px",
                padding: "10px 18px",
                borderBottom: "1px solid var(--border-soft)",
                background: "var(--bg-panel)",
              }}
            >
              {["Order #", "Customer", "Items", "Total", "Channel", "Status", "Date", "Actions"].map((head) => (
                <span
                  key={head}
                  style={{
                    fontSize: "10px",
                    color: "var(--text-quiet)",
                    fontFamily: "monospace",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  {head}
                </span>
              ))}
            </div>
            {orders.map((row, index) => (
              <div
                key={row.id}
                style={{
                  minWidth: `${orderTableMinWidth}px`,
                  display: "grid",
                  gridTemplateColumns: "0.9fr 1.2fr 0.8fr 0.8fr 0.7fr 0.7fr 0.7fr 96px",
                  gap: "10px",
                  padding: "12px 18px",
                  borderBottom: index < orders.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "12px", color: "var(--accent)", fontFamily: "monospace" }}>{row.order_number}</span>
                <div style={{ display: "grid", gap: "2px" }}>
                <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{row.customer_name}</span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{row.customer_email || "No email"}</span>
              </div>
              <div style={{ display: "grid", gap: "2px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{row.items.length} lines</span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                  {row.items.reduce((sum, item) => sum + item.quantity, 0)} units
                </span>
              </div>
              <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{fmtMoney(row.total)}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "capitalize" }}>{row.channel}</span>
                <span
                  style={{
                    fontSize: "11px",
                    color: statusColor[row.status] || "var(--text-muted)",
                    background: `${statusColor[row.status] || "#6b7280"}1A`,
                    border: `1px solid ${statusColor[row.status] || "#6b7280"}44`,
                    borderRadius: "999px",
                    padding: "3px 9px",
                    width: "fit-content",
                    textTransform: "capitalize",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.status}
                </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{shortDate(row.order_date)}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => openOrderEdit(row)}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Pencil size={12} color="var(--text-muted)" />
                </button>
                <button
                  onClick={() => void deleteOrder(row.id)}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={12} color="var(--danger)" />
                </button>
              </div>
              </div>
            ))}
          </div>
          {!orders.length ? (
            <div style={{ padding: "26px 18px", color: "var(--text-subtle)", fontSize: "13px" }}>
              No sold orders yet.
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "inventory" ? (
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1.15fr 0.85fr", gap: "12px" }}>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-default)" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Inventory Watchlist</span>
              </div>
              <div style={{ overflowX: "auto", scrollbarWidth: "thin" }}>
                <div
                  style={{
                    minWidth: `${inventoryWatchlistMinWidth}px`,
                    display: "grid",
                    gridTemplateColumns: "1.1fr 0.7fr 0.6fr 0.8fr",
                    gap: "10px",
                    padding: "10px 18px",
                    borderBottom: "1px solid var(--border-soft)",
                    background: "var(--bg-panel)",
                  }}
                >
                  {["Product", "Stock", "Reorder", "Status"].map((head) => (
                    <span key={head} style={{ fontSize: "10px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, fontFamily: "monospace" }}>
                      {head}
                    </span>
                  ))}
                </div>
                {(reports?.low_stock_products || []).slice(0, 10).map((row, idx, arr) => (
                  <div
                    key={row.id}
                    style={{
                      minWidth: `${inventoryWatchlistMinWidth}px`,
                      display: "grid",
                      gridTemplateColumns: "1.1fr 0.7fr 0.6fr 0.8fr",
                      gap: "10px",
                      padding: "11px 18px",
                      borderBottom: idx < arr.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                    }}
                  >
                    <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{row.name}</span>
                    <span style={{ fontSize: "12px", color: row.stock_qty <= 0 ? "var(--danger)" : "var(--warning)" }}>{row.stock_qty}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.reorder_level}</span>
                    <span style={{ fontSize: "11px", color: statusColor[row.status] || "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {row.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
              {!reports?.low_stock_products?.length ? (
                <div style={{ padding: "22px 18px", color: "var(--text-subtle)", fontSize: "13px" }}>
                  No inventory risks detected.
                </div>
              ) : null}
            </div>

            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", padding: "16px" }}>
              <div style={{ display: "grid", gap: "2px", marginBottom: "12px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Inventory Adjustment</span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                  Apply stock corrections, returns or replenishments.
                </span>
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                <div>
                  <label style={labelStyle}>Product</label>
                  <select
                    style={inputStyle}
                    value={adjustmentForm.product_id}
                    onChange={(e) => setAdjustmentForm((f) => ({ ...f, product_id: e.target.value }))}
                  >
                    <option value="">Select product</option>
                    {products.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} ({row.sku})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Change Quantity (+ add / - deduct)</label>
                  <input
                    style={inputStyle}
                    value={adjustmentForm.change_qty}
                    onChange={(e) => setAdjustmentForm((f) => ({ ...f, change_qty: e.target.value }))}
                    type="number"
                    placeholder="e.g. -3"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Reason</label>
                  <input
                    style={inputStyle}
                    value={adjustmentForm.reason}
                    onChange={(e) => setAdjustmentForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="manual_adjustment / return / restock"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Reference</label>
                  <input
                    style={inputStyle}
                    value={adjustmentForm.reference}
                    onChange={(e) => setAdjustmentForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="stock-count-2026-q1"
                  />
                </div>
                <button
                  onClick={() => void createAdjustment()}
                  style={{
                    marginTop: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "9px 12px",
                    borderRadius: "9px",
                    border: "none",
                    background: "var(--accent)",
                    color: "white",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    width: isDenseLayout ? "100%" : "auto",
                  }}
                >
                  Apply Adjustment
                </button>
              </div>
            </div>
          </div>

          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-default)" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Inventory Movement Ledger</span>
            </div>
            <div style={{ overflowX: "auto", scrollbarWidth: "thin" }}>
              <div
                style={{
                  minWidth: `${inventoryLedgerMinWidth}px`,
                  display: "grid",
                  gridTemplateColumns: "0.8fr 1.3fr 0.6fr 1fr 1fr 0.7fr",
                  gap: "10px",
                  padding: "10px 18px",
                  borderBottom: "1px solid var(--border-soft)",
                  background: "var(--bg-panel)",
                }}
              >
                {["Date", "Product", "Change", "Reason", "Reference", "Actor"].map((head) => (
                  <span key={head} style={{ fontSize: "10px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, fontFamily: "monospace" }}>
                    {head}
                  </span>
                ))}
              </div>
              {adjustmentRows.slice(0, 120).map((row, idx) => (
                <div
                  key={row.id}
                  style={{
                    minWidth: `${inventoryLedgerMinWidth}px`,
                    display: "grid",
                    gridTemplateColumns: "0.8fr 1.3fr 0.6fr 1fr 1fr 0.7fr",
                    gap: "10px",
                    padding: "11px 18px",
                    borderBottom: idx < adjustmentRows.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{shortDate(row.created_at)}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{row.product_label}</span>
                  <span style={{ fontSize: "12px", color: row.change_qty >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                    {row.change_qty >= 0 ? "+" : ""}
                    {row.change_qty}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.reason}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.reference || "—"}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.actor || "system"}</span>
                </div>
              ))}
            </div>
            {!adjustmentRows.length ? (
              <div style={{ padding: "24px 18px", color: "var(--text-subtle)", fontSize: "13px" }}>
                No inventory movements recorded.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "reports" ? (
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr", gap: "12px" }}>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", padding: "16px" }}>
              <div style={{ display: "grid", gap: "2px", marginBottom: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Revenue Trend (6 months)</span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Closed sales orders only</span>
              </div>
              <div style={{ display: "flex", alignItems: "end", gap: "8px", minHeight: "140px" }}>
                {(reports?.revenue_trend.months || []).map((month, i) => {
                  const amount = reports?.revenue_trend.revenue[i] || 0;
                  const height = Math.max(10, Math.round((amount / maxTrend) * 108));
                  return (
                    <div key={month} style={{ flex: 1, display: "grid", gap: "5px", justifyItems: "center" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-subtle)" }}>{fmtMoney(amount)}</div>
                      <div
                        style={{
                          width: "70%",
                          height: `${height}px`,
                          borderRadius: "8px",
                          background: "linear-gradient(180deg, #34d399, color-mix(in srgb, #34d399 25%, var(--bg-panel)))",
                        }}
                      />
                      <div style={{ fontSize: "10px", color: "var(--text-quiet)" }}>{month.split(" ")[0]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", padding: "16px" }}>
              <div style={{ display: "grid", gap: "2px", marginBottom: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Top Performing Products</span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>By total revenue</span>
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {(reports?.top_products || []).slice(0, 8).map((row) => (
                  <div key={row.id} style={{ padding: "9px 10px", border: "1px solid var(--border-soft)", borderRadius: "9px", background: "var(--bg-panel)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>{row.name}</span>
                      <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{fmtMoney(row.total_revenue)}</span>
                    </div>
                    <div style={{ marginTop: "3px", fontSize: "11px", color: "var(--text-subtle)" }}>
                      {row.sku} · sold {row.total_sold_units} units · stock {row.stock_qty}
                    </div>
                  </div>
                ))}
                {!reports?.top_products?.length ? (
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>No sales performance data yet.</div>
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr", gap: "12px" }}>
            {[
              { title: "Current Products", rows: reports?.current_products || [], tone: "var(--success)" },
              { title: "Non-current Products", rows: reports?.non_current_products || [], tone: "var(--warning)" },
            ].map((block) => (
              <div key={block.title} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
                <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border-default)" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{block.title}</span>
                </div>
                <div style={{ overflowX: "auto", scrollbarWidth: "thin" }}>
                  <div
                    style={{
                      minWidth: `${reportTableMinWidth}px`,
                      display: "grid",
                      gridTemplateColumns: "1.3fr 0.7fr 0.7fr 0.8fr",
                      gap: "10px",
                      padding: "9px 16px",
                      borderBottom: "1px solid var(--border-soft)",
                      background: "var(--bg-panel)",
                    }}
                  >
                    {["Product", "Stock", "Revenue", "Status"].map((head) => (
                      <span key={head} style={{ fontSize: "10px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", fontWeight: 600 }}>
                        {head}
                      </span>
                    ))}
                  </div>
                  {block.rows.slice(0, 8).map((row, idx) => (
                    <div
                      key={row.id}
                      style={{
                        minWidth: `${reportTableMinWidth}px`,
                        display: "grid",
                        gridTemplateColumns: "1.3fr 0.7fr 0.7fr 0.8fr",
                        gap: "10px",
                        padding: "10px 16px",
                        borderBottom: idx < block.rows.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                      }}
                    >
                      <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                        {row.name}
                        <span style={{ color: "var(--text-subtle)" }}> ({row.sku})</span>
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.stock_qty}</span>
                      <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{fmtMoney(row.total_revenue)}</span>
                      <span style={{ fontSize: "11px", color: statusColor[row.status] || block.tone, whiteSpace: "nowrap" }}>{row.status.replace("_", " ")}</span>
                    </div>
                  ))}
                </div>
                {!block.rows.length ? (
                  <div style={{ padding: "18px 16px", fontSize: "12px", color: "var(--text-subtle)" }}>No entries.</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {modal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-backdrop)",
            zIndex: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isMobile ? "10px" : "18px",
          }}
          onClick={() => {
            setModal(null);
            resetProductForm();
            resetOrderForm();
            resetAdjustmentForm();
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "16px",
              width: isMobile ? "100%" : modal === "inventory_adjust" ? "500px" : modal?.includes("order") ? "940px" : "680px",
              maxWidth: "min(95vw, 1000px)",
              maxHeight: isMobile ? "92vh" : "90vh",
              overflow: "auto",
              padding: isMobile ? "16px 14px" : "24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <h2 style={{ fontSize: "16px", color: "var(--text-primary)", fontWeight: 600 }}>
                {modal === "add_product"
                  ? "Add Product"
                  : modal === "edit_product"
                    ? "Edit Product"
                    : modal === "add_order"
                      ? "Add Sold Order"
                      : modal === "edit_order"
                        ? "Edit Sold Order"
                        : "Inventory Adjustment"}
              </h2>
              <button
                onClick={() => {
                  setModal(null);
                  resetProductForm();
                  resetOrderForm();
                  resetAdjustmentForm();
                }}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-elevated)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={13} color="var(--text-muted)" />
              </button>
            </div>

            {(modal === "add_product" || modal === "edit_product") && (
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1.3fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={labelStyle}>SKU</label>
                    <input
                      style={inputStyle}
                      value={productForm.sku}
                      onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
                      placeholder="BNL-SKU-101"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Product Name</label>
                    <input
                      style={inputStyle}
                      value={productForm.name}
                      onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="ERP Annual License"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <input
                      style={inputStyle}
                      value={productForm.category}
                      onChange={(e) => setProductForm((f) => ({ ...f, category: e.target.value }))}
                      placeholder="Software / Service / Goods"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={labelStyle}>Brand</label>
                    <input style={inputStyle} value={productForm.brand} onChange={(e) => setProductForm((f) => ({ ...f, brand: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select
                      style={inputStyle}
                      value={productForm.status}
                      onChange={(e) => setProductForm((f) => ({ ...f, status: e.target.value as SalesProduct["status"] }))}
                    >
                      {productStatusOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "end" }}>
                    <label style={{ ...labelStyle, marginBottom: 0, display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={productForm.is_current}
                        onChange={(e) => setProductForm((f) => ({ ...f, is_current: e.target.checked }))}
                      />
                      Current product
                    </label>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
                  <div>
                    <label style={labelStyle}>Unit Price</label>
                    <input style={inputStyle} type="number" value={productForm.unit_price} onChange={(e) => setProductForm((f) => ({ ...f, unit_price: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Unit Cost</label>
                    <input style={inputStyle} type="number" value={productForm.unit_cost} onChange={(e) => setProductForm((f) => ({ ...f, unit_cost: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Stock Qty</label>
                    <input style={inputStyle} type="number" value={productForm.stock_qty} onChange={(e) => setProductForm((f) => ({ ...f, stock_qty: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Reorder Level</label>
                    <input style={inputStyle} type="number" value={productForm.reorder_level} onChange={(e) => setProductForm((f) => ({ ...f, reorder_level: e.target.value }))} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={labelStyle}>Location</label>
                    <input style={inputStyle} value={productForm.location} onChange={(e) => setProductForm((f) => ({ ...f, location: e.target.value }))} placeholder="Warehouse A / Cloud license" />
                  </div>
                  <div>
                    <label style={labelStyle}>Tags</label>
                    <input style={inputStyle} value={productForm.tags} onChange={(e) => setProductForm((f) => ({ ...f, tags: e.target.value }))} placeholder="subscription, annual, enterprise" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: "78px", resize: "vertical" }}
                    value={productForm.description}
                    onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Product details, value proposition, and commercial notes..."
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexDirection: isDenseLayout ? "column-reverse" : "row" }}>
                  <button
                    onClick={() => {
                      setModal(null);
                      resetProductForm();
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "9px",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      width: isDenseLayout ? "100%" : "auto",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void saveProduct()}
                    disabled={loading}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "9px",
                      border: "none",
                      background: "var(--accent)",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 600,
                      width: isDenseLayout ? "100%" : "auto",
                    }}
                  >
                    {loading ? "Saving..." : "Save Product"}
                  </button>
                </div>
              </div>
            )}

            {(modal === "add_order" || modal === "edit_order") && (
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr 1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={labelStyle}>Order Number</label>
                    <input style={inputStyle} value={orderForm.order_number} onChange={(e) => setOrderForm((f) => ({ ...f, order_number: e.target.value }))} placeholder="SO-2026-0041" />
                  </div>
                  <div>
                    <label style={labelStyle}>Customer</label>
                    <input style={inputStyle} value={orderForm.customer_name} onChange={(e) => setOrderForm((f) => ({ ...f, customer_name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input style={inputStyle} value={orderForm.customer_email} onChange={(e) => setOrderForm((f) => ({ ...f, customer_email: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input style={inputStyle} value={orderForm.customer_phone} onChange={(e) => setOrderForm((f) => ({ ...f, customer_phone: e.target.value }))} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr 1fr" : "1fr 1fr 1fr 1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={labelStyle}>Channel</label>
                    <select
                      style={inputStyle}
                      value={orderForm.channel}
                      onChange={(e) => setOrderForm((f) => ({ ...f, channel: e.target.value as SalesOrder["channel"] }))}
                    >
                      {orderChannelOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select
                      style={inputStyle}
                      value={orderForm.status}
                      onChange={(e) => setOrderForm((f) => ({ ...f, status: e.target.value as SalesOrder["status"] }))}
                    >
                      {orderStatusOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Currency</label>
                    <input style={inputStyle} value={orderForm.currency} onChange={(e) => setOrderForm((f) => ({ ...f, currency: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Order Date</label>
                    <input type="date" style={inputStyle} value={orderForm.order_date} onChange={(e) => setOrderForm((f) => ({ ...f, order_date: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Due Date</label>
                    <input type="date" style={inputStyle} value={orderForm.due_date} onChange={(e) => setOrderForm((f) => ({ ...f, due_date: e.target.value }))} />
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid var(--border-default)",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      padding: "10px 12px",
                      borderBottom: "1px solid var(--border-default)",
                      background: "var(--bg-panel)",
                    }}
                  >
                    <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>Sold Items</span>
                    <button
                      onClick={addOrderItem}
                      style={{
                        border: "1px solid var(--border-default)",
                        background: "var(--bg-elevated)",
                        color: "var(--text-primary)",
                        borderRadius: "8px",
                        padding: "5px 9px",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      + Item
                    </button>
                  </div>
                  <div style={{ display: "grid", gap: "8px", padding: "10px 12px" }}>
                    {orderForm.items.map((item) => (
                      <div
                        key={item.row_id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: isDenseLayout ? "1fr" : "1.3fr 0.8fr 0.8fr 0.8fr 0.7fr 32px",
                          gap: "8px",
                          alignItems: "end",
                        }}
                      >
                        <div>
                          <label style={labelStyle}>Product</label>
                          <select
                            style={inputStyle}
                            value={item.product_id}
                            onChange={(e) => updateOrderItem(item.row_id, "product_id", e.target.value)}
                          >
                            <option value="">Manual line item</option>
                            {products.map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.name} ({row.sku}) · stock {row.stock_qty}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Qty</label>
                          <input style={inputStyle} type="number" value={item.quantity} onChange={(e) => updateOrderItem(item.row_id, "quantity", e.target.value)} />
                        </div>
                        <div>
                          <label style={labelStyle}>Unit Price</label>
                          <input style={inputStyle} type="number" value={item.unit_price} onChange={(e) => updateOrderItem(item.row_id, "unit_price", e.target.value)} />
                        </div>
                        <div>
                          <label style={labelStyle}>Unit Cost</label>
                          <input style={inputStyle} type="number" value={item.unit_cost} onChange={(e) => updateOrderItem(item.row_id, "unit_cost", e.target.value)} />
                        </div>
                        <div>
                          <label style={labelStyle}>Discount</label>
                          <input style={inputStyle} type="number" value={item.line_discount} onChange={(e) => updateOrderItem(item.row_id, "line_discount", e.target.value)} />
                        </div>
                        <button
                          onClick={() => removeOrderItem(item.row_id)}
                          style={{
                            height: isDenseLayout ? "36px" : "34px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-default)",
                            background: "var(--bg-elevated)",
                            color: "var(--danger)",
                            cursor: "pointer",
                            width: isDenseLayout ? "100%" : "auto",
                          }}
                          title="Remove item"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "repeat(4, minmax(0,1fr))", gap: "10px" }}>
                  <div>
                    <label style={labelStyle}>Order Discount</label>
                    <input style={inputStyle} type="number" value={orderForm.discount_total} onChange={(e) => setOrderForm((f) => ({ ...f, discount_total: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Tax</label>
                    <input style={inputStyle} type="number" value={orderForm.tax_total} onChange={(e) => setOrderForm((f) => ({ ...f, tax_total: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Shipping</label>
                    <input style={inputStyle} type="number" value={orderForm.shipping_total} onChange={(e) => setOrderForm((f) => ({ ...f, shipping_total: e.target.value }))} />
                  </div>
                  <div style={{ display: "grid", gap: "2px", alignContent: "end", border: "1px solid var(--border-soft)", borderRadius: "9px", padding: "8px 10px", background: "var(--bg-panel)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Subtotal</span>
                    <span style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 700 }}>{fmtMoney(orderPreviewTotals.subtotal)}</span>
                    <span style={{ fontSize: "11px", color: "var(--accent)" }}>Total {fmtMoney(orderPreviewTotals.total)}</span>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea style={{ ...inputStyle, minHeight: "74px", resize: "vertical" }} value={orderForm.notes} onChange={(e) => setOrderForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexDirection: isDenseLayout ? "column-reverse" : "row" }}>
                  <button
                    onClick={() => {
                      setModal(null);
                      resetOrderForm();
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "9px",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      width: isDenseLayout ? "100%" : "auto",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void saveOrder()}
                    disabled={loading}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "9px",
                      border: "none",
                      background: "var(--accent)",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 600,
                      width: isDenseLayout ? "100%" : "auto",
                    }}
                  >
                    {loading ? "Saving..." : "Save Order"}
                  </button>
                </div>
              </div>
            )}

            {modal === "inventory_adjust" && (
              <div style={{ display: "grid", gap: "10px" }}>
                <div>
                  <label style={labelStyle}>Product</label>
                  <select style={inputStyle} value={adjustmentForm.product_id} onChange={(e) => setAdjustmentForm((f) => ({ ...f, product_id: e.target.value }))}>
                    <option value="">Select product</option>
                    {products.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} ({row.sku})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Change Quantity</label>
                  <input style={inputStyle} type="number" value={adjustmentForm.change_qty} onChange={(e) => setAdjustmentForm((f) => ({ ...f, change_qty: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Reason</label>
                  <input style={inputStyle} value={adjustmentForm.reason} onChange={(e) => setAdjustmentForm((f) => ({ ...f, reason: e.target.value }))} />
                </div>
                <button
                  onClick={() => void createAdjustment()}
                  style={{
                    marginTop: "8px",
                    padding: "9px 14px",
                    borderRadius: "9px",
                    border: "none",
                    background: "var(--accent)",
                    color: "white",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
