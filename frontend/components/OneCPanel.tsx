"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, Database, Link2, RefreshCcw, UploadCloud, Wifi, XCircle } from "lucide-react";
import {
  confirmOneCJob,
  deleteOneCConnection,
  deleteOneCJob,
  downloadOneCTemplate,
  fetchOneCOverview,
  getOneCJob,
  listOneCConnections,
  listOneCJobs,
  listOneCRecords,
  saveOneCConnection,
  syncOneCConnection,
  testOneCConnection,
  uploadOneCFile,
  type OneCConnection,
  type OneCJob,
  type OneCOverview,
  type OneCRecord,
} from "@/lib/onec";
import { useIsMobile } from "@/lib/use-is-mobile";

const cardStyle: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "16px",
  overflow: "hidden",
};

const labelStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: "6px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-soft)",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
};

const buttonStyle: CSSProperties = {
  height: "38px",
  borderRadius: "10px",
  border: "1px solid var(--border-default)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent-2) 72%, var(--accent) 28%))",
  color: "white",
  border: "none",
};

const REPORT_TYPE_OPTIONS = [
  { value: "", label: "Auto-detect from file" },
  { value: "cash_flow", label: "Cash flow / DDS" },
  { value: "sales", label: "Sales / realization" },
  { value: "inventory", label: "Inventory / stock" },
  { value: "payroll", label: "Payroll" },
  { value: "trial_balance", label: "Trial balance / OSV" },
];

function statusTone(status?: string | null): { background: string; color: string } {
  const normalized = (status || "").toLowerCase();
  if (["completed", "success", "imported", "connected"].includes(normalized)) {
    return { background: "rgba(52,211,153,0.14)", color: "#34d399" };
  }
  if (["processing", "pending"].includes(normalized)) {
    return { background: "rgba(124,106,255,0.14)", color: "var(--accent)" };
  }
  if (["failed", "error"].includes(normalized)) {
    return { background: "rgba(248,113,113,0.14)", color: "#f87171" };
  }
  return { background: "rgba(148,163,184,0.14)", color: "var(--text-subtle)" };
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function summarizeJobError(job: OneCJob | null): string {
  if (!job?.error_message) return "";
  const trimmed = job.error_message
    .replace(/^fastapi\.exceptions\.HTTPException:\s*/i, "")
    .replace(/^HTTPException:\s*/i, "")
    .replace(/^\d{3}:\s*/, "")
    .trim();
  if (!trimmed) return "";
  const lastLine = trimmed.split("\n").map((item) => item.trim()).filter(Boolean).pop();
  return lastLine || trimmed;
}

export default function OneCPanel() {
  const isMobile = useIsMobile(900);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [overview, setOverview] = useState<OneCOverview | null>(null);
  const [jobs, setJobs] = useState<OneCJob[]>([]);
  const [connections, setConnections] = useState<OneCConnection[]>([]);
  const [selectedJob, setSelectedJob] = useState<OneCJob | null>(null);
  const [previewRows, setPreviewRows] = useState<OneCRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [reportTypeHint, setReportTypeHint] = useState("");
  const [connectionForm, setConnectionForm] = useState({
    connection_type: "file",
    connection_label: "",
    db_type: "postgresql",
    db_host: "",
    db_port: "5432",
    db_name: "",
    db_username: "",
    db_password: "",
    api_base_url: "",
    api_username: "",
    api_password: "",
    api_version: "8.3",
    sync_enabled: false,
    sync_interval_minutes: "1440",
    is_active: true,
  });

  const loadOverview = useCallback(async () => {
    const [overviewData, jobsData, connectionData] = await Promise.all([
      fetchOneCOverview(),
      listOneCJobs(),
      listOneCConnections(),
    ]);
    setOverview(overviewData);
    setJobs(jobsData);
    setConnections(connectionData);
    setSelectedJob((current) => {
      if (current) {
        return jobsData.find((item) => item.id === current.id) || jobsData[0] || null;
      }
      return jobsData[0] || null;
    });
  }, []);

  const loadPreview = useCallback(async (jobId: number | null) => {
    if (!jobId) {
      setPreviewRows([]);
      return;
    }
    const payload = await listOneCRecords(jobId);
    setPreviewRows(payload.items);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load 1C panel.");
    } finally {
      setLoading(false);
    }
  }, [loadOverview]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void loadPreview(selectedJob?.id || null);
  }, [loadPreview, selectedJob?.id]);

  useEffect(() => {
    const activeJob = jobs.find((item) => ["pending", "processing"].includes(item.status));
    if (!activeJob) return;
    const interval = window.setInterval(async () => {
      try {
        const updated = await getOneCJob(activeJob.id);
        setJobs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        if (!["pending", "processing"].includes(updated.status)) {
          await refresh();
        }
      } catch {
        // ignore transient polling failures
      }
    }, 2500);
    return () => window.clearInterval(interval);
  }, [jobs, refresh]);

  const handleUpload = async (file: File, reportTypeHintValue?: string) => {
    setError("");
    setMessage("");
    try {
      const result = await uploadOneCFile(file, reportTypeHintValue || undefined);
      setMessage(result.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload 1C file.");
    }
  };

  const handleConfirm = async (job: OneCJob) => {
    try {
      const result = await confirmOneCJob(job.id);
      setMessage(result.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm 1C import.");
    }
  };

  const handleDeleteJob = async (job: OneCJob) => {
    if (!window.confirm(`Remove import job ${job.filename}?`)) return;
    try {
      await deleteOneCJob(job.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete 1C import job.");
    }
  };

  const activeConnection = connections[0] || null;

  const saveConnection = async () => {
    setSavingConnection(true);
    setError("");
    setMessage("");
    try {
      const payload: Record<string, unknown> = {
        connection_type: connectionForm.connection_type,
        connection_label: connectionForm.connection_label || null,
        db_type: connectionForm.connection_type === "database" ? connectionForm.db_type : null,
        db_host: connectionForm.connection_type === "database" ? connectionForm.db_host || null : null,
        db_port: connectionForm.connection_type === "database" && connectionForm.db_port ? Number(connectionForm.db_port) : null,
        db_name: connectionForm.connection_type === "database" ? connectionForm.db_name || null : null,
        db_username: connectionForm.connection_type === "database" ? connectionForm.db_username || null : null,
        db_password: connectionForm.connection_type === "database" ? connectionForm.db_password || null : null,
        api_base_url: connectionForm.connection_type === "http_api" ? connectionForm.api_base_url || null : null,
        api_username: connectionForm.connection_type === "http_api" ? connectionForm.api_username || null : null,
        api_password: connectionForm.connection_type === "http_api" ? connectionForm.api_password || null : null,
        api_version: connectionForm.connection_type === "http_api" ? connectionForm.api_version || null : null,
        sync_enabled: connectionForm.sync_enabled,
        sync_interval_minutes: Number(connectionForm.sync_interval_minutes || 1440),
        is_active: connectionForm.is_active,
      };
      const saved = await saveOneCConnection(payload, activeConnection?.id);
      setMessage(activeConnection ? "1C connection updated." : "1C connection created.");
      setConnectionForm((current) => ({ ...current, db_password: "", api_password: "" }));
      await refresh();
      if (!activeConnection && saved) {
        setSelectedJob((current) => current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save 1C connection.");
    } finally {
      setSavingConnection(false);
    }
  };

  const runConnectionTest = async () => {
    if (!activeConnection) return;
    try {
      const result = await testOneCConnection(activeConnection.id);
      if (result.status === "success") setMessage(result.detail);
      else setError(result.detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not test 1C connection.");
    }
  };

  const runSync = async () => {
    if (!activeConnection) return;
    try {
      const result = await syncOneCConnection(activeConnection.id);
      setMessage(result.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start 1C sync.");
    }
  };

  const removeConnection = async () => {
    if (!activeConnection || !window.confirm("Disconnect the current 1C integration?")) return;
    try {
      await deleteOneCConnection(activeConnection.id);
      setMessage("1C connection removed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove 1C connection.");
    }
  };

  useEffect(() => {
    if (!activeConnection) return;
    setConnectionForm((current) => ({
      ...current,
      connection_type: activeConnection.connection_type,
      connection_label: activeConnection.connection_label || "",
      db_type: activeConnection.db_type || "postgresql",
      db_port: activeConnection.db_port ? String(activeConnection.db_port) : "5432",
      db_name: activeConnection.db_name || "",
      api_base_url: activeConnection.api_base_url || "",
      api_version: activeConnection.api_version || "8.3",
      sync_enabled: activeConnection.sync_enabled,
      sync_interval_minutes: String(activeConnection.sync_interval_minutes || 1440),
      is_active: activeConnection.is_active,
      db_host: "",
      db_username: "",
      db_password: "",
      api_username: "",
      api_password: "",
    }));
  }, [activeConnection]);

  const selectedPreviewColumns = useMemo(() => {
    const row = previewRows[0];
    if (!row) return [] as string[];
    return Object.keys(row.normalized_data || {}).slice(0, 8);
  }, [previewRows]);

  const selectedJobError = useMemo(() => summarizeJobError(selectedJob), [selectedJob]);

  return (
    <div style={{ display: "grid", gap: "16px", marginBottom: "18px" }}>
      <div style={{ ...cardStyle, display: "grid", gap: "0" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "6px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)" }}>1C integration</div>
            <div style={{ fontSize: "30px", lineHeight: 1.05, fontWeight: 700, color: "var(--text-primary)" }}>1C bridge</div>
            <div style={{ fontSize: "13px", color: "var(--text-subtle)", maxWidth: "780px", lineHeight: 1.6 }}>
              Upload exported 1C files, preview normalized records, confirm imports, or connect a scheduled database / HTTP sync.
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => void refresh()} style={buttonStyle}><RefreshCcw size={14} /> Refresh</button>
            {activeConnection ? <button type="button" onClick={() => void runSync()} style={primaryButtonStyle}><RefreshCcw size={14} /> Sync now</button> : null}
          </div>
        </div>
          <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
          {[
            { label: "Status", value: overview?.has_active_connection ? "Connected" : "File bridge", detail: overview?.last_sync_status || "Awaiting first sync" },
            { label: "Last sync", value: overview?.last_sync_at ? formatDate(overview.last_sync_at) : "Not yet", detail: overview?.connection_type || "manual" },
            { label: "Records imported", value: formatCount(overview?.imported_records || 0), detail: `${formatCount(overview?.ready_records || 0)} awaiting confirm` },
            { label: "Anomalies", value: formatCount(overview?.anomaly_count || 0), detail: overview?.coverage_period_end ? `Coverage until ${overview.coverage_period_end}` : "Coverage unknown" },
          ].map((item) => (
            <div key={item.label} style={{ border: "1px solid var(--border-default)", borderRadius: "14px", padding: "14px", background: "color-mix(in srgb, var(--bg-panel) 88%, var(--bg-surface) 12%)", minWidth: 0 }}>
              <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.label}</div>
              <div style={{ fontSize: "20px", color: "var(--text-primary)", fontWeight: 700, lineHeight: 1.15, wordBreak: "break-word" }}>{item.value}</div>
              <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.5 }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {(message || error) ? (
        <div style={{ ...cardStyle, padding: "12px 14px", borderColor: error ? "rgba(248,113,113,0.4)" : "rgba(52,211,153,0.35)", color: error ? "#f87171" : "#34d399" }}>
          {error || message}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) minmax(0, 1fr)", gap: "16px" }}>
        <div style={cardStyle}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>File import bridge</div>
              <div style={{ fontSize: "13px", color: "var(--text-subtle)", marginTop: "4px" }}>Upload `.xlsx`, `.csv`, or `.xml` exports from 1C. The parser previews data before anything touches core finance tables.</div>
            </div>
          </div>
          <div style={{ padding: "18px", display: "grid", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto", gap: "10px", alignItems: "end" }}>
              <div>
                <label style={labelStyle}>Report type hint</label>
                <select value={reportTypeHint} onChange={(event) => setReportTypeHint(event.target.value)} style={inputStyle}>
                  {REPORT_TYPE_OPTIONS.map((item) => (
                    <option key={item.value || "auto"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" style={buttonStyle} onClick={() => void downloadOneCTemplate("cash_flow", "xlsx")}>
                  Sample XLSX
                </button>
                <button type="button" style={buttonStyle} onClick={() => void downloadOneCTemplate("cash_flow", "csv")}>
                  Sample CSV
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={() => setDragActive(true)}
              onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void handleUpload(file, reportTypeHint);
              }}
              style={{
                minHeight: "154px",
                borderRadius: "16px",
                border: `1px dashed ${dragActive ? "var(--accent)" : "var(--border-default)"}`,
                background: dragActive ? "color-mix(in srgb, var(--accent) 10%, var(--bg-panel) 90%)" : "color-mix(in srgb, var(--bg-panel) 82%, var(--bg-surface) 18%)",
                color: "var(--text-primary)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                padding: "20px",
                textAlign: "center",
              }}
            >
              <div style={{ display: "grid", gap: "10px", justifyItems: "center" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "color-mix(in srgb, var(--accent) 18%, transparent)", display: "grid", placeItems: "center" }}>
                  <UploadCloud size={22} color="var(--accent)" />
                </div>
                <div style={{ fontSize: "15px", fontWeight: 600 }}>Drop a 1C export here or click to upload</div>
                <div style={{ fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.5 }}>Supported formats: `.xlsx`, `.csv`, `.xml`. Max file size: 50MB. Macro-enabled Excel files are rejected.</div>
              </div>
            </button>
            <input ref={fileInputRef} type="file" hidden accept=".xlsx,.csv,.xml,.mxl" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file, reportTypeHint); event.currentTarget.value = ""; }} />

            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>Import history</div>
              <div style={{ display: "grid", gap: "10px" }}>
                {jobs.length ? jobs.map((job) => {
                  const tone = statusTone(job.status);
                  const isSelected = selectedJob?.id === job.id;
                  return (
                    <div
                      key={job.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedJob(job)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedJob(job);
                        }
                      }}
                      style={{
                        textAlign: "left",
                        padding: "12px 13px",
                        borderRadius: "14px",
                        border: `1px solid ${isSelected ? "var(--accent)" : "var(--border-default)"}`,
                        background: isSelected ? "color-mix(in srgb, var(--accent) 8%, var(--bg-panel) 92%)" : "color-mix(in srgb, var(--bg-panel) 82%, var(--bg-surface) 18%)",
                        display: "grid",
                        gap: "8px",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{job.filename}</div>
                        <span style={{ padding: "4px 8px", borderRadius: "999px", background: tone.background, color: tone.color, fontSize: "11px", fontWeight: 700 }}>{job.status}</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "12px", color: "var(--text-subtle)" }}>
                        <span>{job.report_type}</span>
                        <span>{formatCount(job.records_parsed)} rows</span>
                        <span>{formatDate(job.created_at)}</span>
                      </div>
                      {job.status === "failed" && job.error_message ? (
                        <div style={{ fontSize: "12px", color: "#f87171", lineHeight: 1.5 }}>
                          {summarizeJobError(job)}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {job.status === "completed" && !job.confirmed_at ? (
                          <button
                            type="button"
                            style={{ ...primaryButtonStyle, height: "32px", padding: "0 10px", fontSize: "11px" }}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleConfirm(job);
                            }}
                          >
                            Confirm import
                          </button>
                        ) : null}
                        <button
                          type="button"
                          style={{ ...buttonStyle, height: "32px", padding: "0 10px", fontSize: "11px" }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleDeleteJob(job);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                }) : <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>No 1C import history yet.</div>}
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "grid", gap: "4px" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>Preview and data health</div>
            <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>Preview the first parsed rows and monitor anomalies before you confirm imports.</div>
          </div>
          <div style={{ padding: "16px 18px", display: "grid", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
              <div style={{ border: "1px solid var(--border-default)", borderRadius: "14px", padding: "12px" }}>
                <div style={labelStyle}>Coverage period</div>
                <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{overview?.coverage_period_start || "—"} {overview?.coverage_period_end ? `→ ${overview.coverage_period_end}` : ""}</div>
              </div>
              <div style={{ border: "1px solid var(--border-default)", borderRadius: "14px", padding: "12px" }}>
                <div style={labelStyle}>Anomalies</div>
                <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{formatCount(overview?.anomaly_count || 0)}</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              {(overview?.anomalies || []).length ? overview?.anomalies.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.55 }}>
                  <AlertTriangle size={14} color="#fbbf24" style={{ marginTop: "2px", flexShrink: 0 }} />
                  <span>{item}</span>
                </div>
              )) : <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>No anomalies flagged from the latest imported records.</div>}
            </div>
            <div style={{ border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-default)", fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>
                {selectedJob ? `Preview: ${selectedJob.filename}` : "Import preview"}
              </div>
              {previewRows.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "580px" }}>
                    <thead>
                      <tr>
                        {selectedPreviewColumns.map((column) => (
                          <th key={column} style={{ textAlign: "left", padding: "10px 12px", fontSize: "10px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--border-default)" }}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row) => (
                        <tr key={row.id}>
                          {selectedPreviewColumns.map((column) => (
                            <td key={column} style={{ padding: "10px 12px", fontSize: "12px", color: "var(--text-primary)", borderBottom: "1px solid color-mix(in srgb, var(--border-default) 60%, transparent)" }}>{String(row.normalized_data?.[column] ?? "—")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : selectedJob?.status === "failed" ? (
                <div style={{ padding: "14px 12px", display: "grid", gap: "6px" }}>
                  <div style={{ fontSize: "12px", color: "#f87171", fontWeight: 600 }}>Import parsing failed</div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.6 }}>
                    {selectedJobError || "The uploaded file could not be parsed. Set the report type manually if the file structure is valid, or verify the workbook headers and format."}
                  </div>
                </div>
              ) : (
                <div style={{ padding: "14px 12px", fontSize: "12px", color: "var(--text-subtle)" }}>Select an import job to preview parsed records.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.15fr) minmax(0, 0.85fr)" }}>
        <div style={{ padding: "18px", borderRight: isMobile ? "none" : "1px solid var(--border-default)", borderBottom: isMobile ? "1px solid var(--border-default)" : "none", display: "grid", gap: "14px" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>Sync settings</div>
            <div style={{ fontSize: "13px", color: "var(--text-subtle)", marginTop: "4px", lineHeight: 1.6 }}>Configure a read-only direct database sync or a real-time 1C HTTP service. Credentials are stored encrypted at rest.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Connection type</label>
              <select value={connectionForm.connection_type} onChange={(event) => setConnectionForm((current) => ({ ...current, connection_type: event.target.value }))} style={inputStyle}>
                <option value="file">File bridge</option>
                <option value="database">Database direct sync</option>
                <option value="http_api">HTTP API</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Label</label>
              <input value={connectionForm.connection_label} onChange={(event) => setConnectionForm((current) => ({ ...current, connection_label: event.target.value }))} placeholder="Main accountant source" style={inputStyle} />
            </div>
          </div>

          {connectionForm.connection_type === "database" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Database type</label>
                  <select value={connectionForm.db_type} onChange={(event) => setConnectionForm((current) => ({ ...current, db_type: event.target.value }))} style={inputStyle}>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mssql">MS SQL Server</option>
                    <option value="file_1cd">1CD file mode</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Port</label>
                  <input value={connectionForm.db_port} onChange={(event) => setConnectionForm((current) => ({ ...current, db_port: event.target.value }))} placeholder="5432" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Host / path</label>
                  <input value={connectionForm.db_host} onChange={(event) => setConnectionForm((current) => ({ ...current, db_host: event.target.value }))} placeholder="db.internal.local or /path/to/base.1cd" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Database name</label>
                  <input value={connectionForm.db_name} onChange={(event) => setConnectionForm((current) => ({ ...current, db_name: event.target.value }))} placeholder="onec_prod" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Username</label>
                  <input value={connectionForm.db_username} onChange={(event) => setConnectionForm((current) => ({ ...current, db_username: event.target.value }))} placeholder={activeConnection?.masked_db_username || "readonly_user"} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Password</label>
                  <input type="password" value={connectionForm.db_password} onChange={(event) => setConnectionForm((current) => ({ ...current, db_password: event.target.value }))} placeholder="••••••••" style={inputStyle} />
                </div>
              </div>
            </>
          ) : null}

          {connectionForm.connection_type === "http_api" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>API base URL</label>
                  <input value={connectionForm.api_base_url} onChange={(event) => setConnectionForm((current) => ({ ...current, api_base_url: event.target.value }))} placeholder="https://1c.example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>API version</label>
                  <input value={connectionForm.api_version} onChange={(event) => setConnectionForm((current) => ({ ...current, api_version: event.target.value }))} placeholder="8.3" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>HTTP username</label>
                  <input value={connectionForm.api_username} onChange={(event) => setConnectionForm((current) => ({ ...current, api_username: event.target.value }))} placeholder={activeConnection?.masked_api_username || "benela_sync"} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>HTTP password</label>
                  <input type="password" value={connectionForm.api_password} onChange={(event) => setConnectionForm((current) => ({ ...current, api_password: event.target.value }))} placeholder="••••••••" style={inputStyle} />
                </div>
              </div>
            </>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Sync cadence</label>
              <select value={connectionForm.sync_interval_minutes} onChange={(event) => setConnectionForm((current) => ({ ...current, sync_interval_minutes: event.target.value }))} style={inputStyle}>
                <option value="60">Hourly</option>
                <option value="360">Every 6 hours</option>
                <option value="1440">Daily</option>
                <option value="10080">Manual only</option>
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-primary)", marginTop: "22px" }}>
              <input type="checkbox" checked={connectionForm.sync_enabled} onChange={(event) => setConnectionForm((current) => ({ ...current, sync_enabled: event.target.checked }))} /> Enable scheduled sync
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-primary)", marginTop: "22px" }}>
              <input type="checkbox" checked={connectionForm.is_active} onChange={(event) => setConnectionForm((current) => ({ ...current, is_active: event.target.checked }))} /> Keep connection active
            </label>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => void saveConnection()} style={primaryButtonStyle} disabled={savingConnection}>{activeConnection ? "Update connection" : "Create connection"}</button>
            {activeConnection ? <button type="button" onClick={() => void runConnectionTest()} style={buttonStyle}><Wifi size={14} /> Test connection</button> : null}
            {activeConnection ? <button type="button" onClick={() => void removeConnection()} style={{ ...buttonStyle, color: "#f87171" }}>Disconnect</button> : null}
          </div>
        </div>

        <div style={{ padding: "18px", display: "grid", gap: "12px" }}>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>Connection status</div>
          <div style={{ border: "1px solid var(--border-default)", borderRadius: "14px", padding: "14px", display: "grid", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "color-mix(in srgb, var(--accent) 14%, transparent)", display: "grid", placeItems: "center" }}>
                {activeConnection?.connection_type === "database" ? <Database size={18} color="var(--accent)" /> : activeConnection?.connection_type === "http_api" ? <Link2 size={18} color="var(--accent)" /> : <UploadCloud size={18} color="var(--accent)" />}
              </div>
              <div>
                <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{activeConnection?.connection_label || (activeConnection ? "1C connection" : "File bridge only")}</div>
                <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{activeConnection ? `${activeConnection.connection_type} · last sync ${activeConnection.last_sync_at ? formatDate(activeConnection.last_sync_at) : "never"}` : "No direct sync configured yet."}</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: overview?.has_active_connection ? "#34d399" : "var(--text-subtle)" }}>{overview?.has_active_connection ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {overview?.has_active_connection ? "Active direct connection configured" : "Manual file import is active"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: overview?.anomaly_count ? "#fbbf24" : "var(--text-subtle)" }}>{overview?.anomaly_count ? <AlertTriangle size={14} color="#fbbf24" /> : <CheckCircle2 size={14} color="#34d399" />} {overview?.anomaly_count ? `${overview.anomaly_count} anomalies need review` : "No current anomalies"}</div>
            </div>
          </div>
          <div style={{ border: "1px solid var(--border-default)", borderRadius: "14px", padding: "14px" }}>
            <div style={labelStyle}>Best current route</div>
            <div style={{ fontSize: "13px", color: "var(--text-subtle)", lineHeight: 1.6 }}>
              Start with file uploads for first import and mapping validation. Move to database or HTTP sync once your accountant confirms the normalized preview is correct.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
