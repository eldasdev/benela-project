"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import {
  AdminMetricCard,
  AdminMetricGrid,
  AdminPageHero,
  adminButtonStyle,
} from "@/components/admin/ui";
import {
  Database,
  FileUp,
  Globe,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

type TrainerProvider = "auto" | "anthropic" | "openai";

type TrainerProfile = {
  id: number;
  section: string;
  provider: TrainerProvider;
  model?: string | null;
  system_instructions?: string | null;
  temperature: number;
  max_context_chars: number;
  is_enabled: boolean;
  last_trained_at?: string | null;
  created_at: string;
  updated_at: string;
  sources_total: number;
  sources_ready: number;
  chunks_total: number;
};

type TrainerSource = {
  id: number;
  section: string;
  source_type: string;
  title: string;
  source_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  status: "processing" | "ready" | "failed" | string;
  summary?: string | null;
  word_count: number;
  chunk_count: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
};

type ContextPreviewResponse = {
  context: string;
};

type AgentResponse = {
  response: string;
};

type PlaygroundEntry = {
  id: number;
  section: string;
  title: string;
  raw_text: string;
  status: string;
  word_count: number;
  chunk_count: number;
  created_at: string;
};

type PlaygroundRunResponse = {
  response: string;
  context_used: string;
  provider_used: string;
  model_used: string;
};

const SECTIONS = [
  "dashboard",
  "projects",
  "finance",
  "hr",
  "sales",
  "support",
  "legal",
  "marketing",
  "supply_chain",
  "procurement",
  "insights",
  "settings",
  "marketplace",
  "admin",
] as const;

const PROVIDER_MODELS: Record<Exclude<TrainerProvider, "auto">, string[]> = {
  anthropic: [
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-1-20250805",
  ],
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
};

function readError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

function displaySection(value: string): string {
  if (value === "hr") return "HR";
  return value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

async function parseResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const payload = await res.json().catch(() => null);
  throw new Error(payload?.detail || fallbackMessage);
}

export default function AdminAITrainerPage() {
  const [profiles, setProfiles] = useState<TrainerProfile[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("finance");
  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [sources, setSources] = useState<TrainerSource[]>([]);

  const [provider, setProvider] = useState<TrainerProvider>("auto");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState("0.2");
  const [maxContextChars, setMaxContextChars] = useState("12000");
  const [enabled, setEnabled] = useState(true);
  const [instructions, setInstructions] = useState("");

  const [urlValue, setUrlValue] = useState("");
  const [urlTitle, setUrlTitle] = useState("");

  const [textTitle, setTextTitle] = useState("");
  const [textValue, setTextValue] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");

  const [previewPrompt, setPreviewPrompt] = useState("What are the compliance risks we should prioritize this month?");
  const [contextPreview, setContextPreview] = useState("");
  const [testResult, setTestResult] = useState("");

  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [processingSource, setProcessingSource] = useState(false);
  const [runningPreview, setRunningPreview] = useState(false);
  const [runningTest, setRunningTest] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Training Playground
  const [pgPrompt, setPgPrompt] = useState("");
  const [pgMessages, setPgMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [pgContext, setPgContext] = useState("");
  const [pgRunning, setPgRunning] = useState(false);
  const [pgLastQA, setPgLastQA] = useState<{ prompt: string; response: string } | null>(null);
  const [pgShowSave, setPgShowSave] = useState(false);
  const [pgSaveTitle, setPgSaveTitle] = useState("");
  const [pgSaveNotes, setPgSaveNotes] = useState("");
  const [pgSaving, setPgSaving] = useState(false);
  const [pgEntries, setPgEntries] = useState<PlaygroundEntry[]>([]);
  const [pgLoadingEntries, setPgLoadingEntries] = useState(false);

  const selectedModels = useMemo(() => {
    if (provider === "anthropic") return PROVIDER_MODELS.anthropic;
    if (provider === "openai") return PROVIDER_MODELS.openai;
    return [];
  }, [provider]);

  const sourceStats = useMemo(() => {
    const total = sources.length;
    const ready = sources.filter((item) => item.status === "ready").length;
    const failed = sources.filter((item) => item.status === "failed").length;
    const chunks = sources.reduce((acc, item) => acc + (item.chunk_count || 0), 0);
    const words = sources.reduce((acc, item) => acc + (item.word_count || 0), 0);
    return { total, ready, failed, chunks, words };
  }, [sources]);

  const hydrateProfileForm = (value: TrainerProfile) => {
    setProvider((value.provider as TrainerProvider) || "auto");
    setModel(value.model || "");
    setTemperature(String(value.temperature ?? 0.2));
    setMaxContextChars(String(value.max_context_chars ?? 12000));
    setEnabled(Boolean(value.is_enabled));
    setInstructions(value.system_instructions || "");
  };

  const loadProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const res = await authFetch(`${API}/admin/ai-trainer/profiles`);
      const payload = await parseResponse<TrainerProfile[]>(res, "Failed to load AI trainer profiles.");
      setProfiles(payload);

      if (!payload.length) {
        setProfile(null);
        setSources([]);
        return;
      }

      if (!payload.some((item) => item.section === selectedSection)) {
        setSelectedSection(payload[0].section);
      }
    } catch (err: unknown) {
      setError(readError(err, "Failed to load AI trainer profiles."));
    } finally {
      setLoadingProfiles(false);
    }
  }, [selectedSection]);

  const loadSectionData = useCallback(async (section: string) => {
    setLoadingSection(true);
    setError("");
    try {
      const [profileRes, sourcesRes] = await Promise.all([
        authFetch(`${API}/admin/ai-trainer/profile/${encodeURIComponent(section)}`),
        authFetch(`${API}/admin/ai-trainer/sources?section=${encodeURIComponent(section)}&limit=500`),
      ]);
      const profilePayload = await parseResponse<TrainerProfile>(
        profileRes,
        "Failed to load section training profile.",
      );
      const sourcesPayload = await parseResponse<TrainerSource[]>(
        sourcesRes,
        "Failed to load section training sources.",
      );

      setProfile(profilePayload);
      hydrateProfileForm(profilePayload);
      setSources(sourcesPayload);
      setContextPreview("");
      setTestResult("");
    } catch (err: unknown) {
      setError(readError(err, "Failed to load AI trainer section data."));
    } finally {
      setLoadingSection(false);
    }
  }, []);

  const loadPlaygroundEntries = useCallback(async (section: string) => {
    setPgLoadingEntries(true);
    try {
      const res = await authFetch(`${API}/admin/ai-trainer/playground/entries?section=${encodeURIComponent(section)}&limit=100`);
      const payload = await parseResponse<PlaygroundEntry[]>(res, "Failed to load playground entries.");
      setPgEntries(payload);
    } catch {
      setPgEntries([]);
    } finally {
      setPgLoadingEntries(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    if (!selectedSection) return;
    void loadSectionData(selectedSection);
  }, [selectedSection, loadSectionData]);

  useEffect(() => {
    if (!selectedSection) return;
    void loadPlaygroundEntries(selectedSection);
  }, [selectedSection, loadPlaygroundEntries]);

  const saveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/ai-trainer/profile/${encodeURIComponent(selectedSection)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: model.trim() || null,
          temperature: Number(temperature),
          max_context_chars: Number(maxContextChars),
          is_enabled: enabled,
          system_instructions: instructions,
        }),
      });
      const payload = await parseResponse<TrainerProfile>(res, "Failed to save profile.");
      setProfile(payload);
      hydrateProfileForm(payload);
      setNotice(`Saved ${displaySection(selectedSection)} AI trainer profile.`);
      await loadProfiles();
    } catch (err: unknown) {
      setError(readError(err, "Failed to save profile."));
    } finally {
      setSavingProfile(false);
    }
  };

  const ingestUrl = async () => {
    if (!urlValue.trim()) return;
    setProcessingSource(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/ai-trainer/sources/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: selectedSection,
          url: urlValue.trim(),
          title: urlTitle.trim() || null,
        }),
      });
      const created = await parseResponse<TrainerSource>(res, "Failed to ingest URL source.");
      setUrlValue("");
      setUrlTitle("");
      setNotice(
        created.status === "ready"
          ? `Website source indexed successfully (${created.chunk_count} chunks).`
          : `Website source added with status: ${created.status}.`,
      );
      await loadSectionData(selectedSection);
    } catch (err: unknown) {
      setError(readError(err, "Failed to ingest URL source."));
    } finally {
      setProcessingSource(false);
    }
  };

  const ingestText = async () => {
    if (!textValue.trim()) return;
    setProcessingSource(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/ai-trainer/sources/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: selectedSection,
          title: textTitle.trim() || `${displaySection(selectedSection)} note`,
          text: textValue,
        }),
      });
      const created = await parseResponse<TrainerSource>(res, "Failed to ingest text source.");
      setTextTitle("");
      setTextValue("");
      setNotice(`Text source indexed (${created.chunk_count} chunks).`);
      await loadSectionData(selectedSection);
    } catch (err: unknown) {
      setError(readError(err, "Failed to ingest text source."));
    } finally {
      setProcessingSource(false);
    }
  };

  const ingestFile = async () => {
    if (!file) return;
    setProcessingSource(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("section", selectedSection);
      form.append("file", file);
      if (fileTitle.trim()) {
        form.append("title", fileTitle.trim());
      }
      const res = await authFetch(`${API}/admin/ai-trainer/sources/file`, {
        method: "POST",
        body: form,
      });
      const created = await parseResponse<TrainerSource>(res, "Failed to ingest file source.");
      setFile(null);
      setFileTitle("");
      setNotice(
        created.status === "ready"
          ? `File source indexed (${created.chunk_count} chunks).`
          : `File processed with status: ${created.status}.`,
      );
      await loadSectionData(selectedSection);
    } catch (err: unknown) {
      setError(readError(err, "Failed to ingest file source."));
    } finally {
      setProcessingSource(false);
    }
  };

  const reindexSource = async (source: TrainerSource) => {
    setProcessingSource(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/ai-trainer/sources/${source.id}/reindex`, {
        method: "POST",
      });
      const updated = await parseResponse<TrainerSource>(res, "Failed to reindex source.");
      setNotice(
        updated.status === "ready"
          ? `Source reindexed (${updated.chunk_count} chunks).`
          : `Reindex completed with status: ${updated.status}.`,
      );
      await loadSectionData(selectedSection);
    } catch (err: unknown) {
      setError(readError(err, "Failed to reindex source."));
    } finally {
      setProcessingSource(false);
    }
  };

  const deleteSource = async (source: TrainerSource) => {
    const ok = window.confirm(`Delete source "${source.title}" from ${displaySection(selectedSection)}?`);
    if (!ok) return;
    setProcessingSource(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/ai-trainer/sources/${source.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Failed to delete source.");
      }
      setNotice("Source removed.");
      await loadSectionData(selectedSection);
    } catch (err: unknown) {
      setError(readError(err, "Failed to delete source."));
    } finally {
      setProcessingSource(false);
    }
  };

  const previewContext = async () => {
    if (!previewPrompt.trim()) return;
    setRunningPreview(true);
    setError("");
    try {
      const res = await authFetch(`${API}/admin/ai-trainer/context-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: selectedSection,
          message: previewPrompt,
          max_context_chars: Number(maxContextChars || 12000),
          max_chunks: 8,
        }),
      });
      const payload = await parseResponse<ContextPreviewResponse>(res, "Failed to preview context.");
      setContextPreview(payload.context || "No matching context snippets were found.");
    } catch (err: unknown) {
      setError(readError(err, "Failed to preview context."));
    } finally {
      setRunningPreview(false);
    }
  };

  const runTest = async () => {
    if (!previewPrompt.trim()) return;
    setRunningTest(true);
    setError("");
    try {
      const res = await authFetch(`${API}/agents/${encodeURIComponent(selectedSection)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: previewPrompt,
        }),
      });
      const payload = await parseResponse<AgentResponse>(res, "Failed to run AI test.");
      setTestResult(payload.response || "No response returned.");
    } catch (err: unknown) {
      setError(readError(err, "Failed to run AI test."));
    } finally {
      setRunningTest(false);
    }
  };

  const runPlayground = async () => {
    if (!pgPrompt.trim()) return;
    setPgRunning(true);
    setError("");
    const currentPrompt = pgPrompt.trim();
    const historyForApi = pgMessages.map((m) => ({ role: m.role, content: m.content }));
    try {
      const res = await authFetch(`${API}/admin/ai-trainer/playground/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: selectedSection,
          message: currentPrompt,
          conversation_history: historyForApi,
        }),
      });
      const payload = await parseResponse<PlaygroundRunResponse>(res, "Failed to run playground AI.");
      setPgMessages((prev) => [
        ...prev,
        { role: "user", content: currentPrompt },
        { role: "assistant", content: payload.response },
      ]);
      setPgContext(payload.context_used);
      setPgLastQA({ prompt: currentPrompt, response: payload.response });
      setPgSaveTitle(`${displaySection(selectedSection)}: ${currentPrompt.slice(0, 60)}${currentPrompt.length > 60 ? "..." : ""}`);
      setPgPrompt("");
    } catch (err: unknown) {
      setError(readError(err, "Failed to run playground AI."));
    } finally {
      setPgRunning(false);
    }
  };

  const savePlaygroundEntry = async () => {
    if (!pgLastQA || !pgSaveTitle.trim()) return;
    setPgSaving(true);
    setError("");
    try {
      const res = await authFetch(`${API}/admin/ai-trainer/playground/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: selectedSection,
          title: pgSaveTitle.trim(),
          prompt: pgLastQA.prompt,
          response: pgLastQA.response,
          notes: pgSaveNotes.trim() || null,
        }),
      });
      await parseResponse<{ ok: boolean; id: number; chunks: number }>(res, "Failed to save playground entry.");
      setNotice("Training entry saved and indexed. The AI will now use this knowledge for client queries.");
      setPgShowSave(false);
      setPgSaveTitle("");
      setPgSaveNotes("");
      await loadPlaygroundEntries(selectedSection);
    } catch (err: unknown) {
      setError(readError(err, "Failed to save playground entry."));
    } finally {
      setPgSaving(false);
    }
  };

  if (loadingProfiles) {
    return (
      <div style={centerStyle}>
        <div style={spinnerStyle} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1480px", margin: "0 auto", display: "grid", gap: "16px" }}>
      <AdminPageHero
        eyebrow="Knowledge Operations"
        title="AI Trainer Studio"
        subtitle="Train section-specific intelligence from websites, documents, and curated internal notes. This surface controls retrieval quality, provider routing, and runtime behavior for each module assistant."
        actions={
          <button onClick={() => void loadSectionData(selectedSection)} style={adminButtonStyle("secondary")} disabled={loadingSection}>
            <RefreshCcw size={14} />
            {loadingSection ? "Refreshing..." : "Refresh Section"}
          </button>
        }
      />

      {(error || notice) && (
        <div
          style={{
            marginBottom: "14px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: error ? "1px solid rgba(248,113,113,0.32)" : "1px solid rgba(52,211,153,0.32)",
            background: error ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)",
            color: error ? "#f87171" : "#34d399",
            fontSize: "12px",
          }}
        >
          {error || notice}
        </div>
      )}

      <AdminMetricGrid>
        <AdminMetricCard label="Sources" value={String(sourceStats.total)} detail="Knowledge assets attached to this section" tone="accent" />
        <AdminMetricCard label="Ready" value={String(sourceStats.ready)} detail="Indexed and retrievable" tone="success" />
        <AdminMetricCard label="Failed" value={String(sourceStats.failed)} detail="Sources needing repair or reindexing" tone={sourceStats.failed > 0 ? "danger" : "neutral"} />
        <AdminMetricCard label="Chunks" value={String(sourceStats.chunks)} detail="Fragments available to retrieval" tone="accent" />
        <AdminMetricCard label="Words indexed" value={sourceStats.words.toLocaleString()} detail="Approximate knowledge volume" tone="warning" />
      </AdminMetricGrid>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "16px" }}>
        <section style={panelStyle}>
          <div style={panelHeader}>Section Model Profile</div>
          <div style={panelBody}>
            <div style={gridTwo}>
              <Field label="Section">
                <select
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  style={inputStyle}
                  disabled={loadingSection}
                >
                  {SECTIONS.map((item) => (
                    <option key={item} value={item}>
                      {displaySection(item)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Provider Routing">
                <select value={provider} onChange={(e) => setProvider(e.target.value as TrainerProvider)} style={inputStyle}>
                  <option value="auto">Auto (model-based)</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                </select>
              </Field>
            </div>

            <div style={gridThree}>
              <Field label="Model ID (optional override)">
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={inputStyle}
                  placeholder={provider === "openai" ? "gpt-4.1-mini" : "claude-sonnet-4-5-20250929"}
                />
              </Field>
              <Field label="Temperature">
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Max Context Chars">
                <input
                  type="number"
                  min={2000}
                  max={80000}
                  step={500}
                  value={maxContextChars}
                  onChange={(e) => setMaxContextChars(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>

            {selectedModels.length > 0 && (
              <div style={{ marginBottom: "10px", fontSize: "11px", color: "var(--text-subtle)" }}>
                Suggested {provider} models: {selectedModels.join(", ")}
              </div>
            )}

            <label style={switchRowStyle}>
              <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>Enable section training at runtime</span>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            </label>

            <Field label="Additional System Instructions">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                style={{ ...inputStyle, minHeight: "130px", resize: "vertical", fontFamily: "inherit" }}
                placeholder="Define brand voice, regulatory rules, forbidden claims, approved answer structure, and escalation policy for this section."
              />
            </Field>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "var(--text-quiet)" }}>
                Last trained: {profile?.last_trained_at ? new Date(profile.last_trained_at).toLocaleString() : "Never"}
              </span>
              <button onClick={saveProfile} style={primaryBtn} disabled={savingProfile}>
                <Save size={13} />
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={panelHeader}>Ingestion Pipelines</div>
          <div style={panelBody}>
            <Field label="Website URL">
              <div style={stackRow}>
                <input
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  style={inputStyle}
                  placeholder="https://example.com/policy"
                />
                <input
                  value={urlTitle}
                  onChange={(e) => setUrlTitle(e.target.value)}
                  style={inputStyle}
                  placeholder="Optional source title"
                />
                <button onClick={ingestUrl} style={secondaryBtn} disabled={processingSource || !urlValue.trim()}>
                  <Globe size={13} />
                  Ingest URL
                </button>
              </div>
            </Field>

            <Field label="Document Upload">
              <div style={stackRow}>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  style={inputStyle}
                />
                <input
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                  style={inputStyle}
                  placeholder="Optional source title"
                />
                <button onClick={ingestFile} style={secondaryBtn} disabled={processingSource || !file}>
                  <FileUp size={13} />
                  Upload + Index
                </button>
              </div>
            </Field>

            <Field label="Manual Knowledge Note">
              <input
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                style={inputStyle}
                placeholder="Title"
              />
              <textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                style={{ ...inputStyle, minHeight: "120px", resize: "vertical", marginTop: "8px", fontFamily: "inherit" }}
                placeholder="Paste policy snippets, SOP, benchmarks, decision frameworks, playbooks..."
              />
              <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end" }}>
                <button onClick={ingestText} style={secondaryBtn} disabled={processingSource || textValue.trim().length < 30}>
                  <Database size={13} />
                  Save as Source
                </button>
              </div>
            </Field>
          </div>
        </section>
      </div>

      <section style={{ ...panelStyle, marginTop: "16px" }}>
        <div style={panelHeader}>Source Library</div>
        <div style={panelBody}>
          <div style={tableHeaderStyle}>
            <span>Source</span>
            <span>Type</span>
            <span>Status</span>
            <span>Words</span>
            <span>Chunks</span>
            <span>Updated</span>
            <span style={{ textAlign: "right" }}>Actions</span>
          </div>
          {sources.map((source) => (
            <div key={source.id} style={tableRowStyle}>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>{source.title}</div>
                <div style={{ fontSize: "10px", color: "var(--text-quiet)", marginTop: "2px" }}>
                  {source.source_url || source.file_name || source.mime_type || "Internal text source"}
                </div>
                {source.error_message ? (
                  <div style={{ fontSize: "10px", color: "#f87171", marginTop: "4px" }}>{source.error_message}</div>
                ) : source.summary ? (
                  <div style={{ fontSize: "10px", color: "var(--text-quiet)", marginTop: "4px" }}>{source.summary}</div>
                ) : null}
              </div>
              <span style={tinyCell}>{source.source_type}</span>
              <span style={{ ...tinyCell, color: statusColor(source.status) }}>{source.status}</span>
              <span style={tinyCell}>{source.word_count.toLocaleString()}</span>
              <span style={tinyCell}>{source.chunk_count.toLocaleString()}</span>
              <span style={tinyCell}>{new Date(source.updated_at).toLocaleString()}</span>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                <button onClick={() => void reindexSource(source)} style={miniBtn} disabled={processingSource} title="Reindex source">
                  <RefreshCcw size={12} />
                </button>
                <button onClick={() => void deleteSource(source)} style={miniDangerBtn} disabled={processingSource} title="Delete source">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {!sources.length && <div style={{ fontSize: "12px", color: "var(--text-subtle)", padding: "10px 0" }}>No sources yet for this section.</div>}
        </div>
      </section>

      <section style={{ ...panelStyle, marginTop: "16px" }}>
        <div style={panelHeader}>Retrieval & Runtime Test</div>
        <div style={panelBody}>
          <Field label="Validation Prompt">
            <textarea
              value={previewPrompt}
              onChange={(e) => setPreviewPrompt(e.target.value)}
              style={{ ...inputStyle, minHeight: "92px", resize: "vertical", fontFamily: "inherit" }}
            />
          </Field>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
            <button onClick={previewContext} style={secondaryBtn} disabled={runningPreview || !previewPrompt.trim()}>
              <Search size={13} />
              {runningPreview ? "Previewing..." : "Preview Retrieved Context"}
            </button>
            <button onClick={runTest} style={primaryBtn} disabled={runningTest || !previewPrompt.trim()}>
              <Sparkles size={13} />
              {runningTest ? "Running..." : "Run Section AI Test"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px" }}>
            <div style={outputBoxStyle}>
              <div style={outputTitleStyle}>Context Preview</div>
              <pre style={outputContentStyle}>{contextPreview || "Context preview will appear here."}</pre>
            </div>
            <div style={outputBoxStyle}>
              <div style={outputTitleStyle}>AI Response</div>
              <pre style={outputContentStyle}>{testResult || "AI test response will appear here."}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* Training Playground */}
      <section style={{ ...panelStyle, marginTop: "0" }}>
        <div style={{ ...panelHeader, display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkles size={14} />
          Training Playground
        </div>
        <div style={panelBody}>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "14px", lineHeight: 1.6, margin: "0 0 14px" }}>
            Ask questions to test and refine section AI behavior. Save good responses as training knowledge — they get automatically indexed and used when clients ask questions in their dashboard.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "14px" }}>
            {/* Left: Conversation */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ ...outputBoxStyle, minHeight: "260px" }}>
                <div style={outputTitleStyle}>Conversation</div>
                <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "340px", overflowY: "auto" }}>
                  {pgMessages.length === 0 && (
                    <span style={{ fontSize: "12px", color: "var(--text-quiet)" }}>Ask a question to begin training this section.</span>
                  )}
                  {pgMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "8px",
                        fontSize: "12px",
                        lineHeight: 1.5,
                        background: msg.role === "user" ? "var(--bg-elevated)" : "color-mix(in srgb, var(--accent) 8%, var(--bg-panel))",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <span style={{ fontSize: "10px", color: "var(--text-subtle)", marginBottom: "4px", display: "block", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "monospace" }}>
                        {msg.role === "user" ? "You" : `AI · ${displaySection(selectedSection)}`}
                      </span>
                      {msg.content}
                    </div>
                  ))}
                </div>
              </div>

              <textarea
                value={pgPrompt}
                onChange={(e) => setPgPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void runPlayground();
                  }
                }}
                placeholder={`Ask a question for the ${displaySection(selectedSection)} section...`}
                style={{ ...inputStyle, minHeight: "72px", resize: "vertical", fontFamily: "inherit" }}
                disabled={pgRunning}
              />

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button onClick={() => void runPlayground()} style={primaryBtn} disabled={pgRunning || !pgPrompt.trim()}>
                  <Sparkles size={13} />
                  {pgRunning ? "Thinking..." : "Ask AI"}
                </button>
                {pgLastQA && !pgShowSave && (
                  <button onClick={() => setPgShowSave(true)} style={secondaryBtn}>
                    <Save size={13} />
                    Save to Training
                  </button>
                )}
                {pgMessages.length > 0 && (
                  <button
                    onClick={() => { setPgMessages([]); setPgContext(""); setPgLastQA(null); setPgShowSave(false); }}
                    style={secondaryBtn}
                  >
                    <RefreshCcw size={13} />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Right: Retrieved Context */}
            <div>
              <div style={{ ...outputBoxStyle, minHeight: "260px" }}>
                <div style={outputTitleStyle}>Retrieved Training Context</div>
                <pre style={{ ...outputContentStyle, maxHeight: "440px" }}>
                  {pgContext || "Retrieved training context will appear here after your first query."}
                </pre>
              </div>
            </div>
          </div>

          {/* Save Dialog */}
          {pgShowSave && pgLastQA && (
            <div
              style={{
                marginTop: "14px",
                padding: "14px",
                border: "1px solid color-mix(in srgb, var(--accent) 35%, var(--border-default))",
                borderRadius: "12px",
                background: "color-mix(in srgb, var(--accent) 5%, var(--bg-surface))",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px" }}>
                Save as Training Knowledge
              </div>
              <div style={gridTwo}>
                <Field label="Entry Title">
                  <input
                    value={pgSaveTitle}
                    onChange={(e) => setPgSaveTitle(e.target.value)}
                    style={inputStyle}
                    placeholder="Descriptive title for this Q&A pair..."
                  />
                </Field>
                <Field label="Notes (optional)">
                  <input
                    value={pgSaveNotes}
                    onChange={(e) => setPgSaveNotes(e.target.value)}
                    style={inputStyle}
                    placeholder="Any additional context or caveats..."
                  />
                </Field>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => void savePlaygroundEntry()} style={primaryBtn} disabled={pgSaving || !pgSaveTitle.trim()}>
                  <Save size={13} />
                  {pgSaving ? "Saving..." : "Save & Index"}
                </button>
                <button onClick={() => setPgShowSave(false)} style={secondaryBtn}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Saved Training Entries */}
          <div style={{ marginTop: "20px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <Database size={12} />
              Saved Training Entries — {displaySection(selectedSection)}
              {pgLoadingEntries && (
                <span style={{ fontSize: "11px", color: "var(--text-subtle)", fontWeight: 400, marginLeft: "4px" }}>Loading...</span>
              )}
            </div>

            {!pgLoadingEntries && pgEntries.length === 0 && (
              <div style={{ fontSize: "12px", color: "var(--text-subtle)", padding: "10px 0" }}>
                No training entries saved for this section yet. Ask questions and save good responses above.
              </div>
            )}

            {pgEntries.length > 0 && (
              <div style={{ border: "1px solid var(--border-default)", borderRadius: "10px", overflow: "hidden" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2.5fr 0.7fr 0.6fr 0.6fr 0.8fr",
                    gap: "8px",
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--border-default)",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-quiet)",
                    fontFamily: "monospace",
                  }}
                >
                  <span>Title</span>
                  <span>Status</span>
                  <span>Chunks</span>
                  <span>Words</span>
                  <span>Created</span>
                </div>
                {pgEntries.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2.5fr 0.7fr 0.6fr 0.6fr 0.8fr",
                      gap: "8px",
                      padding: "10px",
                      borderBottom: "1px solid var(--table-row-divider)",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 500 }}>{entry.title}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "2px" }}>{entry.section}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: "11px", color: statusColor(entry.status) }}>{entry.status}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{entry.chunk_count}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{entry.word_count.toLocaleString()}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                      {new Date(entry.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: "6px", marginBottom: "10px" }}>
      <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{label}</span>
      {children}
    </label>
  );
}

function statusColor(status: string): string {
  if (status === "ready") return "#34d399";
  if (status === "processing") return "#fbbf24";
  if (status === "failed") return "#f87171";
  return "var(--text-subtle)";
}

const panelStyle: CSSProperties = {
  border: "1px solid var(--border-default)",
  borderRadius: "14px",
  background: "var(--bg-surface)",
  overflow: "hidden",
};

const panelHeader: CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid var(--border-default)",
  fontSize: "13px",
  fontWeight: 700,
  color: "var(--text-primary)",
};

const panelBody: CSSProperties = {
  padding: "12px 14px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "var(--bg-panel)",
  border: "1px solid var(--border-default)",
  borderRadius: "10px",
  color: "var(--text-primary)",
  fontSize: "12px",
  padding: "8px 10px",
  outline: "none",
};

const gridTwo: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "8px",
};

const gridThree: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr",
  gap: "8px",
};

const stackRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.5fr 1fr auto",
  gap: "8px",
};

const switchRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  marginBottom: "10px",
  padding: "8px 10px",
  borderRadius: "10px",
  border: "1px solid var(--border-default)",
  background: "var(--bg-panel)",
};

const primaryBtn: CSSProperties = {
  border: "1px solid color-mix(in srgb, var(--accent) 45%, var(--border-default))",
  background: "color-mix(in srgb, var(--accent) 18%, var(--bg-elevated))",
  color: "var(--accent)",
  borderRadius: "10px",
  fontSize: "12px",
  fontWeight: 600,
  padding: "8px 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  border: "1px solid var(--border-default)",
  background: "var(--bg-panel)",
  color: "var(--text-subtle)",
  borderRadius: "10px",
  fontSize: "12px",
  fontWeight: 600,
  padding: "8px 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  cursor: "pointer",
};

const miniBtn: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "8px",
  border: "1px solid var(--border-default)",
  background: "var(--bg-panel)",
  color: "var(--text-subtle)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const miniDangerBtn: CSSProperties = {
  ...miniBtn,
  color: "#f87171",
};

const tableHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2.2fr 0.7fr 0.8fr 0.6fr 0.6fr 1fr 0.7fr",
  gap: "8px",
  padding: "8px 6px",
  borderBottom: "1px solid var(--border-default)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-quiet)",
  fontFamily: "monospace",
};

const tableRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2.2fr 0.7fr 0.8fr 0.6fr 0.6fr 1fr 0.7fr",
  gap: "8px",
  padding: "10px 6px",
  borderBottom: "1px solid var(--table-row-divider)",
  alignItems: "start",
};

const tinyCell: CSSProperties = {
  fontSize: "11px",
  color: "var(--text-subtle)",
  display: "flex",
  alignItems: "center",
};

const outputBoxStyle: CSSProperties = {
  border: "1px solid var(--border-default)",
  borderRadius: "12px",
  overflow: "hidden",
  background: "var(--bg-panel)",
  minHeight: "230px",
};

const outputTitleStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--border-default)",
  fontSize: "11px",
  color: "var(--text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontFamily: "monospace",
};

const outputContentStyle: CSSProperties = {
  margin: 0,
  padding: "10px",
  fontSize: "12px",
  color: "var(--text-primary)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
  maxHeight: "380px",
  overflowY: "auto",
  fontFamily: "Geist, sans-serif",
};

const centerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "70vh",
};

const spinnerStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  border: "2px solid rgba(148,163,184,0.35)",
  borderTopColor: "var(--accent)",
  animation: "spin 0.8s linear infinite",
};
