"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, Truck, Package, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";

const API = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `/api` : "http://localhost:8000");

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

type SupplySummary = {
  total_items: number;
  healthy_items: number;
  low_stock_items: number;
  out_of_stock_items: number;
  inventory_units: number;
  reserved_units: number;
  inventory_value: number;
  inbound_active_shipments: number;
  outbound_active_shipments: number;
  delayed_shipments: number;
  delivered_last_30d: number;
  on_time_delivery_percent: number;
};

type SupplyItem = {
  id: number;
  sku: string;
  name: string;
  category: string;
  supplier?: string | null;
  warehouse?: string | null;
  status: "healthy" | "low_stock" | "out_of_stock" | "discontinued";
  on_hand_qty: number;
  reserved_qty: number;
  safety_stock: number;
  reorder_point: number;
  lead_time_days: number;
  unit_cost: number;
  last_received_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

type Shipment = {
  id: number;
  shipment_ref: string;
  direction: "inbound" | "outbound";
  status: "planned" | "in_transit" | "delivered" | "delayed" | "cancelled";
  partner?: string | null;
  origin?: string | null;
  destination?: string | null;
  eta?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  freight_cost: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

type ItemForm = {
  sku: string;
  name: string;
  category: string;
  supplier: string;
  warehouse: string;
  status: SupplyItem["status"];
  on_hand_qty: string;
  reserved_qty: string;
  safety_stock: string;
  reorder_point: string;
  lead_time_days: string;
  unit_cost: string;
  last_received_at: string;
  notes: string;
};

type ShipmentForm = {
  shipment_ref: string;
  direction: Shipment["direction"];
  status: Shipment["status"];
  partner: string;
  origin: string;
  destination: string;
  eta: string;
  shipped_at: string;
  delivered_at: string;
  freight_cost: string;
  notes: string;
};

const itemStatusColor: Record<SupplyItem["status"], string> = {
  healthy: "#34d399",
  low_stock: "#fbbf24",
  out_of_stock: "#f87171",
  discontinued: "var(--text-muted)",
};

const shipmentStatusColor: Record<Shipment["status"], string> = {
  planned: "#60a5fa",
  in_transit: "#fbbf24",
  delivered: "#34d399",
  delayed: "#f87171",
  cancelled: "var(--text-muted)",
};

const emptyItemForm: ItemForm = {
  sku: "",
  name: "",
  category: "",
  supplier: "",
  warehouse: "",
  status: "healthy",
  on_hand_qty: "",
  reserved_qty: "0",
  safety_stock: "0",
  reorder_point: "0",
  lead_time_days: "0",
  unit_cost: "0",
  last_received_at: "",
  notes: "",
};

const emptyShipmentForm: ShipmentForm = {
  shipment_ref: "",
  direction: "inbound",
  status: "planned",
  partner: "",
  origin: "",
  destination: "",
  eta: "",
  shipped_at: "",
  delivered_at: "",
  freight_cost: "0",
  notes: "",
};

const num = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toInputDateTime = (value?: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const toIsoOrNull = (value: string): string | null => (value ? new Date(value).toISOString() : null);
const money = (value: number) => `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export default function SupplyChainPage() {
  const isMobile = useIsMobile(900);
  const isDenseLayout = useIsMobile(1120);

  const [tab, setTab] = useState<"items" | "shipments">("items");
  const [summary, setSummary] = useState<SupplySummary | null>(null);
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [modal, setModal] = useState<null | "add_item" | "edit_item" | "add_shipment" | "edit_shipment">(null);
  const [selectedItem, setSelectedItem] = useState<SupplyItem | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [shipmentForm, setShipmentForm] = useState<ShipmentForm>(emptyShipmentForm);

  const lowRiskItems = useMemo(() => items.filter((item) => item.status !== "healthy").length, [items]);

  const load = async () => {
    setError("");
    try {
      const [summaryRes, itemsRes, shipmentsRes] = await Promise.all([
        fetch(`${API}/supply-chain/summary`),
        fetch(`${API}/supply-chain/items?limit=300`),
        fetch(`${API}/supply-chain/shipments?limit=300`),
      ]);
      if (!summaryRes.ok) {
        const body = await summaryRes.json().catch(() => null);
        setError(body?.detail || "Could not load supply chain module.");
      }
      setSummary(summaryRes.ok ? await summaryRes.json() : null);
      setItems(itemsRes.ok ? await itemsRes.json() : []);
      setShipments(shipmentsRes.ok ? await shipmentsRes.json() : []);
    } catch {
      setError("Failed to connect to supply chain service.");
      setSummary(null);
      setItems([]);
      setShipments([]);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const openItemAdd = () => {
    setSelectedItem(null);
    setItemForm(emptyItemForm);
    setModal("add_item");
  };

  const openItemEdit = (row: SupplyItem) => {
    setSelectedItem(row);
    setItemForm({
      sku: row.sku,
      name: row.name,
      category: row.category,
      supplier: row.supplier || "",
      warehouse: row.warehouse || "",
      status: row.status,
      on_hand_qty: String(row.on_hand_qty),
      reserved_qty: String(row.reserved_qty),
      safety_stock: String(row.safety_stock),
      reorder_point: String(row.reorder_point),
      lead_time_days: String(row.lead_time_days),
      unit_cost: String(row.unit_cost),
      last_received_at: toInputDateTime(row.last_received_at),
      notes: row.notes || "",
    });
    setModal("edit_item");
  };

  const saveItem = async () => {
    if (!itemForm.sku.trim() || !itemForm.name.trim()) {
      alert("SKU and item name are required.");
      return;
    }
    setLoading(true);
    const payload = {
      sku: itemForm.sku.trim().toUpperCase(),
      name: itemForm.name.trim(),
      category: itemForm.category.trim() || "general",
      supplier: itemForm.supplier.trim() || null,
      warehouse: itemForm.warehouse.trim() || null,
      status: itemForm.status,
      on_hand_qty: Math.round(num(itemForm.on_hand_qty)),
      reserved_qty: Math.round(num(itemForm.reserved_qty)),
      safety_stock: Math.round(num(itemForm.safety_stock)),
      reorder_point: Math.round(num(itemForm.reorder_point)),
      lead_time_days: Math.round(num(itemForm.lead_time_days)),
      unit_cost: num(itemForm.unit_cost),
      last_received_at: toIsoOrNull(itemForm.last_received_at),
      notes: itemForm.notes.trim() || null,
    };
    const endpoint = modal === "add_item" ? `${API}/supply-chain/items` : `${API}/supply-chain/items/${selectedItem?.id}`;
    const method = modal === "add_item" ? "POST" : "PUT";
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to save item.");
      setLoading(false);
      return;
    }
    await load();
    setModal(null);
    setLoading(false);
  };

  const deleteItem = async (id: number) => {
    if (!confirm("Delete this supply chain item?")) return;
    const res = await fetch(`${API}/supply-chain/items/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to delete item.");
      return;
    }
    await load();
  };

  const openShipmentAdd = () => {
    setSelectedShipment(null);
    setShipmentForm({
      ...emptyShipmentForm,
      shipment_ref: `SHP-${Date.now().toString().slice(-6)}`,
    });
    setModal("add_shipment");
  };

  const openShipmentEdit = (row: Shipment) => {
    setSelectedShipment(row);
    setShipmentForm({
      shipment_ref: row.shipment_ref,
      direction: row.direction,
      status: row.status,
      partner: row.partner || "",
      origin: row.origin || "",
      destination: row.destination || "",
      eta: toInputDateTime(row.eta),
      shipped_at: toInputDateTime(row.shipped_at),
      delivered_at: toInputDateTime(row.delivered_at),
      freight_cost: String(row.freight_cost ?? 0),
      notes: row.notes || "",
    });
    setModal("edit_shipment");
  };

  const saveShipment = async () => {
    if (!shipmentForm.shipment_ref.trim()) {
      alert("Shipment reference is required.");
      return;
    }
    setLoading(true);
    const payload = {
      shipment_ref: shipmentForm.shipment_ref.trim().toUpperCase(),
      direction: shipmentForm.direction,
      status: shipmentForm.status,
      partner: shipmentForm.partner.trim() || null,
      origin: shipmentForm.origin.trim() || null,
      destination: shipmentForm.destination.trim() || null,
      eta: toIsoOrNull(shipmentForm.eta),
      shipped_at: toIsoOrNull(shipmentForm.shipped_at),
      delivered_at: toIsoOrNull(shipmentForm.delivered_at),
      freight_cost: num(shipmentForm.freight_cost),
      notes: shipmentForm.notes.trim() || null,
    };
    const endpoint =
      modal === "add_shipment"
        ? `${API}/supply-chain/shipments`
        : `${API}/supply-chain/shipments/${selectedShipment?.id}`;
    const method = modal === "add_shipment" ? "POST" : "PUT";
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to save shipment.");
      setLoading(false);
      return;
    }
    await load();
    setModal(null);
    setLoading(false);
  };

  const deleteShipment = async (id: number) => {
    if (!confirm("Delete this shipment record?")) return;
    const res = await fetch(`${API}/supply-chain/shipments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.detail || "Failed to delete shipment.");
      return;
    }
    await load();
  };

  const itemTableMinWidth = 980;
  const shipmentTableMinWidth = 1040;

  return (
    <div style={{ padding: isDenseLayout ? "14px" : "24px", maxWidth: "1260px", margin: "0 auto", overflowX: "hidden" }}>
      {error ? (
        <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--danger-soft-border)", background: "var(--danger-soft-bg)", color: "var(--danger)", fontSize: "12px" }}>
          {error}
        </div>
      ) : null}

      {summary ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px,1fr))", gap: "12px", marginBottom: "14px" }}>
          {[
            { label: "Inventory Value", value: money(summary.inventory_value), meta: `${summary.inventory_units} units`, color: "#34d399", up: true, icon: <Package size={13} /> },
            { label: "Risk Items", value: String(lowRiskItems), meta: `${summary.low_stock_items} low / ${summary.out_of_stock_items} out`, color: lowRiskItems ? "#f87171" : "#34d399", up: !lowRiskItems, icon: <AlertTriangle size={13} /> },
            { label: "Inbound Flow", value: String(summary.inbound_active_shipments), meta: "active inbound shipments", color: "#60a5fa", up: true, icon: <Truck size={13} /> },
            { label: "Delayed Shipments", value: String(summary.delayed_shipments), meta: `${summary.delivered_last_30d} delivered in 30d`, color: summary.delayed_shipments ? "#f87171" : "#34d399", up: summary.delayed_shipments === 0, icon: summary.delayed_shipments === 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} /> },
            { label: "On-time Delivery", value: `${summary.on_time_delivery_percent.toFixed(1)}%`, meta: "last 60-day benchmark", color: summary.on_time_delivery_percent >= 85 ? "#34d399" : "#fbbf24", up: summary.on_time_delivery_percent >= 85, icon: summary.on_time_delivery_percent >= 85 ? <TrendingUp size={13} /> : <TrendingDown size={13} /> },
          ].map((card) => (
            <div key={card.label} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "15px", position: "relative", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{card.label}</span>
                <span style={{ color: card.color }}>{card.icon}</span>
              </div>
              <div style={{ marginTop: "7px", fontSize: "28px", fontWeight: 650, color: "var(--text-primary)" }}>{card.value}</div>
              <div style={{ marginTop: "3px", fontSize: "11px", color: card.color }}>{card.meta}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "4px", marginBottom: "12px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "10px", padding: "4px", width: isDenseLayout ? "100%" : "fit-content", overflowX: "auto", flexWrap: "nowrap", scrollbarWidth: "thin" }}>
        <button onClick={() => setTab("items")} style={{ padding: "8px 14px", borderRadius: "8px", border: "none", cursor: "pointer", background: tab === "items" ? "var(--bg-elevated)" : "transparent", color: tab === "items" ? "var(--text-primary)" : "var(--text-subtle)", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>Inventory Items</button>
        <button onClick={() => setTab("shipments")} style={{ padding: "8px 14px", borderRadius: "8px", border: "none", cursor: "pointer", background: tab === "shipments" ? "var(--bg-elevated)" : "transparent", color: tab === "shipments" ? "var(--text-primary)" : "var(--text-subtle)", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>Shipments</button>
      </div>

      {tab === "items" ? (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", padding: isDenseLayout ? "14px 12px" : "16px 20px", borderBottom: "1px solid var(--border-default)" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Supply Inventory</span>
            <button onClick={openItemAdd} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px 14px", borderRadius: "9px", border: "none", background: "var(--accent)", color: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer", width: isDenseLayout ? "100%" : "auto" }}><Plus size={14} />Add Item</button>
          </div>
          <div style={{ overflowX: "auto", scrollbarWidth: "thin" }}>
            <div style={{ minWidth: `${itemTableMinWidth}px`, display: "grid", gridTemplateColumns: "0.9fr 1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 92px", gap: "10px", padding: "10px 18px", borderBottom: "1px solid var(--border-soft)", background: "var(--bg-panel)" }}>
              {["SKU", "Item", "Supplier", "Warehouse", "Stock", "Reserved", "Status", "Actions"].map((h) => <span key={h} style={{ fontSize: "10px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", fontWeight: 600 }}>{h}</span>)}
            </div>
            {items.map((row, idx) => (
              <div key={row.id} style={{ minWidth: `${itemTableMinWidth}px`, display: "grid", gridTemplateColumns: "0.9fr 1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 92px", gap: "10px", padding: "12px 18px", borderBottom: idx < items.length - 1 ? "1px solid var(--table-row-divider)" : "none", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "var(--accent)", fontFamily: "monospace" }}>{row.sku}</span>
              <div style={{ display: "grid", gap: "2px" }}>
                <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{row.name}</span>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{row.category} · {money(row.unit_cost)}</span>
              </div>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.supplier || "—"}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.warehouse || "—"}</span>
              <span style={{ fontSize: "12px", color: row.on_hand_qty <= row.reorder_point ? "var(--danger)" : "var(--text-primary)" }}>{row.on_hand_qty}</span>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.reserved_qty}</span>
              <span style={{ fontSize: "11px", color: itemStatusColor[row.status], background: `${itemStatusColor[row.status]}1A`, border: `1px solid ${itemStatusColor[row.status]}55`, borderRadius: "999px", padding: "3px 8px", width: "fit-content" }}>{row.status.replace("_", " ")}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => openItemEdit(row)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Pencil size={12} color="var(--text-muted)" /></button>
                <button onClick={() => void deleteItem(row.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Trash2 size={12} color="var(--danger)" /></button>
              </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", padding: isDenseLayout ? "14px 12px" : "16px 20px", borderBottom: "1px solid var(--border-default)" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Shipment Control</span>
            <button onClick={openShipmentAdd} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px 14px", borderRadius: "9px", border: "none", background: "var(--accent)", color: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer", width: isDenseLayout ? "100%" : "auto" }}><Plus size={14} />Add Shipment</button>
          </div>
          <div style={{ overflowX: "auto", scrollbarWidth: "thin" }}>
            <div style={{ minWidth: `${shipmentTableMinWidth}px`, display: "grid", gridTemplateColumns: "0.9fr 0.8fr 0.8fr 1fr 1fr 0.8fr 0.8fr 92px", gap: "10px", padding: "10px 18px", borderBottom: "1px solid var(--border-soft)", background: "var(--bg-panel)" }}>
              {["Ref", "Direction", "Status", "Partner", "Route", "ETA", "Cost", "Actions"].map((h) => <span key={h} style={{ fontSize: "10px", color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", fontWeight: 600 }}>{h}</span>)}
            </div>
            {shipments.map((row, idx) => (
              <div key={row.id} style={{ minWidth: `${shipmentTableMinWidth}px`, display: "grid", gridTemplateColumns: "0.9fr 0.8fr 0.8fr 1fr 1fr 0.8fr 0.8fr 92px", gap: "10px", padding: "12px 18px", borderBottom: idx < shipments.length - 1 ? "1px solid var(--table-row-divider)" : "none", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "var(--accent)", fontFamily: "monospace" }}>{row.shipment_ref}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.direction}</span>
              <span style={{ fontSize: "11px", color: shipmentStatusColor[row.status], background: `${shipmentStatusColor[row.status]}1A`, border: `1px solid ${shipmentStatusColor[row.status]}55`, borderRadius: "999px", padding: "3px 8px", width: "fit-content" }}>{row.status.replace("_", " ")}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.partner || "—"}</span>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{(row.origin || "—") + " -> " + (row.destination || "—")}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{row.eta ? new Date(row.eta).toLocaleDateString() : "—"}</span>
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{money(row.freight_cost)}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => openShipmentEdit(row)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Pencil size={12} color="var(--text-muted)" /></button>
                <button onClick={() => void deleteShipment(row.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Trash2 size={12} color="var(--danger)" /></button>
              </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal ? (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-backdrop)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "10px" : "18px" }} onClick={() => setModal(null)}>
          <div style={{ width: isMobile ? "100%" : "760px", maxWidth: "95vw", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: isMobile ? "16px 14px" : "24px", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <h2 style={{ fontSize: "16px", color: "var(--text-primary)", fontWeight: 600 }}>{modal === "add_item" ? "Add Inventory Item" : modal === "edit_item" ? "Edit Inventory Item" : modal === "add_shipment" ? "Add Shipment" : "Edit Shipment"}</h2>
              <button onClick={() => setModal(null)} style={{ width: "30px", height: "30px", borderRadius: "8px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={13} color="var(--text-muted)" /></button>
            </div>

            {(modal === "add_item" || modal === "edit_item") ? (
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1.4fr 1fr", gap: "10px" }}>
                  <div><label style={labelStyle}>SKU</label><input style={inputStyle} value={itemForm.sku} onChange={(e) => setItemForm((f) => ({ ...f, sku: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Name</label><input style={inputStyle} value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Category</label><input style={inputStyle} value={itemForm.category} onChange={(e) => setItemForm((f) => ({ ...f, category: e.target.value }))} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "10px" }}>
                  <div><label style={labelStyle}>Supplier</label><input style={inputStyle} value={itemForm.supplier} onChange={(e) => setItemForm((f) => ({ ...f, supplier: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Warehouse</label><input style={inputStyle} value={itemForm.warehouse} onChange={(e) => setItemForm((f) => ({ ...f, warehouse: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Status</label><select style={inputStyle} value={itemForm.status} onChange={(e) => setItemForm((f) => ({ ...f, status: e.target.value as SupplyItem["status"] }))}><option value="healthy">healthy</option><option value="low_stock">low_stock</option><option value="out_of_stock">out_of_stock</option><option value="discontinued">discontinued</option></select></div>
                  <div><label style={labelStyle}>Unit Cost</label><input style={inputStyle} type="number" value={itemForm.unit_cost} onChange={(e) => setItemForm((f) => ({ ...f, unit_cost: e.target.value }))} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr 1fr" : "1fr 1fr 1fr 1fr 1fr", gap: "10px" }}>
                  <div><label style={labelStyle}>On Hand</label><input style={inputStyle} type="number" value={itemForm.on_hand_qty} onChange={(e) => setItemForm((f) => ({ ...f, on_hand_qty: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Reserved</label><input style={inputStyle} type="number" value={itemForm.reserved_qty} onChange={(e) => setItemForm((f) => ({ ...f, reserved_qty: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Safety Stock</label><input style={inputStyle} type="number" value={itemForm.safety_stock} onChange={(e) => setItemForm((f) => ({ ...f, safety_stock: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Reorder Point</label><input style={inputStyle} type="number" value={itemForm.reorder_point} onChange={(e) => setItemForm((f) => ({ ...f, reorder_point: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Lead Time (days)</label><input style={inputStyle} type="number" value={itemForm.lead_time_days} onChange={(e) => setItemForm((f) => ({ ...f, lead_time_days: e.target.value }))} /></div>
                </div>
                <div><label style={labelStyle}>Last Received</label><input style={inputStyle} type="datetime-local" value={itemForm.last_received_at} onChange={(e) => setItemForm((f) => ({ ...f, last_received_at: e.target.value }))} /></div>
                <div><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, minHeight: "84px", resize: "vertical" }} value={itemForm.notes} onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))} /></div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexDirection: isDenseLayout ? "column-reverse" : "row" }}>
                  <button onClick={() => setModal(null)} style={{ padding: "8px 14px", borderRadius: "9px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", color: "var(--text-muted)", cursor: "pointer", width: isDenseLayout ? "100%" : "auto" }}>Cancel</button>
                  <button onClick={() => void saveItem()} disabled={loading} style={{ padding: "8px 14px", borderRadius: "9px", border: "none", background: "var(--accent)", color: "white", fontWeight: 600, cursor: "pointer", width: isDenseLayout ? "100%" : "auto" }}>{loading ? "Saving..." : "Save Item"}</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr 1fr", gap: "10px" }}>
                  <div><label style={labelStyle}>Shipment Ref</label><input style={inputStyle} value={shipmentForm.shipment_ref} onChange={(e) => setShipmentForm((f) => ({ ...f, shipment_ref: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Direction</label><select style={inputStyle} value={shipmentForm.direction} onChange={(e) => setShipmentForm((f) => ({ ...f, direction: e.target.value as Shipment["direction"] }))}><option value="inbound">inbound</option><option value="outbound">outbound</option></select></div>
                  <div><label style={labelStyle}>Status</label><select style={inputStyle} value={shipmentForm.status} onChange={(e) => setShipmentForm((f) => ({ ...f, status: e.target.value as Shipment["status"] }))}><option value="planned">planned</option><option value="in_transit">in_transit</option><option value="delivered">delivered</option><option value="delayed">delayed</option><option value="cancelled">cancelled</option></select></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr 1fr", gap: "10px" }}>
                  <div><label style={labelStyle}>Partner</label><input style={inputStyle} value={shipmentForm.partner} onChange={(e) => setShipmentForm((f) => ({ ...f, partner: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Origin</label><input style={inputStyle} value={shipmentForm.origin} onChange={(e) => setShipmentForm((f) => ({ ...f, origin: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Destination</label><input style={inputStyle} value={shipmentForm.destination} onChange={(e) => setShipmentForm((f) => ({ ...f, destination: e.target.value }))} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "10px" }}>
                  <div><label style={labelStyle}>ETA</label><input style={inputStyle} type="datetime-local" value={shipmentForm.eta} onChange={(e) => setShipmentForm((f) => ({ ...f, eta: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Shipped At</label><input style={inputStyle} type="datetime-local" value={shipmentForm.shipped_at} onChange={(e) => setShipmentForm((f) => ({ ...f, shipped_at: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Delivered At</label><input style={inputStyle} type="datetime-local" value={shipmentForm.delivered_at} onChange={(e) => setShipmentForm((f) => ({ ...f, delivered_at: e.target.value }))} /></div>
                  <div><label style={labelStyle}>Freight Cost</label><input style={inputStyle} type="number" value={shipmentForm.freight_cost} onChange={(e) => setShipmentForm((f) => ({ ...f, freight_cost: e.target.value }))} /></div>
                </div>
                <div><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, minHeight: "84px", resize: "vertical" }} value={shipmentForm.notes} onChange={(e) => setShipmentForm((f) => ({ ...f, notes: e.target.value }))} /></div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexDirection: isDenseLayout ? "column-reverse" : "row" }}>
                  <button onClick={() => setModal(null)} style={{ padding: "8px 14px", borderRadius: "9px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", color: "var(--text-muted)", cursor: "pointer", width: isDenseLayout ? "100%" : "auto" }}>Cancel</button>
                  <button onClick={() => void saveShipment()} disabled={loading} style={{ padding: "8px 14px", borderRadius: "9px", border: "none", background: "var(--accent)", color: "white", fontWeight: 600, cursor: "pointer", width: isDenseLayout ? "100%" : "auto" }}>{loading ? "Saving..." : "Save Shipment"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
