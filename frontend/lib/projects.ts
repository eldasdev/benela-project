/**
 * Projects / Kanban API client — typed helpers for every backend endpoint.
 */

import { authFetch } from "@/lib/auth-fetch";

const API =
  typeof window !== "undefined"
    ? "/api"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const P = `${API}/projects`;

// ── Types ────────────────────────────────────────────

export type ProjectStatus = "active" | "archived" | "completed";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface ProjectsSummary {
  total_projects: number;
  active_projects: number;
  total_tasks: number;
  done_tasks: number;
  overdue_tasks: number;
}

export interface Project {
  id: number;
  client_org_id: number | null;
  owner_user_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  color: string;
  due_date: string | null;
  created_at: string;
  updated_at: string | null;
  task_count: number;
  done_count: number;
  is_owner: boolean;
}

export interface Column {
  id: number;
  project_id: number;
  name: string;
  color: string;
  position: number;
}

export interface Label {
  id: number;
  project_id: number;
  name: string;
  color: string;
}

export interface EmployeeMini {
  id: number;
  full_name: string;
  email: string | null;
  role: string | null;
  department: string | null;
}

export interface Task {
  id: number;
  column_id: number;
  project_id: number;
  title: string;
  description: string | null;
  priority: TaskPriority;
  due_date: string | null;
  start_date: string | null;
  completed_at: string | null;
  cover_color: string | null;
  employee_id: number | null;
  position: number;
  created_at: string;
  updated_at: string | null;
  labels: Label[];
  assignee: EmployeeMini | null;
  checklist_total: number;
  checklist_done: number;
  comment_count: number;
  attachment_count: number;
}

export interface ChecklistItem {
  id: number;
  task_id: number;
  text: string;
  done: boolean;
  position: number;
  created_at: string;
}

export interface Comment {
  id: number;
  task_id: number;
  author_user_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  updated_at: string | null;
}

export interface Attachment {
  id: number;
  task_id: number;
  uploaded_by_user_id: string | null;
  uploaded_by_name: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  created_at: string;
}

export interface Activity {
  id: number;
  project_id: number;
  task_id: number | null;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

// ── Generic helpers ──────────────────────────────────

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function post(url: string, body?: unknown) {
  return authFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

function put(url: string, body?: unknown) {
  return authFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

function patch(url: string, body?: unknown) {
  return authFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

function del(url: string) {
  return authFetch(url, { method: "DELETE" });
}

// ── Projects ─────────────────────────────────────────

export async function fetchProjectsSummary(): Promise<ProjectsSummary> {
  return json(await authFetch(`${P}/summary`));
}

export async function fetchProjects(): Promise<Project[]> {
  return json(await authFetch(P));
}

export async function fetchProject(id: number): Promise<Project> {
  return json(await authFetch(`${P}/${id}`));
}

export async function createProject(data: {
  name: string;
  description?: string;
  color?: string;
  due_date?: string | null;
  status?: ProjectStatus;
}): Promise<Project> {
  return json(await post(P, data));
}

export async function updateProject(
  id: number,
  data: {
    name?: string;
    description?: string;
    color?: string;
    status?: ProjectStatus;
    due_date?: string | null;
  },
): Promise<Project> {
  return json(await put(`${P}/${id}`, data));
}

export async function deleteProject(id: number): Promise<void> {
  await del(`${P}/${id}`);
}

// ── Members (HR feed) ────────────────────────────────

export async function fetchMembers(): Promise<EmployeeMini[]> {
  return json(await authFetch(`${P}/members`));
}

// ── Columns ──────────────────────────────────────────

export async function fetchColumns(projectId: number): Promise<Column[]> {
  return json(await authFetch(`${P}/${projectId}/columns`));
}

export async function createColumn(
  projectId: number,
  data: { name: string; color?: string },
): Promise<Column> {
  return json(await post(`${P}/${projectId}/columns`, data));
}

export async function updateColumn(
  columnId: number,
  data: { name?: string; color?: string },
): Promise<Column> {
  return json(await put(`${P}/columns/${columnId}`, data));
}

export async function deleteColumn(columnId: number): Promise<void> {
  await del(`${P}/columns/${columnId}`);
}

export async function reorderColumns(
  projectId: number,
  orderedIds: number[],
): Promise<void> {
  await patch(`${P}/${projectId}/columns/reorder`, { ordered_ids: orderedIds });
}

// ── Tasks ────────────────────────────────────────────

export async function fetchTasks(projectId: number): Promise<Task[]> {
  return json(await authFetch(`${P}/${projectId}/tasks`));
}

export async function fetchTask(taskId: number): Promise<Task> {
  return json(await authFetch(`${P}/tasks/${taskId}`));
}

export async function createTask(
  projectId: number,
  data: {
    column_id: number;
    title: string;
    description?: string;
    priority?: TaskPriority;
    due_date?: string | null;
    start_date?: string | null;
    employee_id?: number | null;
    cover_color?: string | null;
  },
): Promise<Task> {
  return json(await post(`${P}/${projectId}/tasks`, data));
}

export async function updateTask(
  taskId: number,
  data: {
    title?: string;
    description?: string;
    priority?: TaskPriority;
    due_date?: string | null;
    start_date?: string | null;
    employee_id?: number | null;
    cover_color?: string | null;
  },
): Promise<Task> {
  return json(await patch(`${P}/tasks/${taskId}`, data));
}

export async function deleteTask(taskId: number): Promise<void> {
  await del(`${P}/tasks/${taskId}`);
}

export async function moveTask(
  taskId: number,
  columnId: number,
  position: number,
): Promise<Task> {
  return json(
    await patch(`${P}/tasks/${taskId}/move`, {
      column_id: columnId,
      position,
    }),
  );
}

export async function reorderTasksInColumn(
  columnId: number,
  orderedIds: number[],
): Promise<void> {
  await patch(`${P}/columns/${columnId}/tasks/reorder`, {
    ordered_ids: orderedIds,
  });
}

export async function toggleTaskComplete(taskId: number): Promise<Task> {
  return json(await patch(`${P}/tasks/${taskId}/complete`));
}

// ── Labels ───────────────────────────────────────────

export async function fetchLabels(projectId: number): Promise<Label[]> {
  return json(await authFetch(`${P}/${projectId}/labels`));
}

export async function createLabel(
  projectId: number,
  data: { name: string; color: string },
): Promise<Label> {
  return json(await post(`${P}/${projectId}/labels`, data));
}

export async function updateLabel(
  labelId: number,
  data: { name?: string; color?: string },
): Promise<Label> {
  return json(await patch(`${P}/labels/${labelId}`, data));
}

export async function deleteLabel(labelId: number): Promise<void> {
  await del(`${P}/labels/${labelId}`);
}

export async function attachLabel(
  taskId: number,
  labelId: number,
): Promise<void> {
  await post(`${P}/tasks/${taskId}/labels/${labelId}`);
}

export async function detachLabel(
  taskId: number,
  labelId: number,
): Promise<void> {
  await del(`${P}/tasks/${taskId}/labels/${labelId}`);
}

// ── Checklist ────────────────────────────────────────

export async function fetchChecklist(
  taskId: number,
): Promise<ChecklistItem[]> {
  return json(await authFetch(`${P}/tasks/${taskId}/checklist`));
}

export async function createChecklistItem(
  taskId: number,
  text: string,
): Promise<ChecklistItem> {
  return json(await post(`${P}/tasks/${taskId}/checklist`, { text }));
}

export async function updateChecklistItem(
  itemId: number,
  data: { text?: string; done?: boolean; position?: number },
): Promise<ChecklistItem> {
  return json(await patch(`${P}/checklist/${itemId}`, data));
}

export async function deleteChecklistItem(itemId: number): Promise<void> {
  await del(`${P}/checklist/${itemId}`);
}

// ── Comments ─────────────────────────────────────────

export async function fetchComments(taskId: number): Promise<Comment[]> {
  return json(await authFetch(`${P}/tasks/${taskId}/comments`));
}

export async function createComment(
  taskId: number,
  body: string,
): Promise<Comment> {
  return json(await post(`${P}/tasks/${taskId}/comments`, { body }));
}

export async function updateComment(
  commentId: number,
  body: string,
): Promise<Comment> {
  return json(await patch(`${P}/comments/${commentId}`, { body }));
}

export async function deleteComment(commentId: number): Promise<void> {
  await del(`${P}/comments/${commentId}`);
}

// ── Attachments ──────────────────────────────────────

export async function fetchAttachments(
  taskId: number,
): Promise<Attachment[]> {
  return json(await authFetch(`${P}/tasks/${taskId}/attachments`));
}

interface UploadUrlResponse {
  signed_url: string;
  token: string | null;
  path: string;
  expires_in: number;
}

export async function requestUploadUrl(
  taskId: number,
  fileName: string,
  mimeType?: string,
): Promise<UploadUrlResponse> {
  return json(
    await post(`${P}/tasks/${taskId}/attachments/upload-url`, {
      file_name: fileName,
      mime_type: mimeType || null,
    }),
  );
}

export async function registerAttachment(
  taskId: number,
  data: {
    file_name: string;
    mime_type?: string;
    size_bytes?: number;
    storage_path: string;
  },
): Promise<Attachment> {
  return json(await post(`${P}/tasks/${taskId}/attachments`, data));
}

/**
 * Full upload flow: get signed URL → PUT file → register metadata.
 */
export async function uploadAttachment(
  taskId: number,
  file: File,
): Promise<Attachment> {
  // 1. Request a signed upload URL
  const { signed_url, path } = await requestUploadUrl(
    taskId,
    file.name,
    file.type || undefined,
  );

  // 2. Upload directly to Supabase Storage
  const uploadRes = await fetch(signed_url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!uploadRes.ok) {
    throw new Error(`Upload failed: HTTP ${uploadRes.status}`);
  }

  // 3. Register the attachment in our backend
  return registerAttachment(taskId, {
    file_name: file.name,
    mime_type: file.type || undefined,
    size_bytes: file.size,
    storage_path: path,
  });
}

export async function getDownloadUrl(
  attachmentId: number,
): Promise<{ url: string; expires_in: number }> {
  return json(
    await authFetch(`${P}/attachments/${attachmentId}/download-url`),
  );
}

export async function deleteAttachment(attachmentId: number): Promise<void> {
  await del(`${P}/attachments/${attachmentId}`);
}

// ── Activity ─────────────────────────────────────────

export async function fetchProjectActivity(
  projectId: number,
  limit = 100,
): Promise<Activity[]> {
  return json(
    await authFetch(`${P}/${projectId}/activity?limit=${limit}`),
  );
}

export async function fetchTaskActivity(
  taskId: number,
  limit = 100,
): Promise<Activity[]> {
  return json(
    await authFetch(`${P}/tasks/${taskId}/activity?limit=${limit}`),
  );
}
