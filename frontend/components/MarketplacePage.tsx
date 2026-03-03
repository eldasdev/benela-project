"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingCart, Search, PlugZap, ToggleLeft, ToggleRight } from "lucide-react";
import { getClientWorkspaceId } from "@/lib/client-settings";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  is_featured: boolean;
};

type PluginPurchase = {
  id: number;
  plugin_id: number;
  billing_cycle: "monthly" | "yearly" | "one_time";
  status: "pending" | "active" | "cancelled" | "refunded";
  amount: number;
  currency: string;
  created_at: string;
};

type PluginInstall = {
  id: number;
  plugin_id: number;
  status: "pending" | "installed" | "failed" | "uninstalled";
  is_enabled: boolean;
  created_at: string;
};

type MarketplaceSummary = {
  total_items: number;
  active: number;
  pending: number;
  completed: number;
  monthly_spend: number;
};

const CATEGORY_LABELS: { id: "all" | PluginCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "finance", label: "Finance" },
  { id: "hr", label: "HR" },
  { id: "operations", label: "Operations" },
  { id: "analytics", label: "Analytics" },
  { id: "communication", label: "Communication" },
  { id: "security", label: "Security" },
  { id: "other", label: "Other" },
];

export default function MarketplacePage() {
  const [summary, setSummary] = useState<MarketplaceSummary | null>(null);
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([]);
  const [purchases, setPurchases] = useState<PluginPurchase[]>([]);
  const [installs, setInstalls] = useState<PluginInstall[]>([]);
  const [category, setCategory] = useState<"all" | PluginCategory>("all");
  const [query, setQuery] = useState("");
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const loadMarketplace = useCallback(async () => {
    const workspaceId = getClientWorkspaceId();
    const params = new URLSearchParams({ workspace_id: workspaceId });
    const pluginParams = new URLSearchParams();
    if (category !== "all") pluginParams.set("category", category);
    if (query.trim()) pluginParams.set("q", query.trim());
    setError("");

    try {
      const [sumRes, pluginRes, purchaseRes, installRes] = await Promise.all([
        fetch(`${API}/marketplace/summary?${params.toString()}`),
        fetch(`${API}/marketplace/plugins?${pluginParams.toString()}`),
        fetch(`${API}/marketplace/purchases?${params.toString()}`),
        fetch(`${API}/marketplace/installs?${params.toString()}`),
      ]);

      setSummary(sumRes.ok ? await sumRes.json() : null);
      setPlugins(pluginRes.ok ? await pluginRes.json() : []);
      setPurchases(purchaseRes.ok ? await purchaseRes.json() : []);
      setInstalls(installRes.ok ? await installRes.json() : []);
      if (!sumRes.ok || !pluginRes.ok || !purchaseRes.ok || !installRes.ok) {
        setError("Some marketplace data is temporarily unavailable.");
      }
    } catch (e) {
      console.error("Failed to load marketplace", e);
      setError("Could not connect to the backend service.");
      setSummary(null);
      setPlugins([]);
      setPurchases([]);
      setInstalls([]);
    }
  }, [category, query]);

  useEffect(() => {
    loadMarketplace();
  }, [loadMarketplace]);

  const pluginById = useMemo(() => {
    const map = new Map<number, MarketplacePlugin>();
    for (const p of plugins) map.set(p.id, p);
    return map;
  }, [plugins]);

  const ownedPluginIds = useMemo(
    () => new Set(purchases.filter((p) => p.status === "active").map((p) => p.plugin_id)),
    [purchases]
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadMarketplace();
  };

  const buyPlugin = async (plugin: MarketplacePlugin) => {
    setLoadingId(plugin.id);
    try {
      const workspaceId = getClientWorkspaceId();
      await fetch(`${API}/marketplace/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          plugin_id: plugin.id,
          billing_cycle: "monthly",
          currency: "USD",
        }),
      });
      await loadMarketplace();
    } finally {
      setLoadingId(null);
    }
  };

  const togglePlugin = async (pluginId: number, isEnabled: boolean) => {
    setLoadingId(pluginId);
    try {
      const workspaceId = getClientWorkspaceId();
      await fetch(`${API}/marketplace/plugins/${pluginId}/enable`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          is_enabled: isEnabled,
        }),
      });
      await loadMarketplace();
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1280px", margin: "0 auto" }}>
      {error ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid var(--danger-soft-border)",
            background: "var(--danger-soft-bg)",
            color: "var(--danger)",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      ) : null}
      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          {[
            { label: "Total Items", value: String(summary.total_items), color: "var(--accent)" },
            { label: "Active", value: String(summary.active), color: "var(--success)" },
            { label: "Pending", value: String(summary.pending), color: "#fbbf24" },
            { label: "Completed", value: String(summary.completed), color: "#60a5fa" },
            { label: "Monthly Spend", value: `$${summary.monthly_spend.toLocaleString()}`, color: "var(--danger)" },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "12px",
                padding: "16px 18px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginBottom: "8px" }}>{card.label}</p>
              <p style={{ fontSize: "24px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                {card.value}
              </p>
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "1px",
                  background: `linear-gradient(90deg, transparent, ${card.color}40, transparent)`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        {CATEGORY_LABELS.map((item) => (
          <button
            key={item.id}
            onClick={() => setCategory(item.id)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: category === item.id
                ? "1px solid color-mix(in srgb, var(--accent) 48%, var(--border-default))"
                : "1px solid var(--border-default)",
              background: category === item.id ? "var(--accent-soft)" : "var(--bg-elevated)",
              color: category === item.id ? "var(--accent)" : "var(--text-muted)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}

        <form onSubmit={handleSearch} style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              borderRadius: "9px",
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              padding: "0 10px",
              minWidth: "260px",
            }}
          >
            <Search size={13} color="var(--text-subtle)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search plugins..."
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                outline: "none",
                height: "32px",
                width: "100%",
                fontSize: "13px",
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              height: "34px",
              padding: "0 14px",
              borderRadius: "9px",
              border: "1px solid var(--border-soft)",
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </form>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        {plugins.map((plugin) => {
          const owned = ownedPluginIds.has(plugin.id);
          return (
            <div
              key={plugin.id}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "14px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "8px",
                      background: "var(--accent-soft)",
                      border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--border-default))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "15px",
                    }}
                  >
                    {plugin.icon || "🔌"}
                  </div>
                  <div>
                    <p style={{ fontSize: "13px", color: "var(--text-primary)", margin: 0, fontWeight: 600 }}>
                      {plugin.name}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>
                      {plugin.vendor} • {plugin.category}
                    </p>
                  </div>
                </div>
                {plugin.is_featured && (
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "3px 7px",
                      borderRadius: "999px",
                      color: "var(--accent)",
                      background: "var(--accent-soft)",
                      border: "1px solid color-mix(in srgb, var(--accent) 34%, var(--border-default))",
                    }}
                  >
                    Featured
                  </span>
                )}
              </div>

              <p style={{ fontSize: "12px", color: "var(--text-muted)", minHeight: "34px", margin: 0, lineHeight: 1.5 }}>
                {plugin.description || "No description yet."}
              </p>

              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: "13px", color: "var(--success)", margin: 0, fontWeight: 600 }}>
                  ${plugin.price_monthly}/mo
                </p>
                <button
                  onClick={() => buyPlugin(plugin)}
                  disabled={owned || loadingId === plugin.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 11px",
                    borderRadius: "8px",
                    border: owned ? "1px solid var(--success-soft-border)" : "1px solid var(--border-soft)",
                    background: owned ? "var(--success-soft-bg)" : "var(--bg-elevated)",
                    color: owned ? "var(--success)" : "var(--text-muted)",
                    fontSize: "12px",
                    cursor: owned ? "not-allowed" : "pointer",
                  }}
                >
                  <ShoppingCart size={12} />
                  {owned ? "Purchased" : loadingId === plugin.id ? "Processing..." : "Buy"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "14px",
          overflow: "hidden",
          marginBottom: "16px",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)" }}>
          <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>Installed Plugins</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 120px",
            padding: "9px 16px",
            background: "var(--bg-panel)",
            borderBottom: "1px solid var(--border-soft)",
          }}
        >
          {["Plugin", "Status", "Enabled", "Action"].map((h) => (
            <span
              key={h}
              style={{
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-quiet)",
                fontFamily: "monospace",
              }}
            >
              {h}
            </span>
          ))}
        </div>
        {installs.length === 0 ? (
          <div style={{ padding: "14px 16px", color: "var(--text-subtle)", fontSize: "12px" }}>
            No plugins installed yet.
          </div>
        ) : (
          installs.map((install) => {
            const plugin = pluginById.get(install.plugin_id);
            return (
              <div
                key={install.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 120px",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--table-row-divider)",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  {plugin?.name || `Plugin #${install.plugin_id}`}
                </span>
                <span style={{ fontSize: "11px", color: install.status === "installed" ? "var(--success)" : "#fbbf24" }}>
                  {install.status}
                </span>
                <span style={{ fontSize: "11px", color: install.is_enabled ? "var(--success)" : "var(--text-muted)" }}>
                  {install.is_enabled ? "Enabled" : "Disabled"}
                </span>
                <button
                  onClick={() => togglePlugin(install.plugin_id, !install.is_enabled)}
                  disabled={loadingId === install.plugin_id}
                  style={{
                    justifySelf: "start",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-soft)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-muted)",
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  {install.is_enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  {install.is_enabled ? "Disable" : "Enable"}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "14px",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)" }}>
          <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>
            Purchase History
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            padding: "9px 16px",
            background: "var(--bg-panel)",
            borderBottom: "1px solid var(--border-soft)",
          }}
        >
          {["Plugin", "Billing", "Amount", "Status"].map((h) => (
            <span
              key={h}
              style={{
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-quiet)",
                fontFamily: "monospace",
              }}
            >
              {h}
            </span>
          ))}
        </div>
        {purchases.length === 0 ? (
          <div style={{ padding: "14px 16px", color: "var(--text-subtle)", fontSize: "12px" }}>
            No purchases yet.
          </div>
        ) : (
          purchases.map((purchase) => {
            const plugin = pluginById.get(purchase.plugin_id);
            return (
              <div
                key={purchase.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--table-row-divider)",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <PlugZap size={13} color="var(--text-muted)" />
                  {plugin?.name || `Plugin #${purchase.plugin_id}`}
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{purchase.billing_cycle}</span>
                <span style={{ fontSize: "12px", color: "var(--success)" }}>
                  {purchase.currency} {purchase.amount}
                </span>
                <span style={{ fontSize: "11px", color: purchase.status === "active" ? "var(--success)" : "#fbbf24" }}>
                  {purchase.status}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
