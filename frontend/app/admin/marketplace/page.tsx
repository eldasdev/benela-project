"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCcw, Check, X } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `/api` : "http://localhost:8000");

type PluginCategory =
  | "finance"
  | "hr"
  | "operations"
  | "analytics"
  | "communication"
  | "security"
  | "other";

type MarketplacePlugin = {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  vendor: string;
  category: PluginCategory;
  icon?: string | null;
  tags?: string | null;
  price_monthly: number;
  price_yearly?: number | null;
  is_active: boolean;
  is_featured: boolean;
};

type PluginPurchase = {
  id: number;
  workspace_id: string;
  plugin_id: number;
  billing_cycle: "monthly" | "yearly" | "one_time";
  status: "pending" | "active" | "cancelled" | "refunded";
  amount: number;
  currency: string;
  created_at: string;
};

type PluginInstall = {
  id: number;
  workspace_id: string;
  plugin_id: number;
  status: "pending" | "installed" | "failed" | "uninstalled";
  is_enabled: boolean;
  created_at: string;
};

type AdminSummary = {
  total_plugins: number;
  active_plugins: number;
  featured_plugins: number;
  total_purchases: number;
  active_installs: number;
  unique_workspaces: number;
  monthly_revenue: number;
};

const CATEGORY_OPTIONS: PluginCategory[] = [
  "finance",
  "hr",
  "operations",
  "analytics",
  "communication",
  "security",
  "other",
];

const EMPTY_FORM = {
  slug: "",
  name: "",
  description: "",
  vendor: "Benela",
  category: "other" as PluginCategory,
  icon: "🔌",
  tags: "",
  price_monthly: "19",
  price_yearly: "190",
  is_active: true,
  is_featured: false,
};

export default function AdminMarketplacePage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([]);
  const [purchases, setPurchases] = useState<PluginPurchase[]>([]);
  const [installs, setInstalls] = useState<PluginInstall[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = useCallback(async (q: string) => {
    setLoading(true);
    const pluginQuery = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    try {
      const [summaryRes, pluginsRes, purchasesRes, installsRes] = await Promise.all([
        fetch(`${API}/marketplace/admin/summary`),
        fetch(`${API}/marketplace/admin/plugins${pluginQuery}`),
        fetch(`${API}/marketplace/admin/purchases`),
        fetch(`${API}/marketplace/admin/installs`),
      ]);

      setSummary(summaryRes.ok ? await summaryRes.json() : null);
      setPlugins(pluginsRes.ok ? await pluginsRes.json() : []);
      setPurchases(purchasesRes.ok ? await purchasesRes.json() : []);
      setInstalls(installsRes.ok ? await installsRes.json() : []);
    } catch (err) {
      console.error("Failed to load admin marketplace", err);
      setSummary(null);
      setPlugins([]);
      setPurchases([]);
      setInstalls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer first load to avoid sync setState-in-effect lint rule.
    const t = setTimeout(() => {
      void loadData("");
    }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const pluginById = useMemo(() => {
    const map = new Map<number, MarketplacePlugin>();
    for (const p of plugins) map.set(p.id, p);
    return map;
  }, [plugins]);

  const submitPlugin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch(`${API}/marketplace/plugins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: form.slug.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          vendor: form.vendor.trim() || "Benela",
          category: form.category,
          icon: form.icon.trim() || null,
          tags: form.tags.trim() || null,
          price_monthly: Number(form.price_monthly || "0"),
          price_yearly: form.price_yearly.trim() ? Number(form.price_yearly) : null,
          is_active: form.is_active,
          is_featured: form.is_featured,
        }),
      });
      setForm(EMPTY_FORM);
      await loadData(query);
    } catch (err) {
      console.error("Failed to publish plugin", err);
    }
  };

  const patchPlugin = async (plugin: MarketplacePlugin, patch: Partial<MarketplacePlugin>) => {
    setSavingId(plugin.id);
    try {
      await fetch(`${API}/marketplace/plugins/${plugin.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: patch.name ?? plugin.name,
          description: patch.description ?? plugin.description ?? null,
          vendor: patch.vendor ?? plugin.vendor,
          category: patch.category ?? plugin.category,
          icon: patch.icon ?? plugin.icon ?? null,
          tags: patch.tags ?? plugin.tags ?? null,
          price_monthly: patch.price_monthly ?? plugin.price_monthly,
          price_yearly: patch.price_yearly ?? plugin.price_yearly ?? null,
          is_active: patch.is_active ?? plugin.is_active,
          is_featured: patch.is_featured ?? plugin.is_featured,
        }),
      });
      await loadData(query);
    } catch (err) {
      console.error("Failed to update plugin", err);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1450px", margin: "0 auto" }}>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Marketplace Manager
        </h1>
        <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
          Publish plugins/services and monitor purchases/activations across all client workspaces.
        </p>
      </div>

      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {[
            ["Total Plugins", String(summary.total_plugins), "var(--accent)"],
            ["Active Plugins", String(summary.active_plugins), "#34d399"],
            ["Featured", String(summary.featured_plugins), "#fbbf24"],
            ["Purchases", String(summary.total_purchases), "#60a5fa"],
            ["Active Installs", String(summary.active_installs), "#22c55e"],
            ["Workspaces", String(summary.unique_workspaces), "#f59e0b"],
            ["Monthly Rev", `$${summary.monthly_revenue.toLocaleString()}`, "var(--accent)"],
          ].map(([label, value, color]) => (
            <div
              key={label}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid #1e1e2a",
                borderRadius: "10px",
                padding: "12px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ fontSize: "10px", color: "var(--text-subtle)", marginBottom: "6px" }}>{label}</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "1px",
                  background: `linear-gradient(90deg, transparent, ${color}55, transparent)`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1.85fr", gap: "16px", marginBottom: "16px" }}>
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid #1e1e2a",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <h2 style={{ fontSize: "14px", color: "#e2e2e8", margin: "0 0 12px" }}>Publish Plugin</h2>
          <form onSubmit={submitPlugin} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <input
                placeholder="Slug (e.g. hubspot-sync)"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                style={inputStyle}
                required
              />
              <input
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={inputStyle}
                required
              />
            </div>
            <textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <input
                placeholder="Vendor"
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                style={inputStyle}
              />
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as PluginCategory }))}
                style={inputStyle}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                placeholder="Icon (emoji)"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <input
              placeholder="Tags (comma separated)"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              style={inputStyle}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Monthly price"
                value={form.price_monthly}
                onChange={(e) => setForm((f) => ({ ...f, price_monthly: e.target.value }))}
                style={inputStyle}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Yearly price"
                value={form.price_yearly}
                onChange={(e) => setForm((f) => ({ ...f, price_yearly: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "var(--text-muted)" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
                />
                Featured
              </label>
            </div>
            <button type="submit" style={primaryBtn}>
              <Plus size={13} /> Publish Plugin
            </button>
          </form>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid #1e1e2a",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderBottom: "1px solid #1e1e2a",
            }}
          >
            <h2 style={{ fontSize: "14px", color: "#e2e2e8", margin: 0 }}>Plugin Catalog</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                placeholder="Search plugin..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ ...inputStyle, width: "220px", height: "30px" }}
              />
              <button
                onClick={() => loadData(query)}
                style={{ ...secondaryBtn, height: "30px", padding: "0 10px" }}
                type="button"
              >
                {loading ? "..." : "Search"}
              </button>
              <button
                onClick={() => loadData(query)}
                style={{ ...secondaryBtn, height: "30px", padding: "0 10px" }}
                type="button"
              >
                <RefreshCcw size={12} />
              </button>
            </div>
          </div>

          <div style={tableHead("1.3fr 1fr 0.65fr 0.7fr 0.7fr 110px")}>
            {["Plugin", "Category", "Price", "Active", "Featured", "Actions"].map((h) => (
              <span key={h} style={thStyle}>
                {h}
              </span>
            ))}
          </div>
          {plugins.map((plugin) => (
            <div key={plugin.id} style={tableRow("1.3fr 1fr 0.65fr 0.7fr 0.7fr 110px")}>
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                {plugin.icon || "🔌"} {plugin.name}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{plugin.category}</span>
              <span style={{ fontSize: "12px", color: "#34d399" }}>${plugin.price_monthly}/mo</span>
              <span style={{ fontSize: "12px", color: plugin.is_active ? "#34d399" : "var(--text-muted)" }}>
                {plugin.is_active ? "Yes" : "No"}
              </span>
              <span style={{ fontSize: "12px", color: plugin.is_featured ? "#fbbf24" : "var(--text-muted)" }}>
                {plugin.is_featured ? "Yes" : "No"}
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => patchPlugin(plugin, { is_active: !plugin.is_active })}
                  type="button"
                  disabled={savingId === plugin.id}
                  style={miniBtn}
                >
                  {plugin.is_active ? <X size={11} /> : <Check size={11} />}
                </button>
                <button
                  onClick={() => patchPlugin(plugin, { is_featured: !plugin.is_featured })}
                  type="button"
                  disabled={savingId === plugin.id}
                  style={miniBtn}
                >
                  ★
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={panelStyle}>
          <div style={panelTitle}>Recent Purchases</div>
          <div style={tableHead("1fr 1fr 0.8fr 0.8fr")}>
            {["Workspace", "Plugin", "Amount", "Status"].map((h) => (
              <span key={h} style={thStyle}>
                {h}
              </span>
            ))}
          </div>
          {purchases.slice(0, 12).map((row) => (
            <div key={row.id} style={tableRow("1fr 1fr 0.8fr 0.8fr")}>
              <span style={tdMuted}>{row.workspace_id}</span>
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                {pluginById.get(row.plugin_id)?.name ?? `#${row.plugin_id}`}
              </span>
              <span style={{ fontSize: "12px", color: "#34d399" }}>
                {row.currency} {row.amount}
              </span>
              <span style={{ fontSize: "12px", color: row.status === "active" ? "#34d399" : "#fbbf24" }}>
                {row.status}
              </span>
            </div>
          ))}
        </div>

        <div style={panelStyle}>
          <div style={panelTitle}>Recent Installs</div>
          <div style={tableHead("1fr 1fr 0.8fr 0.8fr")}>
            {["Workspace", "Plugin", "Status", "Enabled"].map((h) => (
              <span key={h} style={thStyle}>
                {h}
              </span>
            ))}
          </div>
          {installs.slice(0, 12).map((row) => (
            <div key={row.id} style={tableRow("1fr 1fr 0.8fr 0.8fr")}>
              <span style={tdMuted}>{row.workspace_id}</span>
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                {pluginById.get(row.plugin_id)?.name ?? `#${row.plugin_id}`}
              </span>
              <span style={{ fontSize: "12px", color: row.status === "installed" ? "#34d399" : "#fbbf24" }}>
                {row.status}
              </span>
              <span style={{ fontSize: "12px", color: row.is_enabled ? "#34d399" : "var(--text-muted)" }}>
                {row.is_enabled ? "Yes" : "No"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "32px",
  borderRadius: "8px",
  border: "1px solid #262636",
  background: "var(--bg-elevated)",
  color: "#d8d8dd",
  padding: "0 10px",
  fontSize: "12px",
  outline: "none",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  height: "34px",
  borderRadius: "8px",
  border: "none",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 82%, #fff 18%), var(--accent-2))",
  color: "white",
  fontSize: "12px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  borderRadius: "8px",
  border: "1px solid #262636",
  background: "var(--bg-elevated)",
  color: "#aaa",
  fontSize: "12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  width: "28px",
  height: "24px",
  borderRadius: "6px",
  border: "1px solid #262636",
  background: "var(--bg-elevated)",
  color: "#aaa",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const panelStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid #1e1e2a",
  borderRadius: "12px",
  overflow: "hidden",
};

const panelTitle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #1e1e2a",
  fontSize: "14px",
  color: "#e2e2e8",
  fontWeight: 600,
};

const thStyle: React.CSSProperties = {
  fontSize: "10px",
  color: "#3f3f50",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontFamily: "monospace",
};

const tdMuted: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--text-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function tableHead(columns: string): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: columns,
    padding: "9px 14px",
    borderBottom: "1px solid #1a1a24",
    background: "var(--bg-panel)",
  };
}

function tableRow(columns: string): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: columns,
    alignItems: "center",
    padding: "10px 14px",
    borderBottom: "1px solid #171721",
    gap: "8px",
  };
}
