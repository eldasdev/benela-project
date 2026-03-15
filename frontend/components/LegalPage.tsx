  "use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Scale,
  Search,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  X,
  ExternalLink,
  Gavel,
  ShieldAlert,
  FileText,
  Loader2,
} from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "9px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-soft)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
};

const labelStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--text-subtle)",
  marginBottom: "6px",
  display: "block",
};

const mutedMonoStyle: CSSProperties = {
  fontSize: "10px",
  fontFamily: "monospace",
  letterSpacing: "0.07em",
  color: "var(--text-quiet)",
  textTransform: "uppercase",
};

type LegalSummary = {
  documents_total: number;
  active_documents: number;
  lex_documents: number;
  review_due_documents: number;
  contracts_total: number;
  active_contracts: number;
  expiring_contracts_30d: number;
  high_risk_contracts: number;
  tasks_total: number;
  open_tasks: number;
  overdue_tasks: number;
  high_risk_tasks: number;
  overdue_ratio_percent: number;
};

type LegalBenchmarks = {
  source: string;
  contract_review_sla_days: number;
  compliance_task_closure_days: number;
  overdue_task_threshold_percent: number;
  policy_review_cycle_days: number;
};

type LegalDocument = {
  id: number;
  title: string;
  document_number?: string | null;
  jurisdiction: string;
  category: string;
  issuing_authority?: string | null;
  source: "internal" | "lex_uz" | "uploaded" | "external";
  status: "draft" | "active" | "superseded" | "archived";
  source_url?: string | null;
  summary?: string | null;
  full_text?: string | null;
  tags?: string | null;
  published_at?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  last_reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
};

type LegalContract = {
  id: number;
  contract_ref?: string | null;
  title: string;
  counterparty: string;
  owner?: string | null;
  status: "draft" | "in_review" | "active" | "expiring" | "expired" | "terminated";
  risk_level: "low" | "medium" | "high" | "critical";
  value_amount: number;
  currency: string;
  start_date?: string | null;
  end_date?: string | null;
  renewal_date?: string | null;
  governing_law?: string | null;
  document_id?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

type LegalTask = {
  id: number;
  title: string;
  framework?: string | null;
  owner?: string | null;
  status: "open" | "in_progress" | "blocked" | "completed";
  risk_level: "low" | "medium" | "high" | "critical";
  due_date?: string | null;
  completed_at?: string | null;
  related_document_id?: number | null;
  related_contract_id?: number | null;
  description?: string | null;
  remediation_plan?: string | null;
  created_at: string;
  updated_at: string;
};

type SearchDocument = {
  id?: number | null;
  title: string;
  document_number?: string | null;
  jurisdiction: string;
  category: string;
  source: string;
  source_url?: string | null;
  published_at?: string | null;
  excerpt?: string | null;
  relevance_score: number;
};

type SearchResponse = {
  query: string;
  provider: string;
  total: number;
  documents: SearchDocument[];
  generated_at: string;
};

type RecommendationResponse = {
  query: string;
  provider: string;
  recommendation: string;
  references: SearchDocument[];
  model?: string | null;
  confidence?: string | null;
  disclaimer?: string | null;
  generated_at: string;
};

type LegalIntegrationStatus = {
  configured: boolean;
  api_key_configured: boolean;
  live_fallback_enabled: boolean;
  search_url?: string | null;
  advice_url?: string | null;
  ping_url?: string | null;
  reachable: boolean;
  service?: string | null;
  checked_at: string;
  detail: string;
};

type ModalType = null | "add_document" | "edit_document" | "add_contract" | "edit_contract" | "add_task" | "edit_task";

type TabType = "research" | "documents" | "contracts" | "tasks";

type ClaudeModelId =
  | "claude-haiku-4-5-20251001"
  | "claude-sonnet-4-5-20250929"
  | "claude-opus-4-1-20250805";

type RecommendationLanguage = "uz" | "ru" | "en";
type RecommendationSection = {
  key: string;
  title: string;
  body: string;
};

const CLAUDE_MODELS: Array<{ id: ClaudeModelId; label: string }> = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { id: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
];

const RECOMMENDATION_LANGUAGES: Array<{ id: RecommendationLanguage; label: string }> = [
  { id: "uz", label: "Uzbek" },
  { id: "ru", label: "Russian" },
  { id: "en", label: "English" },
];

const RECOMMENDATION_SECTION_PATTERNS: Array<{
  key: string;
  fallbackTitle: string;
  regex: RegExp;
}> = [
  { key: "case", fallbackTitle: "Case Analysis", regex: /^(case analysis|vaziyat tahlili|vaziyat|анализ кейса|ситуация)\s*:/i },
  { key: "risk", fallbackTitle: "Risk Profile", regex: /^(risk profile|risk profili|xavflar|риск-профиль|риски)\s*:/i },
  { key: "rec1", fallbackTitle: "Recommendation 1", regex: /^(recommendation\s*1|tavsiya\s*1|рекомендация\s*1)(?:\s*\(.*\))?\s*:/i },
  { key: "rec2", fallbackTitle: "Recommendation 2", regex: /^(recommendation\s*2|tavsiya\s*2|рекомендация\s*2)(?:\s*\(.*\))?\s*:/i },
  { key: "rec3", fallbackTitle: "Recommendation 3", regex: /^(recommendation\s*3|tavsiya\s*3|рекомендация\s*3)(?:\s*\(.*\))?\s*:/i },
  { key: "conclusion", fallbackTitle: "Conclusion", regex: /^(conclusion|xulosa|заключение|вывод)\s*:/i },
];

const statusColor: Record<string, string> = {
  draft: "var(--text-muted)",
  active: "#34d399",
  superseded: "#f59e0b",
  archived: "#94a3b8",
  in_review: "#60a5fa",
  expiring: "#f59e0b",
  expired: "#ef4444",
  terminated: "#f87171",
  open: "#60a5fa",
  in_progress: "#f59e0b",
  blocked: "#ef4444",
  completed: "#34d399",
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#dc2626",
};

const emptyDocumentForm = {
  title: "",
  document_number: "",
  jurisdiction: "Uzbekistan",
  category: "general",
  issuing_authority: "",
  source: "internal",
  status: "active",
  source_url: "",
  summary: "",
  full_text: "",
  tags: "",
  published_at: "",
  effective_from: "",
  effective_to: "",
  last_reviewed_at: "",
};

const emptyContractForm = {
  contract_ref: "",
  title: "",
  counterparty: "",
  owner: "",
  status: "draft",
  risk_level: "medium",
  value_amount: "",
  currency: "USD",
  start_date: "",
  end_date: "",
  renewal_date: "",
  governing_law: "",
  document_id: "",
  notes: "",
};

const emptyTaskForm = {
  title: "",
  framework: "",
  owner: "",
  status: "open",
  risk_level: "medium",
  due_date: "",
  completed_at: "",
  related_document_id: "",
  related_contract_id: "",
  description: "",
  remediation_plan: "",
};

const fmtMoney = (value: number, currency = "USD") =>
  `${currency} ${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const fmtDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
};

const dateToInput = (value?: string | null): string => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const toIsoOrNull = (value: string): string | null =>
  value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;

const num = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const compactTextStyle: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const normalizeHttpUrl = (value?: string | null): string | null => {
  const raw = (value || "").trim();
  if (!raw) return null;
  const candidate = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const url = new URL(candidate.startsWith("http://") || candidate.startsWith("https://") ? candidate : `https://${candidate}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
};

const buildReferenceHref = (row: SearchDocument): string => {
  const normalized = normalizeHttpUrl(row.source_url);
  if (normalized) return normalized;
  return `https://lex.uz/search/all?searchtype=all&query=${encodeURIComponent(row.title || "")}`;
};

const parseRecommendationSections = (value: string): RecommendationSection[] => {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const sections: Array<{ key: string; title: string; lines: string[] }> = [];
  let current: { key: string; title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const matchPattern = RECOMMENDATION_SECTION_PATTERNS.find((pattern) => pattern.regex.test(line));
    if (matchPattern) {
      const headingText = line.split(":")[0]?.trim() || matchPattern.fallbackTitle;
      const rest = line.replace(matchPattern.regex, "").trim();
      current = { key: matchPattern.key, title: headingText || matchPattern.fallbackTitle, lines: [] };
      if (rest) current.lines.push(rest);
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { key: "overview", title: "Overview", lines: [] };
      sections.push(current);
    }
    current.lines.push(line);
  }

  const normalized = sections
    .map((section) => ({
      key: section.key,
      title: section.title,
      body: section.lines.join("\n").trim(),
    }))
    .filter((section) => section.body.length > 0);

  if (normalized.length > 0) return normalized;
  return [{ key: "recommendation", title: "Recommendation", body: value.trim() }];
};

const prettifyRecommendationTitle = (title: string): string => {
  const cleaned = title.trim();
  if (!cleaned) return "Recommendation";
  const lettersOnly = cleaned.replace(/[^A-Za-z]/g, "");
  if (lettersOnly && cleaned === cleaned.toUpperCase()) {
    return cleaned
      .toLowerCase()
      .replace(/\b([a-z])/g, (match) => match.toUpperCase());
  }
  return cleaned;
};

const formatRecommendationBody = (text: string): string => {
  return text
    .replace(/\.\s+(?=\d+\))/g, ".\n")
    .replace(/;\s+(?=\d+\))/g, ";\n")
    .replace(/\s+(?=\d+\))/g, "\n")
    .trim();
};

const getSectionTone = (key: string): string => {
  if (key === "case") return "var(--accent)";
  if (key === "risk") return "#f59e0b";
  if (key === "conclusion") return "#34d399";
  return "var(--text-primary)";
};

const getSectionBadge = (key: string): string | null => {
  if (key === "rec1") return "01";
  if (key === "rec2") return "02";
  if (key === "rec3") return "03";
  return null;
};

export default function LegalPage() {
  const isMobile = useIsMobile(980);
  const isCompact = useIsMobile(1280);
  const isDenseLayout = isMobile || isCompact;
  const [tab, setTab] = useState<TabType>("research");
  const [summary, setSummary] = useState<LegalSummary | null>(null);
  const [benchmarks, setBenchmarks] = useState<LegalBenchmarks | null>(null);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [contracts, setContracts] = useState<LegalContract[]>([]);
  const [tasks, setTasks] = useState<LegalTask[]>([]);

  const [modal, setModal] = useState<ModalType>(null);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [documentForm, setDocumentForm] = useState(emptyDocumentForm);
  const [contractForm, setContractForm] = useState(emptyContractForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchJurisdiction, setSearchJurisdiction] = useState("Uzbekistan");
  const [searchCategory, setSearchCategory] = useState("");
  const [searchSource, setSearchSource] = useState("");
  const [searchProvider, setSearchProvider] = useState("auto");
  const [researchLoading, setResearchLoading] = useState(false);
  const [searchMeta, setSearchMeta] = useState<SearchResponse | null>(null);
  const [searchResults, setSearchResults] = useState<SearchDocument[]>([]);
  const [researchError, setResearchError] = useState("");

  const [recommendationModel, setRecommendationModel] = useState<ClaudeModelId>(
    "claude-sonnet-4-5-20250929",
  );
  const [recommendationLanguage, setRecommendationLanguage] = useState<RecommendationLanguage>("uz");
  const [recommendationInstructions, setRecommendationInstructions] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendation, setRecommendation] = useState("");
  const [recommendationRefs, setRecommendationRefs] = useState<SearchDocument[]>([]);
  const [recommendationProvider, setRecommendationProvider] = useState("");
  const [recommendationModelUsed, setRecommendationModelUsed] = useState("");
  const [recommendationConfidence, setRecommendationConfidence] = useState("");
  const [recommendationDisclaimer, setRecommendationDisclaimer] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [integrationStatus, setIntegrationStatus] = useState<LegalIntegrationStatus | null>(null);
  const recommendationSections = useMemo(
    () => parseRecommendationSections(recommendation),
    [recommendation],
  );

  const documentMap = useMemo(() => {
    const map: Record<number, LegalDocument> = {};
    for (const item of documents) map[item.id] = item;
    return map;
  }, [documents]);

  const contractMap = useMemo(() => {
    const map: Record<number, LegalContract> = {};
    for (const item of contracts) map[item.id] = item;
    return map;
  }, [contracts]);

  const load = async () => {
    setLoadError("");
    try {
      const [summaryRes, benchmarksRes, docsRes, contractsRes, tasksRes, integrationRes] = await Promise.all([
        fetch(`${API}/legal/summary`),
        fetch(`${API}/legal/benchmarks`),
        fetch(`${API}/legal/documents?limit=200`),
        fetch(`${API}/legal/contracts?limit=200`),
        fetch(`${API}/legal/tasks?limit=200`),
        fetch(`${API}/legal/integration/status`),
      ]);

      if (!summaryRes.ok) {
        const payload = await summaryRes.json().catch(() => null);
        setLoadError(payload?.detail || "Could not load legal engine.");
      }

      setSummary(summaryRes.ok ? await summaryRes.json() : null);
      setBenchmarks(benchmarksRes.ok ? await benchmarksRes.json() : null);
      setDocuments(docsRes.ok ? await docsRes.json() : []);
      setContracts(contractsRes.ok ? await contractsRes.json() : []);
      setTasks(tasksRes.ok ? await tasksRes.json() : []);
      setIntegrationStatus(integrationRes.ok ? await integrationRes.json() : null);
    } catch {
      setLoadError("Failed to connect to the legal service.");
      setSummary(null);
      setBenchmarks(null);
      setDocuments([]);
      setContracts([]);
      setTasks([]);
      setIntegrationStatus(null);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const closeModal = () => {
    setModal(null);
    setSelected(null);
    setDocumentForm(emptyDocumentForm);
    setContractForm(emptyContractForm);
    setTaskForm(emptyTaskForm);
    setLoading(false);
  };

  const openEditDocument = (row: LegalDocument) => {
    setSelected(row);
    setDocumentForm({
      title: row.title,
      document_number: row.document_number || "",
      jurisdiction: row.jurisdiction || "Uzbekistan",
      category: row.category || "general",
      issuing_authority: row.issuing_authority || "",
      source: row.source || "internal",
      status: row.status || "active",
      source_url: row.source_url || "",
      summary: row.summary || "",
      full_text: row.full_text || "",
      tags: row.tags || "",
      published_at: dateToInput(row.published_at),
      effective_from: dateToInput(row.effective_from),
      effective_to: dateToInput(row.effective_to),
      last_reviewed_at: dateToInput(row.last_reviewed_at),
    });
    setModal("edit_document");
  };

  const openEditContract = (row: LegalContract) => {
    setSelected(row);
    setContractForm({
      contract_ref: row.contract_ref || "",
      title: row.title,
      counterparty: row.counterparty,
      owner: row.owner || "",
      status: row.status,
      risk_level: row.risk_level,
      value_amount: String(row.value_amount ?? ""),
      currency: row.currency || "USD",
      start_date: dateToInput(row.start_date),
      end_date: dateToInput(row.end_date),
      renewal_date: dateToInput(row.renewal_date),
      governing_law: row.governing_law || "",
      document_id: row.document_id ? String(row.document_id) : "",
      notes: row.notes || "",
    });
    setModal("edit_contract");
  };

  const openEditTask = (row: LegalTask) => {
    setSelected(row);
    setTaskForm({
      title: row.title,
      framework: row.framework || "",
      owner: row.owner || "",
      status: row.status,
      risk_level: row.risk_level,
      due_date: dateToInput(row.due_date),
      completed_at: dateToInput(row.completed_at),
      related_document_id: row.related_document_id ? String(row.related_document_id) : "",
      related_contract_id: row.related_contract_id ? String(row.related_contract_id) : "",
      description: row.description || "",
      remediation_plan: row.remediation_plan || "",
    });
    setModal("edit_task");
  };

  const saveDocument = async () => {
    if (!documentForm.title.trim()) return;
    setLoading(true);
    try {
      const payload = {
        title: documentForm.title.trim(),
        document_number: documentForm.document_number || null,
        jurisdiction: documentForm.jurisdiction.trim() || "Uzbekistan",
        category: documentForm.category.trim() || "general",
        issuing_authority: documentForm.issuing_authority || null,
        source: documentForm.source,
        status: documentForm.status,
        source_url: documentForm.source_url || null,
        summary: documentForm.summary || null,
        full_text: documentForm.full_text || null,
        tags: documentForm.tags || null,
        published_at: toIsoOrNull(documentForm.published_at),
        effective_from: toIsoOrNull(documentForm.effective_from),
        effective_to: toIsoOrNull(documentForm.effective_to),
        last_reviewed_at: toIsoOrNull(documentForm.last_reviewed_at),
      };

      if (modal === "edit_document" && selected) {
        await fetch(`${API}/legal/documents/${selected.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${API}/legal/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      await load();
      closeModal();
    } finally {
      setLoading(false);
    }
  };

  const saveContract = async () => {
    if (!contractForm.title.trim() || !contractForm.counterparty.trim()) return;
    setLoading(true);
    try {
      const payload = {
        contract_ref: contractForm.contract_ref || null,
        title: contractForm.title.trim(),
        counterparty: contractForm.counterparty.trim(),
        owner: contractForm.owner || null,
        status: contractForm.status,
        risk_level: contractForm.risk_level,
        value_amount: num(contractForm.value_amount),
        currency: contractForm.currency || "USD",
        start_date: toIsoOrNull(contractForm.start_date),
        end_date: toIsoOrNull(contractForm.end_date),
        renewal_date: toIsoOrNull(contractForm.renewal_date),
        governing_law: contractForm.governing_law || null,
        document_id: contractForm.document_id ? Number(contractForm.document_id) : null,
        notes: contractForm.notes || null,
      };

      if (modal === "edit_contract" && selected) {
        await fetch(`${API}/legal/contracts/${selected.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${API}/legal/contracts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      await load();
      closeModal();
    } finally {
      setLoading(false);
    }
  };

  const saveTask = async () => {
    if (!taskForm.title.trim()) return;
    setLoading(true);
    try {
      const payload = {
        title: taskForm.title.trim(),
        framework: taskForm.framework || null,
        owner: taskForm.owner || null,
        status: taskForm.status,
        risk_level: taskForm.risk_level,
        due_date: toIsoOrNull(taskForm.due_date),
        completed_at: toIsoOrNull(taskForm.completed_at),
        related_document_id: taskForm.related_document_id ? Number(taskForm.related_document_id) : null,
        related_contract_id: taskForm.related_contract_id ? Number(taskForm.related_contract_id) : null,
        description: taskForm.description || null,
        remediation_plan: taskForm.remediation_plan || null,
      };

      if (modal === "edit_task" && selected) {
        await fetch(`${API}/legal/tasks/${selected.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${API}/legal/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      await load();
      closeModal();
    } finally {
      setLoading(false);
    }
  };

  const removeDocument = async (id: number) => {
    if (!window.confirm("Delete this legal document?")) return;
    await fetch(`${API}/legal/documents/${id}`, { method: "DELETE" });
    await load();
  };

  const removeContract = async (id: number) => {
    if (!window.confirm("Delete this contract?")) return;
    await fetch(`${API}/legal/contracts/${id}`, { method: "DELETE" });
    await load();
  };

  const removeTask = async (id: number) => {
    if (!window.confirm("Delete this compliance task?")) return;
    await fetch(`${API}/legal/tasks/${id}`, { method: "DELETE" });
    await load();
  };

  const runSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setResearchLoading(true);
    setResearchError("");
    try {
      const params = new URLSearchParams({ query, limit: "30" });
      if (searchJurisdiction.trim()) params.set("jurisdiction", searchJurisdiction.trim());
      if (searchCategory.trim()) params.set("category", searchCategory.trim());
      if (searchSource.trim()) params.set("source", searchSource.trim());
      if (searchProvider !== "auto") params.set("provider", searchProvider);

      const res = await fetch(`${API}/legal/search?${params.toString()}`);
      const payload = (await res.json().catch(() => null)) as SearchResponse | { detail?: string } | null;
      if (!res.ok) {
        setResearchError((payload as any)?.detail || "Could not search legal references.");
        setSearchMeta(null);
        setSearchResults([]);
        return;
      }

      const data = payload as SearchResponse;
      setSearchMeta(data);
      setSearchResults(data.documents || []);
    } catch {
      setResearchError("Failed to connect to legal search service.");
      setSearchMeta(null);
      setSearchResults([]);
    } finally {
      setResearchLoading(false);
    }
  };

  const runRecommendation = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setRecommendationError("Enter a legal question first.");
      return;
    }

    setRecommendationLoading(true);
    setRecommendationError("");
    setRecommendation("");
    setRecommendationRefs([]);
    setRecommendationProvider("");
    setRecommendationModelUsed("");
    setRecommendationConfidence("");
    setRecommendationDisclaimer("");

    try {
      const res = await fetch(`${API}/legal/recommendation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          model: recommendationModel,
          provider: searchProvider,
          jurisdiction: searchJurisdiction.trim() || null,
          category: searchCategory.trim() || null,
          source: searchSource.trim() || null,
          top_k: 6,
          response_language: recommendationLanguage,
          instructions: recommendationInstructions.trim() || null,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | RecommendationResponse
        | { detail?: string }
        | null;

      if (!res.ok) {
        setRecommendationError((payload as any)?.detail || "Could not generate legal recommendation.");
        return;
      }

      const data = payload as RecommendationResponse;
      setRecommendation(data.recommendation || "");
      setRecommendationRefs(data.references || []);
      setRecommendationProvider(data.provider || "");
      setRecommendationModelUsed(data.model || "");
      setRecommendationConfidence(data.confidence || "");
      setRecommendationDisclaimer(data.disclaimer || "");
    } catch {
      setRecommendationError("Failed to connect to legal recommendation service.");
    } finally {
      setRecommendationLoading(false);
    }
  };

  const topCards = [
    {
      label: "Legal Documents",
      value: String(summary?.documents_total || 0),
      note: `${summary?.active_documents || 0} active`,
      icon: <FileText size={14} color="#60a5fa" />,
    },
    {
      label: "Contracts",
      value: String(summary?.contracts_total || 0),
      note: `${summary?.expiring_contracts_30d || 0} expiring in 30d`,
      icon: <Gavel size={14} color="#f59e0b" />,
    },
    {
      label: "Compliance Tasks",
      value: String(summary?.open_tasks || 0),
      note: `${summary?.overdue_tasks || 0} overdue`,
      icon: <ShieldAlert size={14} color="#ef4444" />,
    },
    {
      label: "Lex.uz Sources",
      value: String(summary?.lex_documents || 0),
      note: `${summary?.review_due_documents || 0} review due`,
      icon: <Scale size={14} color="#34d399" />,
    },
  ];

  return (
    <div style={{ padding: isDenseLayout ? "14px" : "24px", display: "grid", gap: "14px", overflowX: "hidden" }}>
      {loadError ? (
        <div
          style={{
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
        {topCards.map((card) => (
          <div
            key={card.label}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "12px",
              padding: "14px 16px",
              display: "grid",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{card.label}</span>
              {card.icon}
            </div>
            <div style={{ fontSize: isDenseLayout ? "24px" : "30px", fontWeight: 600, lineHeight: 1, color: "var(--text-primary)" }}>
              {card.value}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-quiet)" }}>{card.note}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: isDenseLayout ? "8px" : "10px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          overflowX: "auto",
          scrollbarWidth: "thin",
        }}
      >
        {([
          ["research", "Legal Research"],
          ["documents", "Document Library"],
          ["contracts", "Contract Registry"],
          ["tasks", "Compliance Tasks"],
        ] as Array<[TabType, string]>).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            style={{
              height: "36px",
              borderRadius: "9px",
              border: "1px solid var(--border-soft)",
              padding: "0 12px",
              background:
                tab === value
                  ? "color-mix(in srgb, var(--accent) 15%, var(--bg-elevated))"
                  : "var(--bg-elevated)",
              color: tab === value ? "var(--accent)" : "var(--text-subtle)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "research" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "12px" }}>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)", display: "grid", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Search size={14} color="var(--accent)" />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Legal Search Engine</span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                Search legal documents from internal policy base and Lex.uz integration-ready sources.
              </div>
            </div>

            <div style={{ padding: "14px", display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gap: "6px" }}>
                <label style={labelStyle}>Legal question</label>
                <textarea
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Example: Labor code requirements for fixed-term contracts in Uzbekistan"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
                <div>
                  <label style={labelStyle}>Jurisdiction</label>
                  <input
                    value={searchJurisdiction}
                    onChange={(e) => setSearchJurisdiction(e.target.value)}
                    placeholder="Uzbekistan"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <input
                    value={searchCategory}
                    onChange={(e) => setSearchCategory(e.target.value)}
                    placeholder="labor, tax, compliance"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Source Filter</label>
                  <select
                    value={searchSource}
                    onChange={(e) => setSearchSource(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Any source</option>
                    <option value="lex_uz">Lex.uz</option>
                    <option value="internal">Internal</option>
                    <option value="uploaded">Uploaded</option>
                    <option value="external">External</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Provider</label>
                  <select
                    value={searchProvider}
                    onChange={(e) => setSearchProvider(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="auto">Auto</option>
                    <option value="lex">Lex Miner</option>
                    <option value="database">Database</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <button
                  onClick={() => void runSearch()}
                  disabled={researchLoading || !searchQuery.trim()}
                  style={{
                    height: "34px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-soft)",
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "0 12px",
                    cursor: researchLoading || !searchQuery.trim() ? "not-allowed" : "pointer",
                    opacity: researchLoading || !searchQuery.trim() ? 0.65 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    width: isDenseLayout ? "100%" : "auto",
                    justifyContent: "center",
                  }}
                >
                  {researchLoading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Search size={12} />}
                  {researchLoading ? "Searching..." : "Find Legal Documents"}
                </button>
                <button
                  onClick={() => {
                    setSearchMeta(null);
                    setSearchResults([]);
                    setResearchError("");
                  }}
                  style={{
                    height: "34px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-soft)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-subtle)",
                    fontSize: "12px",
                    padding: "0 12px",
                    cursor: "pointer",
                    width: isDenseLayout ? "100%" : "auto",
                  }}
                >
                  Clear Results
                </button>
                {searchMeta ? (
                  <span
                    style={{
                      ...mutedMonoStyle,
                      marginLeft: isDenseLayout ? 0 : "auto",
                      width: isDenseLayout ? "100%" : "auto",
                      wordBreak: "break-word",
                    }}
                  >
                    {searchMeta.total} results | provider {searchMeta.provider}
                  </span>
                ) : null}
              </div>

              {researchError ? (
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--danger-soft-border)",
                    background: "var(--danger-soft-bg)",
                    color: "var(--danger)",
                    fontSize: "11px",
                  }}
                >
                  {researchError}
                </div>
              ) : null}

              <div
                style={{
                  border: "1px solid var(--border-default)",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: isDenseLayout ? "none" : "grid",
                    gridTemplateColumns: "2fr 0.9fr 0.9fr 0.7fr",
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--border-soft)",
                    background: "var(--bg-panel)",
                  }}
                >
                  <span style={mutedMonoStyle}>Document</span>
                  <span style={mutedMonoStyle}>Category</span>
                  <span style={mutedMonoStyle}>Source</span>
                  <span style={mutedMonoStyle}>Score</span>
                </div>

                {searchResults.length === 0 ? (
                  <div style={{ padding: "16px", fontSize: "12px", color: "var(--text-subtle)" }}>
                    No search results yet.
                  </div>
                ) : (
                  searchResults.map((row, index) => (
                    <div
                      key={`${row.id || "row"}-${index}`}
                      style={{
                        borderTop: index > 0 ? "1px solid var(--table-row-divider)" : "none",
                        padding: "11px 12px",
                        display: "grid",
                        gap: "5px",
                      }}
                    >
                      {isDenseLayout ? (
                        <div style={{ display: "grid", gap: "6px" }}>
                          <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 }}>
                            {row.title}
                          </div>
                          <div style={{ fontSize: "10px", color: "var(--text-quiet)" }}>
                            #{row.document_number || "N/A"} · {row.jurisdiction} · {fmtDate(row.published_at)}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            <span style={{ fontSize: "10px", color: "var(--text-subtle)", border: "1px solid var(--border-soft)", borderRadius: "999px", padding: "2px 7px", background: "var(--bg-elevated)" }}>
                              {row.category}
                            </span>
                            <span style={{ fontSize: "10px", color: "var(--text-subtle)", border: "1px solid var(--border-soft)", borderRadius: "999px", padding: "2px 7px", background: "var(--bg-elevated)" }}>
                              {row.source}
                            </span>
                            <span style={{ fontSize: "10px", color: "var(--text-subtle)", border: "1px solid var(--border-soft)", borderRadius: "999px", padding: "2px 7px", background: "var(--bg-elevated)" }}>
                              Score {row.relevance_score.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 0.9fr 0.9fr 0.7fr",
                            alignItems: "start",
                            gap: "8px",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)", ...compactTextStyle }}>
                              {row.title}
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--text-quiet)", marginTop: "2px" }}>
                              #{row.document_number || "N/A"} | {row.jurisdiction} | {fmtDate(row.published_at)}
                            </div>
                          </div>
                          <span style={{ fontSize: "11px", color: "var(--text-subtle)", ...compactTextStyle }}>{row.category}</span>
                          <span style={{ fontSize: "11px", color: "var(--text-subtle)", ...compactTextStyle }}>{row.source}</span>
                          <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{row.relevance_score.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ fontSize: "11px", color: "var(--text-subtle)", lineHeight: 1.45 }}>{row.excerpt || "No excerpt."}</div>
                      {normalizeHttpUrl(row.source_url) ? (
                        <a
                          href={normalizeHttpUrl(row.source_url) || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            width: "fit-content",
                            textDecoration: "none",
                            color: "var(--accent)",
                            fontSize: "11px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          Open Source <ExternalLink size={11} />
                        </a>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-soft)",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                borderRadius: "14px",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-soft)", display: "grid", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Sparkles size={14} color="var(--accent)" />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Claude Legal Recommendation</span>
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                  AI recommendation based on matching legal references and your live legal workspace.
                </div>
              </div>

              <div style={{ padding: "14px", display: "grid", gap: "10px" }}>
                <div
                  style={{
                    border: "1px solid var(--border-soft)",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                    borderRadius: "8px",
                    background: integrationStatus?.reachable
                      ? "color-mix(in srgb, #22c55e 8%, var(--bg-panel))"
                      : "color-mix(in srgb, #ef4444 8%, var(--bg-panel))",
                    padding: "8px 10px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <div style={{ ...mutedMonoStyle, color: integrationStatus?.reachable ? "#22c55e" : "#ef4444" }}>
                    lex miner {integrationStatus?.reachable ? "connected" : "disconnected"}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-subtle)", lineHeight: 1.45 }}>
                    {integrationStatus?.detail || "Integration status is unavailable."}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Recommendation language</label>
                  <select
                    value={recommendationLanguage}
                    onChange={(e) => setRecommendationLanguage(e.target.value as RecommendationLanguage)}
                    style={inputStyle}
                  >
                    {RECOMMENDATION_LANGUAGES.map((lang) => (
                      <option key={lang.id} value={lang.id}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Claude model</label>
                  <select
                    value={recommendationModel}
                    onChange={(e) => setRecommendationModel(e.target.value as ClaudeModelId)}
                    style={inputStyle}
                  >
                    {CLAUDE_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Additional instructions (optional)</label>
                  <textarea
                    value={recommendationInstructions}
                    onChange={(e) => setRecommendationInstructions(e.target.value)}
                    placeholder="Focus on risk matrix and immediate remediation plan."
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </div>

                <button
                  onClick={() => void runRecommendation()}
                  disabled={recommendationLoading || !searchQuery.trim()}
                  style={{
                    height: "34px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-soft)",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: recommendationLoading || !searchQuery.trim() ? "not-allowed" : "pointer",
                    opacity: recommendationLoading || !searchQuery.trim() ? 0.65 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {recommendationLoading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={12} />}
                  {recommendationLoading ? "Generating..." : "Generate Recommendation"}
                </button>

                {recommendationError ? (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--danger-soft-border)",
                      background: "var(--danger-soft-bg)",
                      color: "var(--danger)",
                      fontSize: "11px",
                    }}
                  >
                    {recommendationError}
                  </div>
                ) : null}

                <div
                  style={{
                    border: "1px solid var(--border-soft)",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                    borderRadius: "10px",
                    background: "var(--bg-panel)",
                    padding: "10px 11px",
                    minHeight: "190px",
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {recommendation ? (
                    <>
                      <div
                        style={{
                          display: "inline-flex",
                          width: "fit-content",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 8px",
                          borderRadius: "999px",
                          border: "1px solid var(--border-soft)",
                          background: "var(--bg-elevated)",
                          fontSize: "10.5px",
                          color: "var(--text-subtle)",
                        }}
                      >
                        Recommendation ready
                        {recommendationConfidence ? (
                          <span style={{ color: "var(--text-quiet)" }}>| confidence {recommendationConfidence}</span>
                        ) : null}
                      </div>
                      {(recommendationProvider || recommendationModelUsed || recommendationConfidence) ? (
                        <details
                          style={{
                            border: "1px solid var(--border-soft)",
                            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
                            borderRadius: "8px",
                            padding: "6px 8px",
                            background: "var(--bg-elevated)",
                          }}
                        >
                          <summary style={{ cursor: "pointer", fontSize: "10.5px", color: "var(--text-quiet)" }}>
                            Technical details
                          </summary>
                          <div style={{ ...mutedMonoStyle, marginTop: "6px" }}>
                            provider {recommendationProvider || "database"}
                          </div>
                          {(recommendationModelUsed || recommendationConfidence) && (
                            <div style={{ ...mutedMonoStyle, marginTop: "4px" }}>
                              {recommendationModelUsed ? `model ${recommendationModelUsed}` : ""}
                              {recommendationModelUsed && recommendationConfidence ? " | " : ""}
                              {recommendationConfidence ? `confidence ${recommendationConfidence}` : ""}
                            </div>
                          )}
                        </details>
                      ) : null}
                      <div style={{ display: "grid", gap: "7px" }}>
                        {recommendationSections.map((section, index) => (
                          <div
                            key={`${section.key}-${index}`}
                            style={{
                              border: "1px solid var(--border-soft)",
                              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
                              borderRadius: "10px",
                              padding: "10px",
                              background: "var(--bg-elevated)",
                              display: "grid",
                              gap: "7px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                              <div
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  color: getSectionTone(section.key),
                                  letterSpacing: "0.03em",
                                }}
                              >
                                {prettifyRecommendationTitle(section.title)}
                              </div>
                              {getSectionBadge(section.key) ? (
                                <span
                                  style={{
                                    fontSize: "10px",
                                    color: "var(--text-quiet)",
                                    border: "1px solid var(--border-soft)",
                                    borderRadius: "999px",
                                    padding: "2px 6px",
                                    minWidth: "26px",
                                    textAlign: "center",
                                  }}
                                >
                                  {getSectionBadge(section.key)}
                                </span>
                              ) : null}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.58 }}>
                              {formatRecommendationBody(section.body)}
                            </div>
                          </div>
                        ))}
                      </div>
                      {recommendationRefs.length > 0 ? (
                        <div style={{ display: "grid", gap: "4px" }}>
                          <span style={mutedMonoStyle}>references</span>
                          {recommendationRefs.slice(0, 6).map((ref, index) => (
                            <a
                              key={`${ref.id || "ref"}-${index}`}
                              href={buildReferenceHref(ref)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                textDecoration: "none",
                                color: "var(--accent)",
                                fontSize: "10.5px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                border: "1px solid var(--border-soft)",
                                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
                                borderRadius: "7px",
                                background: "var(--bg-elevated)",
                                padding: "5px 7px",
                              }}
                              title={ref.source_url || ref.title}
                            >
                              <span style={{ ...compactTextStyle, maxWidth: "calc(100% - 18px)" }}>
                                [{index + 1}] {ref.title}
                              </span>
                              <ExternalLink size={10} />
                            </a>
                          ))}
                        </div>
                      ) : null}
                      {recommendationDisclaimer ? (
                        <div
                          style={{
                            borderTop: "1px dashed var(--border-default)",
                            paddingTop: "7px",
                            fontSize: "10.5px",
                            color: "var(--text-quiet)",
                            lineHeight: 1.45,
                          }}
                        >
                          {recommendationDisclaimer}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>
                      Recommendation will appear here after generation.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "14px",
                padding: "14px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>Operational Benchmarks</div>
              <div style={{ fontSize: "11px", color: "var(--text-subtle)", lineHeight: 1.55 }}>
                Source: {benchmarks?.source || "N/A"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
                <div style={{ border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px" }}>
                  <div style={mutedMonoStyle}>Contract Review SLA</div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {benchmarks?.contract_review_sla_days ?? 0} days
                  </div>
                </div>
                <div style={{ border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px" }}>
                  <div style={mutedMonoStyle}>Compliance Closure</div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {benchmarks?.compliance_task_closure_days ?? 0} days
                  </div>
                </div>
                <div style={{ border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px" }}>
                  <div style={mutedMonoStyle}>Overdue Threshold</div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {benchmarks?.overdue_task_threshold_percent ?? 0}%
                  </div>
                </div>
                <div style={{ border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px" }}>
                  <div style={mutedMonoStyle}>Policy Review Cycle</div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {benchmarks?.policy_review_cycle_days ?? 0} days
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <DataSection
          isMobile={isDenseLayout}
          title="Document Library"
          subtitle="Curated legal documents and regulation references"
          onAdd={() => {
            setSelected(null);
            setDocumentForm(emptyDocumentForm);
            setModal("add_document");
          }}
          addLabel="Add Document"
          columns={["Title", "Category", "Jurisdiction", "Source", "Status", "Updated", "Actions"]}
          rows={documents.map((row) => ({
            key: row.id,
            values: [
              `${row.title}\n#${row.document_number || "N/A"}`,
              row.category,
              row.jurisdiction,
              row.source,
              row.status,
              fmtDate(row.updated_at),
              "actions",
            ],
            statusIndex: [4],
            onEdit: () => openEditDocument(row),
            onDelete: () => void removeDocument(row.id),
          }))}
          emptyLabel="No legal documents yet."
        />
      )}

      {tab === "contracts" && (
        <DataSection
          isMobile={isDenseLayout}
          title="Contract Registry"
          subtitle="Track contract lifecycle, risk and renewal windows"
          onAdd={() => {
            setSelected(null);
            setContractForm(emptyContractForm);
            setModal("add_contract");
          }}
          addLabel="Add Contract"
          columns={["Reference", "Counterparty", "Status", "Risk", "Value", "End Date", "Actions"]}
          rows={contracts.map((row) => ({
            key: row.id,
            values: [
              `${row.title}\n${row.contract_ref || "N/A"}`,
              row.counterparty,
              row.status,
              row.risk_level,
              fmtMoney(row.value_amount, row.currency),
              fmtDate(row.end_date),
              "actions",
            ],
            statusIndex: [2, 3],
            onEdit: () => openEditContract(row),
            onDelete: () => void removeContract(row.id),
          }))}
          emptyLabel="No contracts yet."
        />
      )}

      {tab === "tasks" && (
        <DataSection
          isMobile={isDenseLayout}
          title="Compliance Tasks"
          subtitle="Operational obligations, audits and remediation workflows"
          onAdd={() => {
            setSelected(null);
            setTaskForm(emptyTaskForm);
            setModal("add_task");
          }}
          addLabel="Add Compliance Task"
          columns={["Task", "Framework", "Owner", "Status", "Risk", "Due Date", "Actions"]}
          rows={tasks.map((row) => ({
            key: row.id,
            values: [
              row.title,
              row.framework || "N/A",
              row.owner || "Unassigned",
              row.status,
              row.risk_level,
              fmtDate(row.due_date),
              "actions",
            ],
            statusIndex: [3, 4],
            onEdit: () => openEditTask(row),
            onDelete: () => void removeTask(row.id),
          }))}
          emptyLabel="No compliance tasks yet."
        />
      )}

      {modal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.62)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: isMobile ? "10px" : "20px",
          }}
        >
          <div
            style={{
              width: isMobile ? "100%" : "min(960px, 100%)",
              maxHeight: isMobile ? "92vh" : "88vh",
              overflowY: "auto",
              background: "var(--bg-panel)",
              border: "1px solid var(--border-default)",
              borderRadius: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderBottom: "1px solid var(--border-default)",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                {modal === "add_document"
                  ? "Add Legal Document"
                  : modal === "edit_document"
                    ? "Edit Legal Document"
                    : modal === "add_contract"
                      ? "Add Contract"
                      : modal === "edit_contract"
                        ? "Edit Contract"
                        : modal === "add_task"
                          ? "Add Compliance Task"
                          : "Edit Compliance Task"}
              </div>
              <button
                onClick={closeModal}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "7px",
                  border: "1px solid var(--border-soft)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={13} />
              </button>
            </div>

            {modal.includes("document") && (
              <div style={{ padding: "14px", display: "grid", gap: "10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1.5fr 1fr 1fr 1fr", gap: "8px" }}>
                  <Field label="Title">
                    <input value={documentForm.title} onChange={(e) => setDocumentForm((p) => ({ ...p, title: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Document No">
                    <input value={documentForm.document_number} onChange={(e) => setDocumentForm((p) => ({ ...p, document_number: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Jurisdiction">
                    <input value={documentForm.jurisdiction} onChange={(e) => setDocumentForm((p) => ({ ...p, jurisdiction: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Category">
                    <input value={documentForm.category} onChange={(e) => setDocumentForm((p) => ({ ...p, category: e.target.value }))} style={inputStyle} />
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr 1fr 1fr", gap: "8px" }}>
                  <Field label="Issuing Authority">
                    <input value={documentForm.issuing_authority} onChange={(e) => setDocumentForm((p) => ({ ...p, issuing_authority: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Source">
                    <select value={documentForm.source} onChange={(e) => setDocumentForm((p) => ({ ...p, source: e.target.value }))} style={inputStyle}>
                      <option value="internal">internal</option>
                      <option value="lex_uz">lex_uz</option>
                      <option value="uploaded">uploaded</option>
                      <option value="external">external</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={documentForm.status} onChange={(e) => setDocumentForm((p) => ({ ...p, status: e.target.value }))} style={inputStyle}>
                      <option value="draft">draft</option>
                      <option value="active">active</option>
                      <option value="superseded">superseded</option>
                      <option value="archived">archived</option>
                    </select>
                  </Field>
                  <Field label="Tags">
                    <input value={documentForm.tags} onChange={(e) => setDocumentForm((p) => ({ ...p, tags: e.target.value }))} placeholder="labor, contracts" style={inputStyle} />
                  </Field>
                </div>

                <Field label="Source URL">
                  <input value={documentForm.source_url} onChange={(e) => setDocumentForm((p) => ({ ...p, source_url: e.target.value }))} style={inputStyle} />
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr 1fr 1fr", gap: "8px" }}>
                  <Field label="Published">
                    <input type="date" value={documentForm.published_at} onChange={(e) => setDocumentForm((p) => ({ ...p, published_at: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Effective From">
                    <input type="date" value={documentForm.effective_from} onChange={(e) => setDocumentForm((p) => ({ ...p, effective_from: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Effective To">
                    <input type="date" value={documentForm.effective_to} onChange={(e) => setDocumentForm((p) => ({ ...p, effective_to: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Last Reviewed">
                    <input type="date" value={documentForm.last_reviewed_at} onChange={(e) => setDocumentForm((p) => ({ ...p, last_reviewed_at: e.target.value }))} style={inputStyle} />
                  </Field>
                </div>

                <Field label="Summary">
                  <textarea value={documentForm.summary} onChange={(e) => setDocumentForm((p) => ({ ...p, summary: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                </Field>

                <Field label="Full Text">
                  <textarea value={documentForm.full_text} onChange={(e) => setDocumentForm((p) => ({ ...p, full_text: e.target.value }))} rows={7} style={{ ...inputStyle, resize: "vertical" }} />
                </Field>

                <ActionBar isMobile={isDenseLayout} loading={loading} onCancel={closeModal} onSave={() => void saveDocument()} saveLabel="Save Document" />
              </div>
            )}

            {modal.includes("contract") && (
              <div style={{ padding: "14px", display: "grid", gap: "10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1.5fr 1fr 1fr", gap: "8px" }}>
                  <Field label="Reference">
                    <input value={contractForm.contract_ref} onChange={(e) => setContractForm((p) => ({ ...p, contract_ref: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Title">
                    <input value={contractForm.title} onChange={(e) => setContractForm((p) => ({ ...p, title: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Counterparty">
                    <input value={contractForm.counterparty} onChange={(e) => setContractForm((p) => ({ ...p, counterparty: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Owner">
                    <input value={contractForm.owner} onChange={(e) => setContractForm((p) => ({ ...p, owner: e.target.value }))} style={inputStyle} />
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr 1fr 1fr 1fr", gap: "8px" }}>
                  <Field label="Status">
                    <select value={contractForm.status} onChange={(e) => setContractForm((p) => ({ ...p, status: e.target.value }))} style={inputStyle}>
                      <option value="draft">draft</option>
                      <option value="in_review">in_review</option>
                      <option value="active">active</option>
                      <option value="expiring">expiring</option>
                      <option value="expired">expired</option>
                      <option value="terminated">terminated</option>
                    </select>
                  </Field>
                  <Field label="Risk Level">
                    <select value={contractForm.risk_level} onChange={(e) => setContractForm((p) => ({ ...p, risk_level: e.target.value }))} style={inputStyle}>
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                      <option value="critical">critical</option>
                    </select>
                  </Field>
                  <Field label="Value Amount">
                    <input value={contractForm.value_amount} onChange={(e) => setContractForm((p) => ({ ...p, value_amount: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Currency">
                    <input value={contractForm.currency} onChange={(e) => setContractForm((p) => ({ ...p, currency: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Related Document">
                    <select value={contractForm.document_id} onChange={(e) => setContractForm((p) => ({ ...p, document_id: e.target.value }))} style={inputStyle}>
                      <option value="">None</option>
                      {documents.map((doc) => (
                        <option key={doc.id} value={String(doc.id)}>
                          #{doc.id} {doc.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr 1fr 1fr", gap: "8px" }}>
                  <Field label="Start Date">
                    <input type="date" value={contractForm.start_date} onChange={(e) => setContractForm((p) => ({ ...p, start_date: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="End Date">
                    <input type="date" value={contractForm.end_date} onChange={(e) => setContractForm((p) => ({ ...p, end_date: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Renewal Date">
                    <input type="date" value={contractForm.renewal_date} onChange={(e) => setContractForm((p) => ({ ...p, renewal_date: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Governing Law">
                    <input value={contractForm.governing_law} onChange={(e) => setContractForm((p) => ({ ...p, governing_law: e.target.value }))} style={inputStyle} />
                  </Field>
                </div>

                <Field label="Notes">
                  <textarea value={contractForm.notes} onChange={(e) => setContractForm((p) => ({ ...p, notes: e.target.value }))} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
                </Field>

                <ActionBar isMobile={isDenseLayout} loading={loading} onCancel={closeModal} onSave={() => void saveContract()} saveLabel="Save Contract" />
              </div>
            )}

            {modal.includes("task") && (
              <div style={{ padding: "14px", display: "grid", gap: "10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1.4fr 1fr 1fr 1fr", gap: "8px" }}>
                  <Field label="Title">
                    <input value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Framework">
                    <input value={taskForm.framework} onChange={(e) => setTaskForm((p) => ({ ...p, framework: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Owner">
                    <input value={taskForm.owner} onChange={(e) => setTaskForm((p) => ({ ...p, owner: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Due Date">
                    <input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm((p) => ({ ...p, due_date: e.target.value }))} style={inputStyle} />
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isDenseLayout ? "1fr" : "1fr 1fr 1fr 1fr", gap: "8px" }}>
                  <Field label="Status">
                    <select value={taskForm.status} onChange={(e) => setTaskForm((p) => ({ ...p, status: e.target.value }))} style={inputStyle}>
                      <option value="open">open</option>
                      <option value="in_progress">in_progress</option>
                      <option value="blocked">blocked</option>
                      <option value="completed">completed</option>
                    </select>
                  </Field>
                  <Field label="Risk Level">
                    <select value={taskForm.risk_level} onChange={(e) => setTaskForm((p) => ({ ...p, risk_level: e.target.value }))} style={inputStyle}>
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                      <option value="critical">critical</option>
                    </select>
                  </Field>
                  <Field label="Related Document">
                    <select value={taskForm.related_document_id} onChange={(e) => setTaskForm((p) => ({ ...p, related_document_id: e.target.value }))} style={inputStyle}>
                      <option value="">None</option>
                      {documents.map((doc) => (
                        <option key={doc.id} value={String(doc.id)}>
                          #{doc.id} {doc.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Related Contract">
                    <select value={taskForm.related_contract_id} onChange={(e) => setTaskForm((p) => ({ ...p, related_contract_id: e.target.value }))} style={inputStyle}>
                      <option value="">None</option>
                      {contracts.map((contract) => (
                        <option key={contract.id} value={String(contract.id)}>
                          #{contract.id} {contract.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Description">
                  <textarea value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
                </Field>

                <Field label="Remediation Plan">
                  <textarea value={taskForm.remediation_plan} onChange={(e) => setTaskForm((p) => ({ ...p, remediation_plan: e.target.value }))} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
                </Field>

                <ActionBar isMobile={isDenseLayout} loading={loading} onCancel={closeModal} onSave={() => void saveTask()} saveLabel="Save Task" />
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function ActionBar({
  isMobile = false,
  loading,
  onCancel,
  onSave,
  saveLabel,
}: {
  isMobile?: boolean;
  loading: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", flexDirection: isMobile ? "column-reverse" : "row", gap: "8px", marginTop: "4px" }}>
      <button
        onClick={onCancel}
        disabled={loading}
        style={{
          height: "34px",
          borderRadius: "8px",
          border: "1px solid var(--border-soft)",
          background: "var(--bg-elevated)",
          color: "var(--text-subtle)",
          padding: "0 12px",
          cursor: loading ? "not-allowed" : "pointer",
          width: isMobile ? "100%" : "auto",
        }}
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        disabled={loading}
        style={{
          height: "34px",
          borderRadius: "8px",
          border: "1px solid var(--border-soft)",
          background: "var(--accent-soft)",
          color: "var(--accent)",
          fontWeight: 600,
          padding: "0 12px",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.65 : 1,
          width: isMobile ? "100%" : "auto",
        }}
      >
        {loading ? "Saving..." : saveLabel}
      </button>
    </div>
  );
}

function DataSection({
  isMobile = false,
  title,
  subtitle,
  onAdd,
  addLabel,
  columns,
  rows,
  emptyLabel,
}: {
  isMobile?: boolean;
  title: string;
  subtitle: string;
  onAdd: () => void;
  addLabel: string;
  columns: string[];
  rows: Array<{
    key: number;
    values: string[];
    statusIndex?: number[];
    onEdit: () => void;
    onDelete: () => void;
  }>;
  emptyLabel: string;
}) {
  const renderStatusValue = (value: string, showStatus?: boolean) => {
    const color = statusColor[(value || "").toLowerCase()] || statusColor[value];
    if (showStatus && color) {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            borderRadius: "999px",
            border: `1px solid ${color}30`,
            background: `${color}14`,
            color,
            padding: "2px 8px",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: color }} />
          {value}
        </span>
      );
    }
    return value || "-";
  };

  const renderActionButtons = (row: { onEdit: () => void; onDelete: () => void; key: number }) => (
    <span style={{ display: "inline-flex", gap: "6px", justifyContent: "flex-start" }}>
      <button
        onClick={row.onEdit}
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "7px",
          border: "1px solid var(--border-soft)",
          background: "var(--bg-elevated)",
          color: "var(--text-muted)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Edit"
      >
        <Pencil size={12} />
      </button>
      <button
        onClick={row.onDelete}
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "7px",
          border: "1px solid var(--danger-soft-border)",
          background: "var(--danger-soft-bg)",
          color: "var(--danger)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Delete"
      >
        <Trash2 size={12} />
      </button>
    </span>
  );

  return (
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
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          flexDirection: isMobile ? "column" : "row",
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-default)",
          gap: isMobile ? "10px" : "8px",
        }}
      >
        <div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
          <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "2px" }}>{subtitle}</div>
        </div>
        <button
          onClick={onAdd}
          style={{
            height: "34px",
            borderRadius: "8px",
            border: "1px solid var(--border-soft)",
            background: "var(--accent-soft)",
            color: "var(--accent)",
            fontSize: "12px",
            fontWeight: 600,
            padding: "0 12px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            width: isMobile ? "100%" : "auto",
            justifyContent: "center",
          }}
        >
          <Plus size={12} />
          {addLabel}
        </button>
      </div>

      {isMobile ? (
        <div style={{ padding: "10px" }}>
          {rows.length === 0 ? (
            <div style={{ padding: "10px 6px", fontSize: "12px", color: "var(--text-subtle)" }}>{emptyLabel}</div>
          ) : (
            <div style={{ display: "grid", gap: "8px" }}>
              {rows.map((row) => (
                <div
                  key={row.key}
                  style={{
                    border: "1px solid var(--border-soft)",
                    borderRadius: "10px",
                    background: "var(--bg-panel)",
                    padding: "10px",
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {columns.map((column, colIndex) => {
                    const value = row.values[colIndex];
                    if (value === "actions") return null;
                    return (
                      <div
                        key={`${row.key}-${colIndex}-mobile`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "94px minmax(0, 1fr)",
                          gap: "8px",
                          alignItems: "start",
                        }}
                      >
                        <span style={{ ...mutedMonoStyle, fontSize: "9px", paddingTop: "2px" }}>{column}</span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--text-subtle)",
                            whiteSpace: "pre-line",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {renderStatusValue(value, row.statusIndex?.includes(colIndex))}
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "4px", borderTop: "1px solid var(--border-soft)" }}>
                    {renderActionButtons(row)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, 1fr)`, padding: "10px 16px", borderBottom: "1px solid var(--border-soft)", background: "var(--bg-panel)" }}>
            {columns.map((column) => (
              <span key={column} style={mutedMonoStyle}>
                {column}
              </span>
            ))}
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: "16px", fontSize: "12px", color: "var(--text-subtle)" }}>{emptyLabel}</div>
          ) : (
            rows.map((row, rowIndex) => (
              <div
                key={row.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
                  padding: "12px 16px",
                  borderBottom: rowIndex < rows.length - 1 ? "1px solid var(--table-row-divider)" : "none",
                  alignItems: "start",
                  gap: "8px",
                }}
              >
                {row.values.map((value, colIndex) => {
                  if (value === "actions") return <span key={`action-${row.key}`}>{renderActionButtons(row)}</span>;
                  return (
                    <span key={`${row.key}-${colIndex}`} style={{ fontSize: "12px", color: "var(--text-subtle)", whiteSpace: "pre-line" }}>
                      {renderStatusValue(value, row.statusIndex?.includes(colIndex))}
                    </span>
                  );
                })}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
