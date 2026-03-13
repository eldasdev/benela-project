"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Megaphone,
  CalendarDays,
  Users,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
} from "lucide-react";
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
};

const labelStyle = {
  fontSize: "11px",
  color: "var(--text-subtle)",
  marginBottom: "6px",
  display: "block",
};

type MarketingSummary = {
  total_campaigns: number;
  active_campaigns: number;
  total_content_items: number;
  content_pipeline: number;
  total_leads: number;
  mql_count: number;
  customers: number;
  pipeline_value: number;
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  cvr: number;
  cpa: number;
  cac: number;
  benchmark_roas: number;
  benchmark_ctr: number;
  benchmark_cvr: number;
  benchmark_cac: number;
  roas_gap_percent: number;
  ctr_gap_percent: number;
  cvr_gap_percent: number;
  cac_gap_percent: number;
};

type MarketingFunnel = {
  new: number;
  mql: number;
  sql: number;
  opportunity: number;
  customer: number;
  disqualified: number;
};

type MarketingBenchmarks = {
  source: string;
  roas_target: number;
  ctr_target_percent: number;
  cvr_target_percent: number;
  cac_target: number;
};

type Campaign = {
  id: number;
  name: string;
  channel: string;
  objective: string;
  status: string;
  owner?: string;
  budget: number;
  spent: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  start_date: string;
  end_date?: string | null;
  notes?: string;
};

type ContentItem = {
  id: number;
  title: string;
  content_type: string;
  channel: string;
  status: string;
  campaign_id?: number | null;
  assignee?: string | null;
  publish_date?: string | null;
  asset_url?: string | null;
  cta?: string | null;
};

type Lead = {
  id: number;
  full_name: string;
  email: string;
  company?: string | null;
  source_channel: string;
  campaign_id?: number | null;
  status: string;
  score: number;
  estimated_value: number;
  conversion_probability: number;
  notes?: string | null;
};

type ChannelMetric = {
  id: number;
  channel: string;
  period_label: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  leads: number;
  customers: number;
  conversions: number;
  benchmark_roas: number;
  benchmark_cvr: number;
  benchmark_ctr: number;
};

type ModalType =
  | null
  | "add_campaign"
  | "edit_campaign"
  | "add_content"
  | "edit_content"
  | "add_lead"
  | "edit_lead"
  | "add_channel"
  | "edit_channel";

const statusColor: Record<string, string> = {
  draft: "var(--text-muted)",
  scheduled: "#60a5fa",
  active: "#34d399",
  paused: "#fbbf24",
  completed: "#a78bfa",
  in_production: "#fbbf24",
  published: "#34d399",
  archived: "var(--text-muted)",
  idea: "var(--text-subtle)",
  new: "#60a5fa",
  mql: "#22c55e",
  sql: "#84cc16",
  opportunity: "#f59e0b",
  customer: "#10b981",
  disqualified: "#ef4444",
};

const emptyCampaignForm = {
  name: "",
  channel: "",
  objective: "leads",
  status: "draft",
  owner: "",
  budget: "",
  spent: "",
  revenue: "",
  impressions: "",
  clicks: "",
  conversions: "",
  start_date: "",
  end_date: "",
  notes: "",
};

const emptyContentForm = {
  title: "",
  content_type: "social_post",
  channel: "",
  status: "idea",
  campaign_id: "",
  assignee: "",
  publish_date: "",
  asset_url: "",
  cta: "",
};

const emptyLeadForm = {
  full_name: "",
  email: "",
  company: "",
  source_channel: "",
  campaign_id: "",
  status: "new",
  score: "",
  estimated_value: "",
  conversion_probability: "",
  notes: "",
};

const emptyChannelForm = {
  channel: "",
  period_label: "Current",
  spend: "",
  revenue: "",
  impressions: "",
  clicks: "",
  leads: "",
  customers: "",
  conversions: "",
  benchmark_roas: "3.2",
  benchmark_cvr: "2.5",
  benchmark_ctr: "1.8",
};

const fmtMoney = (value: number) =>
  "$" +
  Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });

const fmtPct = (value: number) => `${Number(value || 0).toFixed(2)}%`;

const dateToInput = (value?: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const toIsoOrNull = (value: string): string | null =>
  value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;

const num = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const lineClampStyle = {
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export default function MarketingPage() {
  const isDenseLayout = useIsMobile(1120);

  const [tab, setTab] = useState<"campaigns" | "content" | "leads" | "channels">("campaigns");
  const [summary, setSummary] = useState<MarketingSummary | null>(null);
  const [funnel, setFunnel] = useState<MarketingFunnel | null>(null);
  const [benchmarks, setBenchmarks] = useState<MarketingBenchmarks | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [channels, setChannels] = useState<ChannelMetric[]>([]);

  const [modal, setModal] = useState<ModalType>(null);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm);
  const [contentForm, setContentForm] = useState(emptyContentForm);
  const [leadForm, setLeadForm] = useState(emptyLeadForm);
  const [channelForm, setChannelForm] = useState(emptyChannelForm);

  const campaignMap = useMemo(() => {
    const map: Record<number, Campaign> = {};
    for (const campaign of campaigns) map[campaign.id] = campaign;
    return map;
  }, [campaigns]);

  const load = async () => {
    setLoadError("");
    try {
      const [summaryRes, funnelRes, benchmarkRes, campaignRes, contentRes, leadsRes, channelsRes] =
        await Promise.all([
          fetch(`${API}/marketing/summary`),
          fetch(`${API}/marketing/funnel`),
          fetch(`${API}/marketing/benchmarks`),
          fetch(`${API}/marketing/campaigns`),
          fetch(`${API}/marketing/content`),
          fetch(`${API}/marketing/leads`),
          fetch(`${API}/marketing/channels`),
        ]);

      if (!summaryRes.ok) {
        const payload = await summaryRes.json().catch(() => null);
        setLoadError(payload?.detail || "Could not load marketing engine.");
      }

      setSummary(summaryRes.ok ? await summaryRes.json() : null);
      setFunnel(funnelRes.ok ? await funnelRes.json() : null);
      setBenchmarks(benchmarkRes.ok ? await benchmarkRes.json() : null);
      setCampaigns(campaignRes.ok ? await campaignRes.json() : []);
      setContent(contentRes.ok ? await contentRes.json() : []);
      setLeads(leadsRes.ok ? await leadsRes.json() : []);
      setChannels(channelsRes.ok ? await channelsRes.json() : []);
    } catch {
      setLoadError("Failed to connect to the marketing service.");
      setSummary(null);
      setFunnel(null);
      setBenchmarks(null);
      setCampaigns([]);
      setContent([]);
      setLeads([]);
      setChannels([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCampaignEdit = (row: Campaign) => {
    setSelected(row);
    setCampaignForm({
      name: row.name,
      channel: row.channel,
      objective: row.objective,
      status: row.status,
      owner: row.owner || "",
      budget: String(row.budget ?? ""),
      spent: String(row.spent ?? ""),
      revenue: String(row.revenue ?? ""),
      impressions: String(row.impressions ?? ""),
      clicks: String(row.clicks ?? ""),
      conversions: String(row.conversions ?? ""),
      start_date: dateToInput(row.start_date),
      end_date: dateToInput(row.end_date),
      notes: row.notes || "",
    });
    setModal("edit_campaign");
  };

  const openContentEdit = (row: ContentItem) => {
    setSelected(row);
    setContentForm({
      title: row.title,
      content_type: row.content_type,
      channel: row.channel,
      status: row.status,
      campaign_id: row.campaign_id ? String(row.campaign_id) : "",
      assignee: row.assignee || "",
      publish_date: dateToInput(row.publish_date),
      asset_url: row.asset_url || "",
      cta: row.cta || "",
    });
    setModal("edit_content");
  };

  const openLeadEdit = (row: Lead) => {
    setSelected(row);
    setLeadForm({
      full_name: row.full_name,
      email: row.email,
      company: row.company || "",
      source_channel: row.source_channel,
      campaign_id: row.campaign_id ? String(row.campaign_id) : "",
      status: row.status,
      score: String(row.score ?? ""),
      estimated_value: String(row.estimated_value ?? ""),
      conversion_probability: String(row.conversion_probability ?? ""),
      notes: row.notes || "",
    });
    setModal("edit_lead");
  };

  const openChannelEdit = (row: ChannelMetric) => {
    setSelected(row);
    setChannelForm({
      channel: row.channel,
      period_label: row.period_label,
      spend: String(row.spend ?? ""),
      revenue: String(row.revenue ?? ""),
      impressions: String(row.impressions ?? ""),
      clicks: String(row.clicks ?? ""),
      leads: String(row.leads ?? ""),
      customers: String(row.customers ?? ""),
      conversions: String(row.conversions ?? ""),
      benchmark_roas: String(row.benchmark_roas ?? ""),
      benchmark_cvr: String(row.benchmark_cvr ?? ""),
      benchmark_ctr: String(row.benchmark_ctr ?? ""),
    });
    setModal("edit_channel");
  };

  const saveCampaign = async () => {
    setLoading(true);
    const payload = {
      ...campaignForm,
      budget: num(campaignForm.budget),
      spent: num(campaignForm.spent),
      revenue: num(campaignForm.revenue),
      impressions: Math.round(num(campaignForm.impressions)),
      clicks: Math.round(num(campaignForm.clicks)),
      conversions: Math.round(num(campaignForm.conversions)),
      start_date: toIsoOrNull(campaignForm.start_date),
      end_date: toIsoOrNull(campaignForm.end_date),
      owner: campaignForm.owner || null,
      notes: campaignForm.notes || null,
    };

    await fetch(
      modal === "add_campaign"
        ? `${API}/marketing/campaigns`
        : `${API}/marketing/campaigns/${selected.id}`,
      {
        method: modal === "add_campaign" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    await load();
    setLoading(false);
    setModal(null);
  };

  const saveContent = async () => {
    setLoading(true);
    const payload = {
      ...contentForm,
      campaign_id: contentForm.campaign_id ? Number(contentForm.campaign_id) : null,
      assignee: contentForm.assignee || null,
      publish_date: toIsoOrNull(contentForm.publish_date),
      asset_url: contentForm.asset_url || null,
      cta: contentForm.cta || null,
    };

    await fetch(
      modal === "add_content"
        ? `${API}/marketing/content`
        : `${API}/marketing/content/${selected.id}`,
      {
        method: modal === "add_content" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    await load();
    setLoading(false);
    setModal(null);
  };

  const saveLead = async () => {
    setLoading(true);
    const payload = {
      ...leadForm,
      campaign_id: leadForm.campaign_id ? Number(leadForm.campaign_id) : null,
      score: Math.round(num(leadForm.score)),
      estimated_value: num(leadForm.estimated_value),
      conversion_probability: num(leadForm.conversion_probability),
      company: leadForm.company || null,
      notes: leadForm.notes || null,
    };

    await fetch(
      modal === "add_lead" ? `${API}/marketing/leads` : `${API}/marketing/leads/${selected.id}`,
      {
        method: modal === "add_lead" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    await load();
    setLoading(false);
    setModal(null);
  };

  const saveChannel = async () => {
    setLoading(true);
    const payload = {
      ...channelForm,
      spend: num(channelForm.spend),
      revenue: num(channelForm.revenue),
      impressions: Math.round(num(channelForm.impressions)),
      clicks: Math.round(num(channelForm.clicks)),
      leads: Math.round(num(channelForm.leads)),
      customers: Math.round(num(channelForm.customers)),
      conversions: Math.round(num(channelForm.conversions)),
      benchmark_roas: num(channelForm.benchmark_roas),
      benchmark_cvr: num(channelForm.benchmark_cvr),
      benchmark_ctr: num(channelForm.benchmark_ctr),
    };

    await fetch(
      modal === "add_channel"
        ? `${API}/marketing/channels`
        : `${API}/marketing/channels/${selected.id}`,
      {
        method: modal === "add_channel" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    await load();
    setLoading(false);
    setModal(null);
  };

  const removeRecord = async (kind: "campaign" | "content" | "lead" | "channel", id: number) => {
    const ok = confirm("Delete this record?");
    if (!ok) return;
    const path =
      kind === "campaign"
        ? "campaigns"
        : kind === "content"
          ? "content"
          : kind === "lead"
            ? "leads"
            : "channels";

    await fetch(`${API}/marketing/${path}/${id}`, { method: "DELETE" });
    await load();
  };

  const kpiCards = summary
    ? [
        {
          label: "Marketing Spend",
          value: fmtMoney(summary.spend),
          sub: "Current tracked period",
          icon: DollarSign,
          color: "#ef4444",
        },
        {
          label: "Attributed Revenue",
          value: fmtMoney(summary.revenue),
          sub: "Closed-loop attribution",
          icon: TrendingUp,
          color: "#10b981",
        },
        {
          label: "ROAS",
          value: `${summary.roas.toFixed(2)}x`,
          sub: `${summary.roas_gap_percent >= 0 ? "+" : ""}${summary.roas_gap_percent.toFixed(1)}% vs benchmark`,
          icon: Target,
          color: summary.roas_gap_percent >= 0 ? "#22c55e" : "#f97316",
        },
        {
          label: "Active Campaigns",
          value: String(summary.active_campaigns),
          sub: `${summary.total_campaigns} total campaigns`,
          icon: Megaphone,
          color: "#60a5fa",
        },
        {
          label: "Lead Pipeline",
          value: String(summary.mql_count),
          sub: `${summary.total_leads} total leads`,
          icon: Users,
          color: "#a78bfa",
        },
        {
          label: "Content Pipeline",
          value: String(summary.content_pipeline),
          sub: `${summary.total_content_items} total content items`,
          icon: CalendarDays,
          color: "#f59e0b",
        },
      ]
    : [];

  return (
    <div style={{ padding: isDenseLayout ? "14px" : "24px", maxWidth: "1300px", margin: "0 auto", overflowX: "hidden" }}>
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
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "12px",
              marginBottom: "14px",
            }}
          >
            {kpiCards.map((card) => {
              const Icon = card.icon;
              return (
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
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <p style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{card.label}</p>
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "8px",
                        background: `${card.color}14`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={14} color={card.color} />
                    </div>
                  </div>
                  <p style={{ fontSize: "26px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.1 }}>
                    {card.value}
                  </p>
                  <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "6px" }}>{card.sub}</p>
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
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "12px",
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                  International Benchmark Radar
                </p>
                <span style={{ fontSize: "10px", color: "var(--text-subtle)" }}>
                  {benchmarks?.source || "Global B2B SaaS profile"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
                {[
                  {
                    name: "ROAS",
                    current: `${summary.roas.toFixed(2)}x`,
                    target: `${summary.benchmark_roas.toFixed(2)}x`,
                    gap: summary.roas_gap_percent,
                  },
                  {
                    name: "CTR",
                    current: fmtPct(summary.ctr),
                    target: fmtPct(summary.benchmark_ctr),
                    gap: summary.ctr_gap_percent,
                  },
                  {
                    name: "CVR",
                    current: fmtPct(summary.cvr),
                    target: fmtPct(summary.benchmark_cvr),
                    gap: summary.cvr_gap_percent,
                  },
                  {
                    name: "CAC",
                    current: fmtMoney(summary.cac),
                    target: fmtMoney(summary.benchmark_cac),
                    gap: summary.cac_gap_percent,
                  },
                ].map((item) => {
                  const positive = item.name === "CAC" ? item.gap >= 0 : item.gap >= 0;
                  return (
                    <div
                      key={item.name}
                      style={{
                        border: "1px solid var(--border-default)",
                        borderRadius: "10px",
                        padding: "10px",
                        background: "var(--bg-panel)",
                      }}
                    >
                      <p style={{ fontSize: "10px", color: "var(--text-subtle)", marginBottom: "6px" }}>
                        {item.name}
                      </p>
                      <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {item.current}
                      </p>
                      <p style={{ fontSize: "10px", color: "var(--text-quiet)", marginTop: "3px" }}>
                        Target {item.target}
                      </p>
                      <div
                        style={{
                          marginTop: "6px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "10px",
                          color: positive ? "#22c55e" : "#f97316",
                        }}
                      >
                        {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {item.gap >= 0 ? "+" : ""}
                        {item.gap.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "12px",
                padding: "14px 16px",
              }}
            >
              <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px" }}>
                Funnel Management
              </p>
              {funnel ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  {(
                    [
                      ["New", funnel.new, "#60a5fa"],
                      ["MQL", funnel.mql, "#22c55e"],
                      ["SQL", funnel.sql, "#84cc16"],
                      ["Opportunity", funnel.opportunity, "#f59e0b"],
                      ["Customer", funnel.customer, "#10b981"],
                      ["Disqualified", funnel.disqualified, "#ef4444"],
                    ] as Array<[string, number, string]>
                  ).map(([label, value, color]) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        border: "1px solid var(--border-default)",
                        borderRadius: "8px",
                        padding: "7px 10px",
                        background: "var(--bg-panel)",
                      }}
                    >
                      <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{label}</span>
                      <span style={{ fontSize: "13px", color, fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: "12px", color: "var(--text-subtle)" }}>No funnel data yet.</p>
              )}
            </div>
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
          overflowX: "auto",
          flexWrap: "nowrap",
          scrollbarWidth: "thin",
        }}
      >
        {(
          [
            ["campaigns", "Campaigns"],
            ["content", "Content Calendar"],
            ["leads", "Leads"],
            ["channels", "Channel Analytics"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              border: "none",
              background: tab === value ? "var(--bg-elevated)" : "transparent",
              color: tab === value ? "var(--text-primary)" : "var(--text-subtle)",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "14px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
            padding: isDenseLayout ? "14px 12px" : "16px 20px",
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: "var(--accent)" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
              {tab === "campaigns"
                ? "Campaign Engine"
                : tab === "content"
                  ? "Content Production Calendar"
                  : tab === "leads"
                    ? "Lead Pipeline and Attribution"
                    : "Channel Performance & Benchmarks"}
            </span>
          </div>

          <button
            onClick={() => {
              if (tab === "campaigns") {
                setCampaignForm(emptyCampaignForm);
                setModal("add_campaign");
              } else if (tab === "content") {
                setContentForm(emptyContentForm);
                setModal("add_content");
              } else if (tab === "leads") {
                setLeadForm(emptyLeadForm);
                setModal("add_lead");
              } else {
                setChannelForm(emptyChannelForm);
                setModal("add_channel");
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "9px",
              background: "var(--accent)",
              border: "none",
              color: "white",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              width: isDenseLayout ? "100%" : "auto",
            }}
          >
            <Plus size={14} />
            Add {tab === "campaigns" ? "Campaign" : tab === "content" ? "Content" : tab === "leads" ? "Lead" : "Channel Row"}
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          {tab === "campaigns" ? (
            <>
              <div
                style={{
                  minWidth: "1180px",
                  display: "grid",
                  gridTemplateColumns: "1.8fr 1fr 0.9fr 0.8fr 0.9fr 0.9fr 0.8fr 0.8fr 80px",
                  padding: "10px 20px",
                  background: "var(--bg-panel)",
                  borderBottom: "1px solid var(--border-soft)",
                }}
              >
                {["Campaign", "Channel", "Objective", "Budget", "Spent", "Revenue", "ROAS", "Status", ""].map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--text-quiet)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontFamily: "monospace",
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {campaigns.map((row, index) => {
                const roas = row.spent > 0 ? row.revenue / row.spent : 0;
                return (
                  <div
                    key={row.id}
                    style={{
                      minWidth: "1180px",
                      display: "grid",
                      gridTemplateColumns: "1.8fr 1fr 0.9fr 0.8fr 0.9fr 0.9fr 0.8fr 0.8fr 80px",
                      padding: "12px 20px",
                      borderBottom: index < campaigns.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                    }}
                  >
                    <div style={{ ...lineClampStyle, fontSize: "13px", color: "var(--text-muted)" }}>{row.name}</div>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{row.channel}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.objective}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{fmtMoney(row.budget)}</span>
                    <span style={{ fontSize: "12px", color: "#f97316" }}>{fmtMoney(row.spent)}</span>
                    <span style={{ fontSize: "12px", color: "#22c55e" }}>{fmtMoney(row.revenue)}</span>
                    <span style={{ fontSize: "12px", color: roas >= 3 ? "#22c55e" : "#f97316" }}>{roas.toFixed(2)}x</span>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: `${statusColor[row.status] || "var(--text-muted)"}12`,
                        color: statusColor[row.status] || "var(--text-muted)",
                        width: "fit-content",
                      }}
                    >
                      {row.status}
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => openCampaignEdit(row)}
                        style={{
                          width: "26px",
                          height: "26px",
                          borderRadius: "7px",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Pencil size={11} color="var(--text-muted)" />
                      </button>
                      <button
                        onClick={() => void removeRecord("campaign", row.id)}
                        style={{
                          width: "26px",
                          height: "26px",
                          borderRadius: "7px",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Trash2 size={11} color="var(--danger)" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          ) : null}

          {tab === "content" ? (
            <>
              <div
                style={{
                  minWidth: "1050px",
                  display: "grid",
                  gridTemplateColumns: "1.8fr 0.9fr 0.8fr 1fr 0.8fr 0.9fr 80px",
                  padding: "10px 20px",
                  background: "var(--bg-panel)",
                  borderBottom: "1px solid var(--border-soft)",
                }}
              >
                {["Title", "Type", "Channel", "Campaign", "Status", "Publish", ""].map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--text-quiet)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontFamily: "monospace",
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {content.map((row, index) => (
                <div
                  key={row.id}
                  style={{
                    minWidth: "1050px",
                    display: "grid",
                    gridTemplateColumns: "1.8fr 0.9fr 0.8fr 1fr 0.8fr 0.9fr 80px",
                    padding: "12px 20px",
                    borderBottom: index < content.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                  }}
                >
                  <div style={{ ...lineClampStyle, fontSize: "13px", color: "var(--text-muted)" }}>{row.title}</div>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.content_type}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.channel}</span>
                  <span style={{ ...lineClampStyle, fontSize: "12px", color: "var(--text-subtle)" }}>
                    {row.campaign_id ? campaignMap[row.campaign_id]?.name || `Campaign #${row.campaign_id}` : "—"}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: `${statusColor[row.status] || "var(--text-muted)"}12`,
                      color: statusColor[row.status] || "var(--text-muted)",
                      width: "fit-content",
                    }}
                  >
                    {row.status}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>
                    {row.publish_date ? new Date(row.publish_date).toLocaleDateString() : "—"}
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => openContentEdit(row)}
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "7px",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Pencil size={11} color="var(--text-muted)" />
                    </button>
                    <button
                      onClick={() => void removeRecord("content", row.id)}
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "7px",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Trash2 size={11} color="var(--danger)" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {tab === "leads" ? (
            <>
              <div
                style={{
                  minWidth: "1180px",
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1.2fr 0.9fr 1fr 0.8fr 0.7fr 0.8fr 0.8fr 80px",
                  padding: "10px 20px",
                  background: "var(--bg-panel)",
                  borderBottom: "1px solid var(--border-soft)",
                }}
              >
                {["Lead", "Email", "Company", "Source", "Status", "Score", "Probability", "Value", ""].map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--text-quiet)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontFamily: "monospace",
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {leads.map((row, index) => (
                <div
                  key={row.id}
                  style={{
                    minWidth: "1180px",
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1.2fr 0.9fr 1fr 0.8fr 0.7fr 0.8fr 0.8fr 80px",
                    padding: "12px 20px",
                    borderBottom: index < leads.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                  }}
                >
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{row.full_name}</span>
                  <span style={{ ...lineClampStyle, fontSize: "12px", color: "var(--text-subtle)" }}>{row.email}</span>
                  <span style={{ ...lineClampStyle, fontSize: "12px", color: "var(--text-subtle)" }}>{row.company || "—"}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.source_channel}</span>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: `${statusColor[row.status] || "var(--text-muted)"}12`,
                      color: statusColor[row.status] || "var(--text-muted)",
                      width: "fit-content",
                    }}
                  >
                    {row.status}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.score}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{fmtPct(row.conversion_probability)}</span>
                  <span style={{ fontSize: "12px", color: "#22c55e" }}>{fmtMoney(row.estimated_value)}</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => openLeadEdit(row)}
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "7px",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Pencil size={11} color="var(--text-muted)" />
                    </button>
                    <button
                      onClick={() => void removeRecord("lead", row.id)}
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "7px",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Trash2 size={11} color="var(--danger)" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {tab === "channels" ? (
            <>
              <div
                style={{
                  minWidth: "1320px",
                  display: "grid",
                  gridTemplateColumns: "1fr 0.8fr 0.9fr 0.9fr 0.7fr 0.7fr 0.7fr 0.8fr 0.8fr 0.7fr 80px",
                  padding: "10px 20px",
                  background: "var(--bg-panel)",
                  borderBottom: "1px solid var(--border-soft)",
                }}
              >
                {[
                  "Channel",
                  "Period",
                  "Spend",
                  "Revenue",
                  "ROAS",
                  "CTR",
                  "CVR",
                  "ROAS Gap",
                  "CTR Gap",
                  "CVR Gap",
                  "",
                ].map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--text-quiet)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontFamily: "monospace",
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {channels.map((row, index) => {
                const roas = row.spend > 0 ? row.revenue / row.spend : 0;
                const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
                const cvr = row.clicks > 0 ? (row.conversions / row.clicks) * 100 : 0;
                const roasGap = row.benchmark_roas ? ((roas - row.benchmark_roas) * 100) / row.benchmark_roas : 0;
                const ctrGap = row.benchmark_ctr ? ((ctr - row.benchmark_ctr) * 100) / row.benchmark_ctr : 0;
                const cvrGap = row.benchmark_cvr ? ((cvr - row.benchmark_cvr) * 100) / row.benchmark_cvr : 0;

                return (
                  <div
                    key={row.id}
                    style={{
                      minWidth: "1320px",
                      display: "grid",
                      gridTemplateColumns: "1fr 0.8fr 0.9fr 0.9fr 0.7fr 0.7fr 0.7fr 0.8fr 0.8fr 0.7fr 80px",
                      padding: "12px 20px",
                      borderBottom: index < channels.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{row.channel}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.period_label}</span>
                    <span style={{ fontSize: "12px", color: "#f97316" }}>{fmtMoney(row.spend)}</span>
                    <span style={{ fontSize: "12px", color: "#22c55e" }}>{fmtMoney(row.revenue)}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{roas.toFixed(2)}x</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{fmtPct(ctr)}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{fmtPct(cvr)}</span>
                    <span style={{ fontSize: "12px", color: roasGap >= 0 ? "#22c55e" : "#f97316" }}>
                      {roasGap >= 0 ? "+" : ""}
                      {roasGap.toFixed(1)}%
                    </span>
                    <span style={{ fontSize: "12px", color: ctrGap >= 0 ? "#22c55e" : "#f97316" }}>
                      {ctrGap >= 0 ? "+" : ""}
                      {ctrGap.toFixed(1)}%
                    </span>
                    <span style={{ fontSize: "12px", color: cvrGap >= 0 ? "#22c55e" : "#f97316" }}>
                      {cvrGap >= 0 ? "+" : ""}
                      {cvrGap.toFixed(1)}%
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => openChannelEdit(row)}
                        style={{
                          width: "26px",
                          height: "26px",
                          borderRadius: "7px",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Pencil size={11} color="var(--text-muted)" />
                      </button>
                      <button
                        onClick={() => void removeRecord("channel", row.id)}
                        style={{
                          width: "26px",
                          height: "26px",
                          borderRadius: "7px",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Trash2 size={11} color="var(--danger)" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          ) : null}
        </div>
      </div>

      {modal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-backdrop)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setModal(null)}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "16px",
              padding: "24px",
              width: "680px",
              maxWidth: "92vw",
              maxHeight: "88vh",
              overflowY: "auto",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                {modal === "add_campaign"
                  ? "Add Campaign"
                  : modal === "edit_campaign"
                    ? "Edit Campaign"
                    : modal === "add_content"
                      ? "Add Content Item"
                      : modal === "edit_content"
                        ? "Edit Content Item"
                        : modal === "add_lead"
                          ? "Add Lead"
                          : modal === "edit_lead"
                            ? "Edit Lead"
                            : modal === "add_channel"
                              ? "Add Channel Metric"
                              : "Edit Channel Metric"}
              </h2>

              <button
                onClick={() => setModal(null)}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={13} color="var(--text-muted)" />
              </button>
            </div>

            {modal === "add_campaign" || modal === "edit_campaign" ? (
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Campaign Name</label>
                    <input
                      style={inputStyle}
                      value={campaignForm.name}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Q4 Enterprise Pipeline Acceleration"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Channel</label>
                    <input
                      style={inputStyle}
                      value={campaignForm.channel}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, channel: event.target.value }))}
                      placeholder="Google Search"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Objective</label>
                    <select
                      style={inputStyle}
                      value={campaignForm.objective}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, objective: event.target.value }))}
                    >
                      <option value="awareness">Awareness</option>
                      <option value="traffic">Traffic</option>
                      <option value="leads">Leads</option>
                      <option value="conversion">Conversion</option>
                      <option value="retention">Retention</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select
                      style={inputStyle}
                      value={campaignForm.status}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Owner</label>
                    <input
                      style={inputStyle}
                      value={campaignForm.owner}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, owner: event.target.value }))}
                      placeholder="Team owner"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Budget</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={campaignForm.budget}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, budget: event.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Spent</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={campaignForm.spent}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, spent: event.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Revenue</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={campaignForm.revenue}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, revenue: event.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Impressions</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={campaignForm.impressions}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, impressions: event.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Clicks</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={campaignForm.clicks}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, clicks: event.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Conversions</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={campaignForm.conversions}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, conversions: event.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input
                      type="date"
                      style={inputStyle}
                      value={campaignForm.start_date}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, start_date: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input
                      type="date"
                      style={inputStyle}
                      value={campaignForm.end_date}
                      onChange={(event) => setCampaignForm((prev) => ({ ...prev, end_date: event.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: "72px", resize: "vertical" as const }}
                    value={campaignForm.notes}
                    onChange={(event) => setCampaignForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Messaging, audience details, and execution notes."
                  />
                </div>
              </div>
            ) : null}

            {modal === "add_content" || modal === "edit_content" ? (
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Title</label>
                    <input
                      style={inputStyle}
                      value={contentForm.title}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Q4 pricing update launch email"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Channel</label>
                    <input
                      style={inputStyle}
                      value={contentForm.channel}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, channel: event.target.value }))}
                      placeholder="Email"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Content Type</label>
                    <select
                      style={inputStyle}
                      value={contentForm.content_type}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, content_type: event.target.value }))}
                    >
                      <option value="social_post">Social Post</option>
                      <option value="email">Email</option>
                      <option value="blog">Blog</option>
                      <option value="landing_page">Landing Page</option>
                      <option value="ad_creative">Ad Creative</option>
                      <option value="video">Video</option>
                      <option value="webinar">Webinar</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select
                      style={inputStyle}
                      value={contentForm.status}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      <option value="idea">Idea</option>
                      <option value="in_production">In Production</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Campaign</label>
                    <select
                      style={inputStyle}
                      value={contentForm.campaign_id}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, campaign_id: event.target.value }))}
                    >
                      <option value="">None</option>
                      {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Assignee</label>
                    <input
                      style={inputStyle}
                      value={contentForm.assignee}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, assignee: event.target.value }))}
                      placeholder="Owner"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Publish Date</label>
                    <input
                      type="date"
                      style={inputStyle}
                      value={contentForm.publish_date}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, publish_date: event.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Asset URL</label>
                    <input
                      style={inputStyle}
                      value={contentForm.asset_url}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, asset_url: event.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>CTA</label>
                    <input
                      style={inputStyle}
                      value={contentForm.cta}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, cta: event.target.value }))}
                      placeholder="Book demo"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {modal === "add_lead" || modal === "edit_lead" ? (
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Full Name</label>
                    <input
                      style={inputStyle}
                      value={leadForm.full_name}
                      onChange={(event) => setLeadForm((prev) => ({ ...prev, full_name: event.target.value }))}
                      placeholder="Prospect name"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input
                      style={inputStyle}
                      value={leadForm.email}
                      onChange={(event) => setLeadForm((prev) => ({ ...prev, email: event.target.value }))}
                      placeholder="lead@company.com"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Company</label>
                    <input
                      style={inputStyle}
                      value={leadForm.company}
                      onChange={(event) => setLeadForm((prev) => ({ ...prev, company: event.target.value }))}
                      placeholder="Company"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Source Channel</label>
                    <input
                      style={inputStyle}
                      value={leadForm.source_channel}
                      onChange={(event) => setLeadForm((prev) => ({ ...prev, source_channel: event.target.value }))}
                      placeholder="LinkedIn"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Campaign</label>
                    <select
                      style={inputStyle}
                      value={leadForm.campaign_id}
                      onChange={(event) => setLeadForm((prev) => ({ ...prev, campaign_id: event.target.value }))}
                    >
                      <option value="">None</option>
                      {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select
                      style={inputStyle}
                      value={leadForm.status}
                      onChange={(event) => setLeadForm((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      <option value="new">New</option>
                      <option value="mql">MQL</option>
                      <option value="sql">SQL</option>
                      <option value="opportunity">Opportunity</option>
                      <option value="customer">Customer</option>
                      <option value="disqualified">Disqualified</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Score</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={leadForm.score}
                      onChange={(event) => setLeadForm((prev) => ({ ...prev, score: event.target.value }))}
                      placeholder="0-100"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Value</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={leadForm.estimated_value}
                      onChange={(event) => setLeadForm((prev) => ({ ...prev, estimated_value: event.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Probability %</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={leadForm.conversion_probability}
                      onChange={(event) =>
                        setLeadForm((prev) => ({ ...prev, conversion_probability: event.target.value }))
                      }
                      placeholder="0-100"
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: "72px", resize: "vertical" as const }}
                    value={leadForm.notes}
                    onChange={(event) => setLeadForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Qualification notes."
                  />
                </div>
              </div>
            ) : null}

            {modal === "add_channel" || modal === "edit_channel" ? (
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Channel</label>
                    <input
                      style={inputStyle}
                      value={channelForm.channel}
                      onChange={(event) => setChannelForm((prev) => ({ ...prev, channel: event.target.value }))}
                      placeholder="Google Search"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Period Label</label>
                    <input
                      style={inputStyle}
                      value={channelForm.period_label}
                      onChange={(event) => setChannelForm((prev) => ({ ...prev, period_label: event.target.value }))}
                      placeholder="Feb 2026"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Spend</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={channelForm.spend}
                      onChange={(event) => setChannelForm((prev) => ({ ...prev, spend: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Revenue</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={channelForm.revenue}
                      onChange={(event) => setChannelForm((prev) => ({ ...prev, revenue: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Impressions</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={channelForm.impressions}
                      onChange={(event) => setChannelForm((prev) => ({ ...prev, impressions: event.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Clicks</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={channelForm.clicks}
                      onChange={(event) => setChannelForm((prev) => ({ ...prev, clicks: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Leads</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={channelForm.leads}
                      onChange={(event) => setChannelForm((prev) => ({ ...prev, leads: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Customers</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={channelForm.customers}
                      onChange={(event) => setChannelForm((prev) => ({ ...prev, customers: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Conversions</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={channelForm.conversions}
                      onChange={(event) => setChannelForm((prev) => ({ ...prev, conversions: event.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Benchmark ROAS</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={channelForm.benchmark_roas}
                      onChange={(event) =>
                        setChannelForm((prev) => ({ ...prev, benchmark_roas: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Benchmark CVR %</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={channelForm.benchmark_cvr}
                      onChange={(event) =>
                        setChannelForm((prev) => ({ ...prev, benchmark_cvr: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Benchmark CTR %</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={channelForm.benchmark_ctr}
                      onChange={(event) =>
                        setChannelForm((prev) => ({ ...prev, benchmark_ctr: event.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button
                onClick={() => setModal(null)}
                style={{
                  padding: "9px 16px",
                  borderRadius: "9px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-muted)",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (modal === "add_campaign" || modal === "edit_campaign") {
                    void saveCampaign();
                  } else if (modal === "add_content" || modal === "edit_content") {
                    void saveContent();
                  } else if (modal === "add_lead" || modal === "edit_lead") {
                    void saveLead();
                  } else {
                    void saveChannel();
                  }
                }}
                disabled={loading}
                style={{
                  padding: "9px 18px",
                  borderRadius: "9px",
                  background: "var(--accent)",
                  border: "none",
                  color: "white",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Saving..." : modal.startsWith("add") ? "Add" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
