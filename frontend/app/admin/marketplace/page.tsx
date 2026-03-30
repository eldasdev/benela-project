"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Package2, Pencil, Plus, RefreshCcw, Star, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { formatDateTime, formatMoney, readErrorMessage } from "@/lib/admin-utils";
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

type PluginCategory = "finance" | "hr" | "operations" | "analytics" | "communication" | "security" | "other";

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
  created_at: string;
};

type PluginPurchase = {
  id: number;
  workspace_id: string;
  plugin_id: number;
  billing_cycle: "monthly" | "yearly" | "one_time";
  status: "pending" | "active" | "cancelled" | "refunded";
  amount: number;
  currency: string;
  started_at?: string | null;
  created_at: string;
};

type PluginInstall = {
  id: number;
  workspace_id: string;
  plugin_id: number;
  purchase_id?: number | null;
  status: "pending" | "installed" | "failed" | "uninstalled";
  is_enabled: boolean;
  installed_at?: string | null;
  created_at: string;
};

type MarketplaceSummary = {
  total_plugins: number;
  active_plugins: number;
  featured_plugins: number;
  total_purchases: number;
  active_installs: number;
  unique_workspaces: number;
  monthly_revenue: number;
};

type PluginForm = {
  slug: string;
  name: string;
  description: string;
  vendor: string;
  category: PluginCategory;
  icon: string;
  tags: string;
  price_monthly: string;
  price_yearly: string;
  is_active: boolean;
  is_featured: boolean;
};

const CATEGORY_OPTIONS: PluginCategory[] = ["finance", "hr", "operations", "analytics", "communication", "security", "other"];
const EMPTY_FORM: PluginForm = {
  slug: "",
  name: "",
  description: "",
  vendor: "Benela",
  category: "other",
  icon: "🔌",
  tags: "",
  price_monthly: "19",
  price_yearly: "190",
  is_active: true,
  is_featured: false,
};

function pluginTone(plugin: MarketplacePlugin): "accent" | "success" | "warning" | "danger" | "neutral" {
  if (!plugin.is_active) return "neutral";
  if (plugin.is_featured) return "accent";
  if (plugin.category === "analytics") return "warning";
  return "success";
}

export default function AdminMarketplacePage() {
  const [summary, setSummary] = useState<MarketplaceSummary | null>(null);
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([]);
  const [purchases, setPurchases] = useState<PluginPurchase[]>([]);
  const [installs, setInstalls] = useState<PluginInstall[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPlugin, setSelectedPlugin] = useState<MarketplacePlugin | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingPlugin, setEditingPlugin] = useState<MarketplacePlugin | null>(null);
  const [form, setForm] = useState<PluginForm>(EMPTY_FORM);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const pluginQuery = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      const [summaryRes, pluginsRes, purchasesRes, installsRes] = await Promise.all([
        authFetch(`${API}/marketplace/admin/summary`),
        authFetch(`${API}/marketplace/admin/plugins${pluginQuery}`),
        authFetch(`${API}/marketplace/admin/purchases`),
        authFetch(`${API}/marketplace/admin/installs`),
      ]);
      if (!summaryRes.ok || !pluginsRes.ok || !purchasesRes.ok || !installsRes.ok) {
        throw new Error("Failed to load marketplace admin data");
      }
      setSummary((await summaryRes.json()) as MarketplaceSummary);
      setPlugins((await pluginsRes.json()) as MarketplacePlugin[]);
      setPurchases((await purchasesRes.json()) as PluginPurchase[]);
      setInstalls((await installsRes.json()) as PluginInstall[]);
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not load marketplace operations."));
      setSummary(null);
      setPlugins([]);
      setPurchases([]);
      setInstalls([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const pluginMap = useMemo(() => new Map(plugins.map((plugin) => [plugin.id, plugin])), [plugins]);

  const filteredPlugins = useMemo(() => {
    if (categoryFilter === "all") return plugins;
    return plugins.filter((plugin) => plugin.category === categoryFilter);
  }, [categoryFilter, plugins]);

  const workspaceAdoption = useMemo(() => {
    const counts = new Map<string, number>();
    installs.forEach((install) => counts.set(install.workspace_id, (counts.get(install.workspace_id) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [installs]);

  const openCreate = () => {
    setEditingPlugin(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (plugin: MarketplacePlugin) => {
    setEditingPlugin(plugin);
    setForm({
      slug: plugin.slug,
      name: plugin.name,
      description: plugin.description || "",
      vendor: plugin.vendor,
      category: plugin.category,
      icon: plugin.icon || "🔌",
      tags: plugin.tags || "",
      price_monthly: String(plugin.price_monthly),
      price_yearly: String(plugin.price_yearly || ""),
      is_active: plugin.is_active,
      is_featured: plugin.is_featured,
    });
    setShowModal(true);
  };

  const savePlugin = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!form.slug.trim()) throw new Error("Plugin slug is required.");
      if (!form.name.trim()) throw new Error("Plugin name is required.");
      const response = await authFetch(`${API}${editingPlugin ? `/marketplace/plugins/${editingPlugin.id}` : "/marketplace/plugins"}`, {
        method: editingPlugin ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: form.slug.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          vendor: form.vendor.trim() || "Benela",
          category: form.category,
          icon: form.icon.trim() || null,
          tags: form.tags.trim() || null,
          price_monthly: Number(form.price_monthly || 0),
          price_yearly: form.price_yearly.trim() ? Number(form.price_yearly) : null,
          is_active: form.is_active,
          is_featured: form.is_featured,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to save plugin");
      }
      setNotice(editingPlugin ? "Plugin updated." : "Plugin published.");
      setShowModal(false);
      setEditingPlugin(null);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not save plugin."));
    } finally {
      setSaving(false);
    }
  };

  const patchPlugin = async (plugin: MarketplacePlugin, patch: Partial<MarketplacePlugin>) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`${API}/marketplace/plugins/${plugin.id}`, {
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
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to update plugin");
      }
      setNotice(`${plugin.name} updated.`);
      await loadData();
    } catch (err: unknown) {
      setError(readErrorMessage(err, "Could not update plugin."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1540px", margin: "0 auto", display: "grid", gap: "22px" }}>
      <AdminPageHero
        eyebrow="Extension Platform"
        title="Marketplace"
        subtitle="Manage the plugin catalog, inspect purchase and install activity, and monitor adoption across client workspaces."
        actions={
          <>
            <button type="button" style={adminButtonStyle("secondary")} onClick={() => void loadData()}>
              <RefreshCcw size={16} /> Refresh
            </button>
            <button type="button" style={adminButtonStyle("primary")} onClick={openCreate}>
              <Plus size={16} /> Publish Plugin
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
        <AdminMetricCard label="Total plugins" value={summary?.total_plugins ?? 0} detail="Published catalog entries" tone="accent" />
        <AdminMetricCard label="Active plugins" value={summary?.active_plugins ?? 0} detail="Available to client workspaces" tone="success" />
        <AdminMetricCard label="Featured" value={summary?.featured_plugins ?? 0} detail="Highlighted in catalog" tone="warning" />
        <AdminMetricCard label="Purchases" value={summary?.total_purchases ?? 0} detail="Recorded commercial transactions" tone="accent" />
        <AdminMetricCard label="Active installs" value={summary?.active_installs ?? 0} detail="Installed or enabled on workspaces" tone="success" />
        <AdminMetricCard label="Monthly revenue" value={formatMoney(summary?.monthly_revenue ?? 0)} detail={`${summary?.unique_workspaces ?? 0} active workspaces`} tone="accent" />
      </AdminMetricGrid>

      <AdminSectionCard title="Plugin catalog" description="The catalog is the primary operational surface. Publishing and editing now happens in a modal so the list stays dominant.">
        <AdminFilterBar>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plugin by slug, name, vendor..." style={adminInputStyle({ flex: 2, minWidth: "240px" })} />
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} style={adminInputStyle({ flex: 1, minWidth: "180px" })}>
            <option value="all">All categories</option>
            {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </AdminFilterBar>

        {filteredPlugins.length ? (
          <AdminDataTable>
            <AdminTableHead columns={[
              <span key="plugin">Plugin</span>,
              <span key="vendor">Vendor</span>,
              <span key="pricing">Pricing</span>,
              <span key="state">State</span>,
              <span key="catalog">Catalog</span>,
              <span key="actions">Actions</span>,
            ]} />
            {filteredPlugins.map((plugin) => (
              <AdminTableRow key={plugin.id} style={{ gridTemplateColumns: "1.4fr 0.8fr 0.9fr 0.9fr 0.85fr 1fr" }}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <button type="button" onClick={() => setSelectedPlugin(plugin)} style={{ background: "none", border: 0, padding: 0, margin: 0, textAlign: "left", cursor: "pointer", color: "var(--text-primary)", fontWeight: 700, fontSize: "15px" }}>
                    <span style={{ marginRight: "8px" }}>{plugin.icon || "🔌"}</span>{plugin.name}
                  </button>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{plugin.slug} · {plugin.description || "No description"}</div>
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{plugin.vendor}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{plugin.category}</span>
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{formatMoney(plugin.price_monthly)}/mo</span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{plugin.price_yearly ? `${formatMoney(plugin.price_yearly)}/yr` : "No yearly price"}</span>
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  <AdminPill label={plugin.is_active ? "Active" : "Disabled"} tone={plugin.is_active ? "success" : "neutral"} />
                  <AdminPill label={plugin.is_featured ? "Featured" : "Standard"} tone={plugin.is_featured ? "accent" : "neutral"} />
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <AdminPill label={plugin.category} tone={pluginTone(plugin)} />
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{plugin.tags || "No tags"}</span>
                </div>
                <AdminActionMenu>
                  <button type="button" style={adminButtonStyle("secondary", { minHeight: "36px", padding: "0 10px" })} onClick={() => openEdit(plugin)}><Pencil size={14} /> Edit</button>
                  <button type="button" style={adminButtonStyle(plugin.is_active ? "ghost" : "secondary", { minHeight: "36px", padding: "0 10px" })} onClick={() => void patchPlugin(plugin, { is_active: !plugin.is_active })}>
                    {plugin.is_active ? <X size={14} /> : <Check size={14} />} {plugin.is_active ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    style={adminButtonStyle(plugin.is_featured ? "secondary" : "ghost", { minHeight: "36px", padding: "0 10px" })}
                    onClick={() => void patchPlugin(plugin, { is_featured: !plugin.is_featured })}
                  >
                    <Star size={14} /> {plugin.is_featured ? "Unfeature" : "Feature"}
                  </button>
                </AdminActionMenu>
              </AdminTableRow>
            ))}
          </AdminDataTable>
        ) : (
          <AdminEmptyState title={loading ? "Loading plugins..." : "No plugins match these filters"} description="Adjust the search or publish a new plugin into the catalog." action={<button type="button" style={adminButtonStyle("primary")} onClick={openCreate}><Plus size={16} /> Publish Plugin</button>} />
        )}
      </AdminSectionCard>

      <div className="admin-responsive-triple admin-responsive-triple-marketplace" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.9fr", gap: "18px", alignItems: "start" }}>
        <AdminSectionCard title="Recent purchases" description="Latest commercial activity across the plugin catalog.">
          {purchases.length ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {purchases.slice(0, 6).map((purchase) => (
                <div key={purchase.id} className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{pluginMap.get(purchase.plugin_id)?.name || `Plugin #${purchase.plugin_id}`}</div>
                    <AdminPill label={purchase.status} tone={purchase.status === "active" ? "success" : purchase.status === "pending" ? "warning" : "neutral"} />
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{purchase.workspace_id} · {purchase.billing_cycle}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "12px" }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{purchase.currency} {Number(purchase.amount).toLocaleString()}</span>
                    <span style={{ color: "var(--text-subtle)" }}>{formatDateTime(purchase.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <AdminEmptyState title="No purchases yet" description="Marketplace purchase activity will appear here as client workspaces start buying plugins." />}
        </AdminSectionCard>

        <AdminSectionCard title="Recent installs" description="Operational install state across workspaces and plugin purchases.">
          {installs.length ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {installs.slice(0, 6).map((install) => (
                <div key={install.id} className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{pluginMap.get(install.plugin_id)?.name || `Plugin #${install.plugin_id}`}</div>
                    <AdminPill label={install.status} tone={install.status === "installed" ? "success" : install.status === "pending" ? "warning" : install.status === "failed" ? "danger" : "neutral"} />
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{install.workspace_id}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "12px" }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{install.is_enabled ? "Enabled" : "Disabled"}</span>
                    <span style={{ color: "var(--text-subtle)" }}>{formatDateTime(install.installed_at || install.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <AdminEmptyState title="No installs yet" description="Install operations will appear here once workspaces activate marketplace plugins." />}
        </AdminSectionCard>

        <AdminSectionCard title="Workspace adoption" description="Top workspaces by current plugin install count.">
          {workspaceAdoption.length ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {workspaceAdoption.map(([workspaceId, count]) => (
                <div key={workspaceId} className="admin-ui-surface" style={{ padding: "14px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{workspaceId}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Installed plugins</div>
                  </div>
                  <AdminPill label={`${count}`} tone="accent" />
                </div>
              ))}
            </div>
          ) : <AdminEmptyState title="No adoption data" description="Workspace adoption will populate once client installs start flowing through the marketplace." />}
        </AdminSectionCard>
      </div>

      <AdminModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingPlugin(null);
          setForm(EMPTY_FORM);
        }}
        title={editingPlugin ? `Edit ${editingPlugin.name}` : "Publish plugin"}
        description="Create or update catalog metadata without sacrificing the catalog view itself."
        width={820}
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <div className="admin-form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Slug</span>
              <input value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Name</span>
              <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} style={adminInputStyle()} />
            </label>
          </div>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Description</span>
            <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} style={adminInputStyle({ minHeight: "96px", padding: "12px 14px", resize: "vertical" })} />
          </label>
          <div className="admin-form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Vendor</span>
              <input value={form.vendor} onChange={(event) => setForm((prev) => ({ ...prev, vendor: event.target.value }))} style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Category</span>
              <select value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value as PluginCategory }))} style={adminInputStyle()}>
                {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Icon</span>
              <input value={form.icon} onChange={(event) => setForm((prev) => ({ ...prev, icon: event.target.value }))} style={adminInputStyle()} />
            </label>
          </div>
          <div className="admin-form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Monthly price</span>
              <input type="number" min="0" step="0.01" value={form.price_monthly} onChange={(event) => setForm((prev) => ({ ...prev, price_monthly: event.target.value }))} style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Yearly price</span>
              <input type="number" min="0" step="0.01" value={form.price_yearly} onChange={(event) => setForm((prev) => ({ ...prev, price_yearly: event.target.value }))} style={adminInputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Tags</span>
              <input value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} style={adminInputStyle()} />
            </label>
          </div>
          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)", fontSize: "13px" }}>
              <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
              Active
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)", fontSize: "13px" }}>
              <input type="checkbox" checked={form.is_featured} onChange={(event) => setForm((prev) => ({ ...prev, is_featured: event.target.checked }))} />
              Featured
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button type="button" style={adminButtonStyle("ghost")} onClick={() => setShowModal(false)}>Close</button>
            <button type="button" style={adminButtonStyle("primary")} onClick={() => void savePlugin()} disabled={saving}>
              <Plus size={16} /> {saving ? "Saving..." : editingPlugin ? "Update plugin" : "Publish plugin"}
            </button>
          </div>
        </div>
      </AdminModal>

      <AdminDrawer
        open={Boolean(selectedPlugin)}
        onClose={() => setSelectedPlugin(null)}
        title={selectedPlugin?.name || "Plugin detail"}
        description={selectedPlugin ? `${selectedPlugin.slug} · ${selectedPlugin.vendor}` : undefined}
        width={560}
      >
        {selectedPlugin ? (
          <div style={{ display: "grid", gap: "16px" }}>
            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <AdminPill label={selectedPlugin.category} tone={pluginTone(selectedPlugin)} />
                <AdminPill label={selectedPlugin.is_active ? "Active" : "Disabled"} tone={selectedPlugin.is_active ? "success" : "neutral"} />
                <AdminPill label={selectedPlugin.is_featured ? "Featured" : "Standard"} tone={selectedPlugin.is_featured ? "accent" : "neutral"} />
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.65 }}>{selectedPlugin.description || "No description provided."}</div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Created {formatDateTime(selectedPlugin.created_at)}</div>
            </div>
            <div className="admin-ui-surface" style={{ padding: "14px", display: "grid", gap: "8px", fontSize: "13px" }}>
              <div><strong>Vendor:</strong> {selectedPlugin.vendor}</div>
              <div><strong>Pricing:</strong> {formatMoney(selectedPlugin.price_monthly)}/mo · {selectedPlugin.price_yearly ? `${formatMoney(selectedPlugin.price_yearly)}/yr` : "No yearly price"}</div>
              <div><strong>Tags:</strong> {selectedPlugin.tags || "—"}</div>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="button" style={adminButtonStyle("secondary")} onClick={() => openEdit(selectedPlugin)}><Pencil size={16} /> Edit plugin</button>
              <button type="button" style={adminButtonStyle(selectedPlugin.is_featured ? "ghost" : "secondary")} onClick={() => void patchPlugin(selectedPlugin, { is_featured: !selectedPlugin.is_featured })}><Star size={16} /> Toggle featured</button>
              <button type="button" style={adminButtonStyle(selectedPlugin.is_active ? "danger" : "secondary")} onClick={() => void patchPlugin(selectedPlugin, { is_active: !selectedPlugin.is_active })}>{selectedPlugin.is_active ? "Disable" : "Enable"}</button>
            </div>
          </div>
        ) : null}
      </AdminDrawer>
    </div>
  );
}
