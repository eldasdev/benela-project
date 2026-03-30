import { authFetch } from "@/lib/auth-fetch";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

export type OneCJob = {
  id: number;
  company_id: number;
  connection_id?: number | null;
  filename: string;
  mime_type?: string | null;
  file_size_bytes: number;
  report_type: string;
  status: string;
  records_parsed: number;
  records_imported: number;
  records_skipped: number;
  records_failed: number;
  anomaly_count: number;
  error_message?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  imported_by: string;
  created_at: string;
  completed_at?: string | null;
  confirmed_at?: string | null;
};

export type OneCRecord = {
  id: number;
  import_job_id: number;
  company_id: number;
  record_type: string;
  raw_data: Record<string, unknown>;
  normalized_data: Record<string, unknown>;
  benela_record_id?: number | null;
  benela_table?: string | null;
  import_hash: string;
  row_status: string;
  error_message?: string | null;
  created_at: string;
};

export type OneCConnection = {
  id: number;
  company_id: number;
  connection_type: "file" | "database" | "http_api";
  connection_label?: string | null;
  db_port?: number | null;
  db_name?: string | null;
  db_type?: string | null;
  api_base_url?: string | null;
  api_version?: string | null;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  last_sync_at?: string | null;
  last_sync_status?: string | null;
  last_sync_message?: string | null;
  is_active: boolean;
  masked_db_host?: string | null;
  masked_db_username?: string | null;
  masked_api_username?: string | null;
  created_at: string;
  updated_at: string;
};

export type OneCOverview = {
  company_id: number;
  has_data: boolean;
  has_active_connection: boolean;
  connection_type?: string | null;
  connection_label?: string | null;
  last_sync_at?: string | null;
  last_sync_status?: string | null;
  latest_job?: OneCJob | null;
  total_jobs: number;
  total_records: number;
  imported_records: number;
  ready_records: number;
  duplicate_records: number;
  failed_records: number;
  anomaly_count: number;
  coverage_period_start?: string | null;
  coverage_period_end?: string | null;
  anomalies: string[];
};

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const payload = await res.json();
    const detail = payload?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  } catch {
    // ignore
  }
  return fallback;
}

export async function fetchOneCOverview(): Promise<OneCOverview> {
  const res = await authFetch(`${API}/onec/overview`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load 1C overview."));
  return res.json();
}

export async function listOneCJobs(): Promise<OneCJob[]> {
  const res = await authFetch(`${API}/onec/import/jobs?limit=100`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load 1C import jobs."));
  return res.json();
}

export async function getOneCJob(jobId: number): Promise<OneCJob> {
  const res = await authFetch(`${API}/onec/import/jobs/${jobId}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load 1C import job."));
  return res.json();
}

export async function listOneCRecords(jobId: number, status?: string): Promise<{ page: number; per_page: number; total: number; items: OneCRecord[] }> {
  const query = new URLSearchParams({ page: "1", per_page: "20" });
  if (status) query.set("status", status);
  const res = await authFetch(`${API}/onec/import/jobs/${jobId}/records?${query.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load 1C preview records."));
  return res.json();
}

export async function uploadOneCFile(file: File, reportTypeHint?: string): Promise<{ status: string; job_id: number; message: string }> {
  const form = new FormData();
  form.append("file", file);
  const query = new URLSearchParams();
  if (reportTypeHint) query.set("report_type_hint", reportTypeHint);
  const url = `${API}/onec/import/upload${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await authFetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(await parseError(res, "Could not upload 1C file."));
  return res.json();
}

export async function confirmOneCJob(jobId: number): Promise<{ imported: number; skipped: number; failed: number; message: string }> {
  const res = await authFetch(`${API}/onec/import/jobs/${jobId}/confirm`, { method: "POST" });
  if (!res.ok) throw new Error(await parseError(res, "Could not confirm 1C import."));
  return res.json();
}

export async function deleteOneCJob(jobId: number): Promise<void> {
  const res = await authFetch(`${API}/onec/import/jobs/${jobId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res, "Could not remove 1C import job."));
}

export async function listOneCConnections(): Promise<OneCConnection[]> {
  const res = await authFetch(`${API}/onec/connections`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load 1C connections."));
  return res.json();
}

export async function saveOneCConnection(payload: Record<string, unknown>, connectionId?: number): Promise<OneCConnection> {
  const res = await authFetch(`${API}/onec/connections${connectionId ? `/${connectionId}` : ""}`, {
    method: connectionId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not save 1C connection."));
  return res.json();
}

export async function testOneCConnection(connectionId: number): Promise<{ status: string; reachable: boolean; read_only?: boolean | null; detail: string; metadata: Record<string, unknown> }> {
  const res = await authFetch(`${API}/onec/connections/${connectionId}/test`, { method: "POST" });
  if (!res.ok) throw new Error(await parseError(res, "Could not test 1C connection."));
  return res.json();
}

export async function syncOneCConnection(connectionId: number): Promise<{ status: string; message: string }> {
  const res = await authFetch(`${API}/onec/connections/${connectionId}/sync`, { method: "POST" });
  if (!res.ok) throw new Error(await parseError(res, "Could not start 1C sync."));
  return res.json();
}

export async function deleteOneCConnection(connectionId: number): Promise<void> {
  const res = await authFetch(`${API}/onec/connections/${connectionId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res, "Could not delete 1C connection."));
}

export async function downloadOneCTemplate(reportType: string, format: "xlsx" | "csv" = "xlsx"): Promise<void> {
  const res = await authFetch(`${API}/onec/import/template/${encodeURIComponent(reportType)}?format=${format}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not download 1C template."));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `onec-${reportType}-template.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
