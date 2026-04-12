"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
} from "react";
import {
  type Task,
  type Label,
  type EmployeeMini,
  type TaskPriority,
  type ChecklistItem,
  type Comment,
  type Attachment,
  type Activity,
  updateTask,
  deleteTask,
  toggleTaskComplete,
  fetchChecklist,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  fetchComments,
  createComment,
  deleteComment,
  fetchAttachments,
  uploadAttachment,
  getDownloadUrl,
  deleteAttachment,
  fetchTaskActivity,
  attachLabel,
  detachLabel,
} from "@/lib/projects";

// ── Helpers ─────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    "task.created": "created this task",
    "task.updated": "updated this task",
    "task.moved": "moved this task",
    "task.completed": "completed this task",
    "task.reopened": "reopened this task",
    "task.deleted": "deleted a task",
    "comment.added": "added a comment",
    "comment.deleted": "deleted a comment",
    "checklist.added": "added a checklist item",
    "checklist.toggled": "toggled a checklist item",
    "checklist.deleted": "deleted a checklist item",
    "attachment.added": "added an attachment",
    "attachment.deleted": "deleted an attachment",
    "label.attached": "added a label",
    "label.detached": "removed a label",
    "assignee.changed": "changed the assignee",
    "priority.changed": "changed the priority",
    "due_date.changed": "changed the due date",
  };
  return map[action] || action.replace(/[._]/g, " ");
}

function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Constants ───────────────────────────────────────────

const COVER_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "#6b7280",
  medium: "#3b82f6",
  high: "#f97316",
  urgent: "#ef4444",
};

type TabKey = "details" | "comments" | "activity";

// ── Props ───────────────────────────────────────────────

interface TaskDetailDrawerProps {
  task: Task;
  members: EmployeeMini[];
  projectLabels: Label[];
  onClose: () => void;
  onTaskUpdated: (task: Task) => void;
  onTaskDeleted: (taskId: number) => void;
}

// ── Component ───────────────────────────────────────────

export default function TaskDetailDrawer({
  task,
  members,
  projectLabels,
  onClose,
  onTaskUpdated,
  onTaskDeleted,
}: TaskDetailDrawerProps) {
  // -- State --
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("details");

  // Title editing
  const [title, setTitle] = useState(task.title);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Description editing
  const [description, setDescription] = useState(task.description || "");

  // Priority
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);

  // Assignee
  const [assigneeId, setAssigneeId] = useState<number | null>(task.employee_id);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);

  // Due date
  const [dueDate, setDueDate] = useState(task.due_date || "");

  // Cover color
  const [coverColor, setCoverColor] = useState<string | null>(task.cover_color);

  // Labels
  const [taskLabels, setTaskLabels] = useState<Label[]>(task.labels);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);

  // Checklist
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [checklistLoading, setChecklistLoading] = useState(false);

  // Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Activity
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Completed
  const [completed, setCompleted] = useState(!!task.completed_at);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false);

  // -- Animate in --
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // -- Escape key --
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Load data on mount --
  useEffect(() => {
    loadChecklist();
    loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  useEffect(() => {
    if (activeTab === "comments") loadComments();
    if (activeTab === "activity") loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, task.id]);

  // -- Data loaders --
  const loadChecklist = useCallback(async () => {
    setChecklistLoading(true);
    try {
      const items = await fetchChecklist(task.id);
      setChecklist(items);
    } catch {
      /* silent */
    } finally {
      setChecklistLoading(false);
    }
  }, [task.id]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const data = await fetchComments(task.id);
      setComments(data);
    } catch {
      /* silent */
    } finally {
      setCommentsLoading(false);
    }
  }, [task.id]);

  const loadAttachments = useCallback(async () => {
    setAttachmentsLoading(true);
    try {
      const data = await fetchAttachments(task.id);
      setAttachments(data);
    } catch {
      /* silent */
    } finally {
      setAttachmentsLoading(false);
    }
  }, [task.id]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const data = await fetchTaskActivity(task.id);
      setActivities(data);
    } catch {
      /* silent */
    } finally {
      setActivityLoading(false);
    }
  }, [task.id]);

  // -- Close with animation --
  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  // -- Save helpers --
  async function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === task.title) {
      setTitle(task.title);
      return;
    }
    try {
      const updated = await updateTask(task.id, { title: trimmed });
      onTaskUpdated(updated);
    } catch {
      setTitle(task.title);
    }
  }

  async function saveDescription() {
    const trimmed = description.trim();
    if (trimmed === (task.description || "")) return;
    try {
      const updated = await updateTask(task.id, { description: trimmed || undefined });
      onTaskUpdated(updated);
    } catch {
      setDescription(task.description || "");
    }
  }

  async function savePriority(p: TaskPriority) {
    setPriority(p);
    setShowPriorityDropdown(false);
    try {
      const updated = await updateTask(task.id, { priority: p });
      onTaskUpdated(updated);
    } catch {
      setPriority(task.priority);
    }
  }

  async function saveAssignee(empId: number | null) {
    setAssigneeId(empId);
    setShowAssigneeDropdown(false);
    try {
      const updated = await updateTask(task.id, { employee_id: empId });
      onTaskUpdated(updated);
    } catch {
      setAssigneeId(task.employee_id);
    }
  }

  async function saveDueDate(val: string) {
    setDueDate(val);
    try {
      const updated = await updateTask(task.id, {
        due_date: val ? new Date(val).toISOString() : null,
      });
      onTaskUpdated(updated);
    } catch {
      setDueDate(task.due_date || "");
    }
  }

  async function saveCoverColor(color: string | null) {
    setCoverColor(color);
    try {
      const updated = await updateTask(task.id, { cover_color: color });
      onTaskUpdated(updated);
    } catch {
      setCoverColor(task.cover_color);
    }
  }

  async function handleToggleComplete() {
    try {
      const updated = await toggleTaskComplete(task.id);
      setCompleted(!!updated.completed_at);
      onTaskUpdated(updated);
    } catch {
      /* silent */
    }
  }

  async function handleDelete() {
    try {
      await deleteTask(task.id);
      onTaskDeleted(task.id);
      handleClose();
    } catch {
      /* silent */
    }
  }

  // -- Label toggle --
  async function toggleLabel(label: Label) {
    const has = taskLabels.some((l) => l.id === label.id);
    if (has) {
      setTaskLabels((prev) => prev.filter((l) => l.id !== label.id));
      try {
        await detachLabel(task.id, label.id);
      } catch {
        setTaskLabels((prev) => [...prev, label]);
      }
    } else {
      setTaskLabels((prev) => [...prev, label]);
      try {
        await attachLabel(task.id, label.id);
      } catch {
        setTaskLabels((prev) => prev.filter((l) => l.id !== label.id));
      }
    }
  }

  // -- Checklist --
  async function addChecklistItem() {
    const text = newChecklistText.trim();
    if (!text) return;
    setNewChecklistText("");
    try {
      const item = await createChecklistItem(task.id, text);
      setChecklist((prev) => [...prev, item]);
    } catch {
      /* silent */
    }
  }

  async function toggleChecklistItem(item: ChecklistItem) {
    setChecklist((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
    );
    try {
      await updateChecklistItem(item.id, { done: !item.done });
    } catch {
      setChecklist((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, done: item.done } : i)),
      );
    }
  }

  async function removeChecklistItem(itemId: number) {
    const prev = checklist;
    setChecklist((c) => c.filter((i) => i.id !== itemId));
    try {
      await deleteChecklistItem(itemId);
    } catch {
      setChecklist(prev);
    }
  }

  // -- Comments --
  async function sendComment() {
    const body = commentBody.trim();
    if (!body) return;
    setCommentBody("");
    try {
      const c = await createComment(task.id, body);
      setComments((prev) => [...prev, c]);
    } catch {
      setCommentBody(body);
    }
  }

  async function removeComment(commentId: number) {
    const prev = comments;
    setComments((c) => c.filter((i) => i.id !== commentId));
    try {
      await deleteComment(commentId);
    } catch {
      setComments(prev);
    }
  }

  // -- Attachments --
  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const att = await uploadAttachment(task.id, file);
        setAttachments((prev) => [...prev, att]);
      }
    } catch {
      /* silent */
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(attId: number) {
    try {
      const { url } = await getDownloadUrl(attId);
      window.open(url, "_blank");
    } catch {
      /* silent */
    }
  }

  async function removeAttachment(attId: number) {
    const prev = attachments;
    setAttachments((a) => a.filter((i) => i.id !== attId));
    try {
      await deleteAttachment(attId);
    } catch {
      setAttachments(prev);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  }

  // -- Styles --
  const backdropStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    backgroundColor: "var(--overlay-backdrop)",
    transition: "opacity 250ms ease",
    opacity: visible ? 1 : 0,
  };

  const drawerStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: 480,
    maxWidth: "100vw",
    zIndex: 1001,
    backgroundColor: "var(--bg-surface)",
    borderLeft: "1px solid var(--border-soft)",
    boxShadow: "var(--drawer-shadow)",
    transform: visible ? "translateX(0)" : "translateX(100%)",
    transition: "transform 250ms cubic-bezier(0.32, 0.72, 0, 1)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  const scrollAreaStyle: CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "0 24px 24px",
  };

  const sectionStyle: CSSProperties = {
    marginBottom: 20,
  };

  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--text-subtle)",
    marginBottom: 8,
  };

  const btnSmall: CSSProperties = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-soft)",
    backgroundColor: "var(--bg-elevated)",
    color: "var(--text-primary)",
    cursor: "pointer",
  };

  const inputBase: CSSProperties = {
    width: "100%",
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--border-soft)",
    backgroundColor: "var(--bg-elevated)",
    color: "var(--text-primary)",
    outline: "none",
    fontFamily: "inherit",
  };

  const dropdownStyle: CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    minWidth: 200,
    maxHeight: 240,
    overflowY: "auto",
    backgroundColor: "var(--bg-elevated)",
    border: "1.5px solid var(--accent)",
    borderRadius: 10,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px var(--border-soft)",
    zIndex: 50,
    padding: 4,
  };

  const dropdownItemStyle: CSSProperties = {
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-primary)",
    borderRadius: 6,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderBottom: "1px solid var(--border-default)",
  };

  // -- Checklist progress --
  const checkDone = checklist.filter((i) => i.done).length;
  const checkTotal = checklist.length;
  const checkPct = checkTotal > 0 ? Math.round((checkDone / checkTotal) * 100) : 0;

  // -- Render --
  return (
    <>
      {/* Backdrop */}
      <div style={backdropStyle} onClick={handleClose} />

      {/* Drawer */}
      <div style={drawerStyle}>
        {/* ── Header area ─────────────────────────────── */}
        {coverColor && (
          <div
            style={{
              height: 6,
              backgroundColor: coverColor,
              flexShrink: 0,
            }}
          />
        )}

        <div
          style={{
            padding: "16px 24px 0",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            flexShrink: 0,
          }}
        >
          {/* Top row: complete toggle, close */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={handleToggleComplete}
              title={completed ? "Reopen task" : "Complete task"}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: completed
                  ? "2px solid var(--success)"
                  : "2px solid var(--border-soft)",
                backgroundColor: completed
                  ? "var(--success-soft-bg)"
                  : "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: completed ? "var(--success)" : "var(--text-subtle)",
                fontSize: 14,
              }}
            >
              {completed ? "\u2713" : ""}
            </button>

            <div style={{ flex: 1 }} />

            {/* Delete button */}
            {confirmDelete ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--danger)" }}>Delete?</span>
                <button
                  onClick={handleDelete}
                  style={{
                    ...btnSmall,
                    backgroundColor: "var(--danger-soft-bg)",
                    borderColor: "var(--danger-soft-border)",
                    color: "var(--danger)",
                  }}
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={btnSmall}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete task"
                style={{
                  ...btnSmall,
                  color: "var(--text-subtle)",
                  border: "none",
                  backgroundColor: "transparent",
                  fontSize: 16,
                  padding: "4px 6px",
                }}
              >
                &#128465;
              </button>
            )}

            <button
              onClick={handleClose}
              title="Close"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: "none",
                backgroundColor: "transparent",
                color: "var(--text-subtle)",
                cursor: "pointer",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              &times;
            </button>
          </div>

          {/* Title */}
          <textarea
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                titleRef.current?.blur();
              }
            }}
            rows={1}
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              lineHeight: 1.3,
              fontFamily: "inherit",
              width: "100%",
              overflow: "hidden",
            }}
          />

          {/* Priority + Cover row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* Priority dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowPriorityDropdown((v) => !v)}
                style={{
                  ...btnSmall,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: PRIORITY_COLORS[priority],
                    flexShrink: 0,
                  }}
                />
                <span style={{ textTransform: "capitalize" }}>{priority}</span>
              </button>
              {showPriorityDropdown && (
                <div style={dropdownStyle}>
                  {PRIORITIES.map((p) => (
                    <div
                      key={p}
                      onClick={() => savePriority(p)}
                      style={{
                        ...dropdownItemStyle,
                        backgroundColor:
                          p === priority ? "var(--accent-soft)" : "transparent",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          "var(--accent-soft)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          p === priority ? "var(--accent-soft)" : "transparent")
                      }
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: PRIORITY_COLORS[p],
                        }}
                      />
                      <span style={{ textTransform: "capitalize" }}>{p}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cover color swatches */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-subtle)", marginRight: 4 }}>
                Cover:
              </span>
              {COVER_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => saveCoverColor(c === coverColor ? null : c)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    backgroundColor: c,
                    border:
                      c === coverColor
                        ? "2px solid var(--text-primary)"
                        : "2px solid transparent",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
              {coverColor && (
                <button
                  onClick={() => saveCoverColor(null)}
                  style={{
                    ...btnSmall,
                    fontSize: 10,
                    padding: "2px 6px",
                    marginLeft: 2,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: 0,
              borderBottom: "1px solid var(--border-soft)",
              marginTop: 4,
            }}
          >
            {(["details", "comments", "activity"] as TabKey[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 13,
                  fontWeight: 500,
                  color:
                    activeTab === tab
                      ? "var(--accent)"
                      : "var(--text-subtle)",
                  backgroundColor: "transparent",
                  border: "none",
                  borderBottom:
                    activeTab === tab
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                  cursor: "pointer",
                  textTransform: "capitalize",
                  fontFamily: "inherit",
                  transition: "color 150ms, border-color 150ms",
                }}
              >
                {tab}
                {tab === "comments" && task.comment_count > 0 && (
                  <span
                    style={{
                      marginLeft: 4,
                      fontSize: 11,
                      color: "var(--text-subtle)",
                    }}
                  >
                    ({task.comment_count})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable content ──────────────────────── */}
        <div style={scrollAreaStyle}>
          {/* ── Details Tab ─────────────────────── */}
          {activeTab === "details" && (
            <div style={{ paddingTop: 16 }}>
              {/* Description */}
              <div style={sectionStyle}>
                <div style={labelStyle}>Description</div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={saveDescription}
                  placeholder="Add a description..."
                  rows={4}
                  style={{
                    ...inputBase,
                    resize: "vertical",
                    minHeight: 72,
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Assignee */}
              <div style={{ ...sectionStyle, position: "relative" }}>
                <div style={labelStyle}>Assignee</div>
                <button
                  onClick={() => setShowAssigneeDropdown((v) => !v)}
                  style={{
                    ...inputBase,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                  }}
                >
                  {assigneeId ? (
                    <>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          backgroundColor: "var(--accent)",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {initials(
                          members.find((m) => m.id === assigneeId)?.full_name,
                        )}
                      </span>
                      <span>
                        {members.find((m) => m.id === assigneeId)?.full_name ||
                          "Unknown"}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--text-subtle)" }}>
                      Unassigned
                    </span>
                  )}
                </button>
                {showAssigneeDropdown && (
                  <div style={dropdownStyle}>
                    <div
                      onClick={() => saveAssignee(null)}
                      style={{
                        ...dropdownItemStyle,
                        color: "var(--text-subtle)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          "var(--accent-soft)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                    >
                      Unassigned
                    </div>
                    {members.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => saveAssignee(m.id)}
                        style={{
                          ...dropdownItemStyle,
                          backgroundColor:
                            m.id === assigneeId
                              ? "var(--accent-soft)"
                              : "transparent",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "var(--accent-soft)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            m.id === assigneeId
                              ? "var(--accent-soft)"
                              : "transparent")
                        }
                      >
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            backgroundColor: "var(--accent)",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {initials(m.full_name)}
                        </span>
                        <span>{m.full_name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Due date */}
              <div style={sectionStyle}>
                <div style={labelStyle}>Due Date</div>
                <input
                  type="datetime-local"
                  value={toLocalDatetime(dueDate)}
                  onChange={(e) => saveDueDate(e.target.value)}
                  style={{
                    ...inputBase,
                    colorScheme: "dark",
                  }}
                />
              </div>

              {/* Labels */}
              <div style={{ ...sectionStyle, position: "relative" }}>
                <div style={labelStyle}>Labels</div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  {taskLabels.map((l) => (
                    <span
                      key={l.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 10px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#fff",
                        backgroundColor: l.color,
                      }}
                    >
                      {l.name}
                    </span>
                  ))}
                  <button
                    onClick={() => setShowLabelDropdown((v) => !v)}
                    style={{
                      ...btnSmall,
                      fontSize: 11,
                      padding: "3px 8px",
                    }}
                  >
                    + Label
                  </button>
                </div>
                {showLabelDropdown && (
                  <div style={{ ...dropdownStyle, marginTop: 8, position: "relative" }}>
                    {projectLabels.length === 0 && (
                      <div
                        style={{
                          padding: "12px",
                          fontSize: 12,
                          color: "var(--text-subtle)",
                        }}
                      >
                        No labels in project
                      </div>
                    )}
                    {projectLabels.map((l) => {
                      const attached = taskLabels.some((tl) => tl.id === l.id);
                      return (
                        <div
                          key={l.id}
                          onClick={() => toggleLabel(l)}
                          style={{
                            ...dropdownItemStyle,
                            backgroundColor: attached
                              ? "var(--accent-soft)"
                              : "transparent",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor =
                              "var(--accent-soft)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor = attached
                              ? "var(--accent-soft)"
                              : "transparent")
                          }
                        >
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 3,
                              backgroundColor: l.color,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ flex: 1 }}>{l.name}</span>
                          {attached && (
                            <span style={{ color: "var(--accent)", fontSize: 14 }}>
                              &#10003;
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Checklist */}
              <div style={sectionStyle}>
                <div
                  style={{
                    ...labelStyle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>
                    Checklist{" "}
                    {checkTotal > 0 && (
                      <span style={{ fontWeight: 400 }}>
                        ({checkDone}/{checkTotal})
                      </span>
                    )}
                  </span>
                  {checkTotal > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 400 }}>
                      {checkPct}%
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {checkTotal > 0 && (
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: "var(--border-soft)",
                      marginBottom: 10,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${checkPct}%`,
                        backgroundColor:
                          checkPct === 100 ? "var(--success)" : "var(--accent)",
                        borderRadius: 2,
                        transition: "width 200ms ease",
                      }}
                    />
                  </div>
                )}

                {checklistLoading && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-subtle)",
                      padding: "8px 0",
                    }}
                  >
                    Loading...
                  </div>
                )}

                {checklist.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                      borderBottom: "1px solid var(--border-soft)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleChecklistItem(item)}
                      style={{
                        width: 16,
                        height: 16,
                        accentColor: "var(--accent)",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: item.done
                          ? "var(--text-subtle)"
                          : "var(--text-primary)",
                        textDecoration: item.done ? "line-through" : "none",
                      }}
                    >
                      {item.text}
                    </span>
                    <button
                      onClick={() => removeChecklistItem(item.id)}
                      style={{
                        border: "none",
                        background: "none",
                        color: "var(--text-subtle)",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: "2px 4px",
                        borderRadius: 4,
                        lineHeight: 1,
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}

                {/* Add checklist item */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <input
                    type="text"
                    value={newChecklistText}
                    onChange={(e) => setNewChecklistText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addChecklistItem();
                      }
                    }}
                    placeholder="Add item..."
                    style={{
                      ...inputBase,
                      flex: 1,
                    }}
                  />
                  <button
                    onClick={addChecklistItem}
                    disabled={!newChecklistText.trim()}
                    style={{
                      ...btnSmall,
                      opacity: newChecklistText.trim() ? 1 : 0.4,
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Attachments */}
              <div style={sectionStyle}>
                <div style={labelStyle}>
                  Attachments
                  {attachments.length > 0 && (
                    <span style={{ fontWeight: 400 }}>
                      {" "}
                      ({attachments.length})
                    </span>
                  )}
                </div>

                {attachmentsLoading && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-subtle)",
                      padding: "8px 0",
                    }}
                  >
                    Loading...
                  </div>
                )}

                {attachments.map((att) => (
                  <div
                    key={att.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      marginBottom: 4,
                      borderRadius: 8,
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-soft)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--accent)",
                        cursor: "pointer",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => handleDownload(att.id)}
                      title="Click to download"
                    >
                      {att.file_name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-subtle)",
                        flexShrink: 0,
                      }}
                    >
                      {formatBytes(att.size_bytes)}
                    </span>
                    <button
                      onClick={() => removeAttachment(att.id)}
                      style={{
                        border: "none",
                        background: "none",
                        color: "var(--text-subtle)",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: "2px 4px",
                        borderRadius: 4,
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}

                {/* Drop zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    marginTop: 8,
                    padding: "16px 12px",
                    borderRadius: 8,
                    border: `2px dashed ${
                      dragOver ? "var(--accent)" : "var(--border-soft)"
                    }`,
                    backgroundColor: dragOver
                      ? "var(--accent-soft)"
                      : "transparent",
                    textAlign: "center",
                    fontSize: 12,
                    color: "var(--text-subtle)",
                    cursor: "pointer",
                    transition: "border-color 150ms, background-color 150ms",
                  }}
                >
                  {uploading
                    ? "Uploading..."
                    : "Drop files here or click to browse"}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    handleUpload(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Comments Tab ───────────────────────── */}
          {activeTab === "comments" && (
            <div
              style={{
                paddingTop: 16,
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              {commentsLoading && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-subtle)",
                    padding: "8px 0",
                  }}
                >
                  Loading comments...
                </div>
              )}

              {!commentsLoading && comments.length === 0 && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-subtle)",
                    padding: "24px 0",
                    textAlign: "center",
                  }}
                >
                  No comments yet. Start the conversation.
                </div>
              )}

              <div style={{ flex: 1, marginBottom: 16 }}>
                {comments.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "12px 0",
                      borderBottom: "1px solid var(--border-soft)",
                    }}
                  >
                    {/* Author initials */}
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        backgroundColor: "var(--accent)",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {initials(c.author_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {c.author_name || "Unknown"}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-subtle)",
                          }}
                        >
                          {relativeTime(c.created_at)}
                        </span>
                        <div style={{ flex: 1 }} />
                        <button
                          onClick={() => removeComment(c.id)}
                          title="Delete comment"
                          style={{
                            border: "none",
                            background: "none",
                            color: "var(--text-subtle)",
                            cursor: "pointer",
                            fontSize: 13,
                            padding: "0 4px",
                            lineHeight: 1,
                          }}
                        >
                          &times;
                        </button>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-primary)",
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {c.body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Composer */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-end",
                  paddingTop: 8,
                  borderTop: "1px solid var(--border-soft)",
                }}
              >
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      sendComment();
                    }
                  }}
                  placeholder="Write a comment... (Ctrl+Enter to send)"
                  rows={2}
                  style={{
                    ...inputBase,
                    flex: 1,
                    resize: "vertical",
                    minHeight: 44,
                  }}
                />
                <button
                  onClick={sendComment}
                  disabled={!commentBody.trim()}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: commentBody.trim()
                      ? "var(--accent)"
                      : "var(--bg-elevated)",
                    color: commentBody.trim()
                      ? "#fff"
                      : "var(--text-subtle)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: commentBody.trim() ? "pointer" : "default",
                    transition: "background-color 150ms",
                    fontFamily: "inherit",
                    flexShrink: 0,
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {/* ── Activity Tab ───────────────────────── */}
          {activeTab === "activity" && (
            <div style={{ paddingTop: 16 }}>
              {activityLoading && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-subtle)",
                    padding: "8px 0",
                  }}
                >
                  Loading activity...
                </div>
              )}

              {!activityLoading && activities.length === 0 && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-subtle)",
                    padding: "24px 0",
                    textAlign: "center",
                  }}
                >
                  No activity recorded yet.
                </div>
              )}

              {activities.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border-soft)",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-soft)",
                      color: "var(--text-subtle)",
                      fontSize: 10,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {initials(a.actor_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-primary)",
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {a.actor_name || "System"}
                      </span>{" "}
                      <span style={{ color: "var(--text-muted)" }}>
                        {formatAction(a.action)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-subtle)",
                        marginTop: 2,
                      }}
                    >
                      {relativeTime(a.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
