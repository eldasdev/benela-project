"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, ChevronLeft, Calendar, User } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";
import { authFetch } from "@/lib/auth-fetch";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

type View = "projects_list" | "kanban_board";

type ProjectStatus = "active" | "on_hold" | "completed" | "archived";
type TaskPriority = "low" | "medium" | "high" | "critical";

type Project = {
  id: number;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  color: string;
  owner?: string | null;
  created_at: string;
};

type KanbanColumn = {
  id: number;
  project_id: number;
  name: string;
  color: string;
  position: number;
};

type KanbanTask = {
  id: number;
  column_id: number;
  project_id: number;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  assignee?: string | null;
  tags?: string | null;
  position: number;
  created_at: string;
};

type Summary = {
  total_projects: number;
  active: number;
  completed: number;
  total_tasks: number;
};

type ProjectHealth = "healthy" | "watch" | "risk";

type ProjectMetrics = {
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  criticalOpenTasks: number;
  progressPercent: number;
  health: ProjectHealth;
  healthLabel: string;
};

type ModalType =
  | null
  | "add_project"
  | "edit_project"
  | "add_column"
  | "edit_column"
  | "add_task"
  | "edit_task";

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "9px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-soft)",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--text-subtle)",
  marginBottom: "6px",
  display: "block",
};

const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: "#34d399",
  on_hold: "#fbbf24",
  completed: "#60a5fa",
  archived: "var(--text-subtle)",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: "#f87171",
  high: "#f59e0b",
  medium: "#60a5fa",
  low: "var(--text-subtle)",
};

const PROJECT_HEALTH_COLOR: Record<ProjectHealth, string> = {
  healthy: "#34d399",
  watch: "#fbbf24",
  risk: "#f87171",
};

const DONE_COLUMN_KEYWORDS = ["done", "complete", "completed", "closed", "approved", "released", "resolved", "finished"];

const isDoneColumnName = (name?: string | null): boolean => {
  const normalized = (name || "").trim().toLowerCase();
  if (!normalized) return false;
  return DONE_COLUMN_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const buildProjectMetrics = (
  project: Project,
  projectColumns: KanbanColumn[],
  projectTasks: KanbanTask[],
): ProjectMetrics => {
  const totalTasks = projectTasks.length;
  const completedColumnIds = new Set(
    projectColumns.filter((column) => isDoneColumnName(column.name)).map((column) => column.id),
  );

  let completedTasks = projectTasks.filter((task) => completedColumnIds.has(task.column_id)).length;
  if (project.status === "completed" && totalTasks > 0) {
    completedTasks = totalTasks;
  }

  const openTasks = Math.max(totalTasks - completedTasks, 0);
  const criticalOpenTasks = projectTasks.filter(
    (task) =>
      !completedColumnIds.has(task.column_id) &&
      (task.priority === "critical" || task.priority === "high"),
  ).length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  let health: ProjectHealth = "watch";
  if (project.status === "on_hold" || criticalOpenTasks >= 3 || (totalTasks > 0 && progressPercent < 30)) {
    health = "risk";
  } else if (
    project.status === "completed" ||
    (progressPercent >= 80 && criticalOpenTasks === 0) ||
    (totalTasks === 0 && project.status === "active")
  ) {
    health = "healthy";
  }

  const healthLabel =
    health === "healthy" ? "Healthy" : health === "watch" ? "Needs attention" : "At risk";

  return {
    totalTasks,
    completedTasks,
    openTasks,
    criticalOpenTasks,
    progressPercent,
    health,
    healthLabel,
  };
};

const emptyProjectForm = {
  name: "",
  description: "",
  owner: "",
  status: "active" as ProjectStatus,
  color: "var(--accent)",
};

const emptyColumnForm = {
  name: "",
  color: "var(--text-subtle)",
};

const emptyTaskForm = {
  title: "",
  description: "",
  priority: "medium" as TaskPriority,
  assignee: "",
  tags: "",
};

export default function ProjectsPage() {
  const isMobile = useIsMobile(980);
  const isCompact = useIsMobile(1280);
  const isDenseLayout = isMobile || isCompact;

  const [view, setView] = useState<View>("projects_list");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragTask, setDragTask] = useState<KanbanTask | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);
  const [taskCounts, setTaskCounts] = useState<Record<number, number>>({});
  const [projectMetrics, setProjectMetrics] = useState<Record<number, ProjectMetrics>>({});

  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [columnForm, setColumnForm] = useState(emptyColumnForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);

  const extractErrorMessage = async (response: Response, fallback: string) => {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.detail === "string" && payload.detail.trim()) {
        return payload.detail.trim();
      }
    } catch {}

    const text = await response.text().catch(() => "");
    if (text.trim()) return text.trim();
    return fallback;
  };

  const requestJson = async <T,>(url: string, init: RequestInit | undefined, fallback: string): Promise<T> => {
    const response = await authFetch(url, init);
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, fallback));
    }
    return response.json() as Promise<T>;
  };

  const requestOk = async (url: string, init: RequestInit | undefined, fallback: string) => {
    const response = await authFetch(url, init);
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, fallback));
    }
    return response;
  };

  const loadProjects = async () => {
    try {
      setError(null);
      const [s, p] = await Promise.all([
        requestJson<Summary>(`${API}/projects/summary`, undefined, "Failed to load project summary."),
        requestJson<Project[]>(`${API}/projects`, undefined, "Failed to load projects."),
      ]);
      setSummary(s);
      setProjects(p);

      const counts: Record<number, number> = {};
      const metrics: Record<number, ProjectMetrics> = {};
      await Promise.all(
        p.map(async (proj) => {
          const [cols, tsks] = await Promise.all([
            requestJson<KanbanColumn[]>(
              `${API}/projects/${proj.id}/columns`,
              undefined,
              `Failed to load columns for ${proj.name}.`,
            ),
            requestJson<KanbanTask[]>(
              `${API}/projects/${proj.id}/tasks`,
              undefined,
              `Failed to load tasks for ${proj.name}.`,
            ),
          ]);

          counts[proj.id] = tsks.length;
          metrics[proj.id] = buildProjectMetrics(proj, cols, tsks);
        })
      );
      setTaskCounts(counts);
      setProjectMetrics(metrics);
    } catch (err) {
      console.error("Failed to load projects", err);
      setError(err instanceof Error ? err.message : "Failed to load projects.");
      setSummary(null);
      setProjects([]);
      setTaskCounts({});
      setProjectMetrics({});
    }
  };

  const loadBoard = async (projectId: number) => {
    try {
      setError(null);
      const [cols, tsks] = await Promise.all([
        requestJson<KanbanColumn[]>(
          `${API}/projects/${projectId}/columns`,
          undefined,
          "Failed to load project columns.",
        ),
        requestJson<KanbanTask[]>(
          `${API}/projects/${projectId}/tasks`,
          undefined,
          "Failed to load project tasks.",
        ),
      ]);
      setColumns(cols);
      setTasks(tsks);
    } catch (err) {
      console.error("Failed to load board", err);
      setError(err instanceof Error ? err.message : "Failed to load project board.");
      setColumns([]);
      setTasks([]);
    }
  };

  const openBoard = async (project: Project) => {
    setSelectedProject(project);
    await loadBoard(project.id);
    setView("kanban_board");
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // ── Project CRUD ─────────────────────────────────────
  const openNewProject = () => {
    setSelected(null);
    setProjectForm(emptyProjectForm);
    setModal("add_project");
  };

  const openEditProject = (project: Project) => {
    setSelected(project);
    setProjectForm({
      name: project.name,
      description: project.description || "",
      owner: project.owner || "",
      status: project.status,
      color: project.color || "var(--accent)",
    });
    setModal("edit_project");
  };

  const saveProject = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = {
        name: projectForm.name,
        description: projectForm.description || null,
        owner: projectForm.owner || null,
        status: projectForm.status,
        color: projectForm.color || "var(--accent)",
      };
      if (modal === "add_project") {
        await requestOk(`${API}/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }, "Failed to create project.");
      } else if (modal === "edit_project" && selected) {
        await requestOk(`${API}/projects/${selected.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }, "Failed to update project.");
      }
      await loadProjects();
      setModal(null);
    } catch (err) {
      console.error("Failed to save project", err);
      setError(err instanceof Error ? err.message : "Failed to save project.");
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (id: number) => {
    if (!confirm("Delete this project and all its board data?")) return;
    setError(null);
    try {
      await requestOk(`${API}/projects/${id}`, { method: "DELETE" }, "Failed to delete project.");
      if (selectedProject && selectedProject.id === id) {
        setSelectedProject(null);
        setView("projects_list");
        setColumns([]);
        setTasks([]);
      }
      await loadProjects();
    } catch (err) {
      console.error("Failed to delete project", err);
      setError(err instanceof Error ? err.message : "Failed to delete project.");
    }
  };

  // ── Column CRUD ──────────────────────────────────────
  const openNewColumn = () => {
    if (!selectedProject) return;
    setSelected(null);
    setColumnForm(emptyColumnForm);
    setModal("add_column");
  };

  const openEditColumn = (col: KanbanColumn) => {
    setSelected(col);
    setColumnForm({ name: col.name, color: col.color || "var(--text-subtle)" });
    setModal("edit_column");
  };

  const saveColumn = async () => {
    if (!selectedProject) return;
    setLoading(true);
    setError(null);
    try {
      if (modal === "add_column") {
        const body = {
          project_id: selectedProject.id,
          name: columnForm.name,
          color: columnForm.color || "var(--text-subtle)",
          position: columns.length,
        };
        await requestOk(`${API}/projects/${selectedProject.id}/columns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }, "Failed to create column.");
      } else if (modal === "edit_column" && selected) {
        const body = {
          name: columnForm.name,
          color: columnForm.color || "var(--text-subtle)",
        };
        await requestOk(`${API}/projects/columns/${selected.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }, "Failed to update column.");
      }
      await loadBoard(selectedProject.id);
      setModal(null);
    } catch (err) {
      console.error("Failed to save column", err);
      setError(err instanceof Error ? err.message : "Failed to save column.");
    } finally {
      setLoading(false);
    }
  };

  const deleteColumn = async (id: number) => {
    if (!selectedProject) return;
    if (!confirm("Delete this column and all tasks inside it?")) return;
    setError(null);
    try {
      await requestOk(`${API}/projects/columns/${id}`, { method: "DELETE" }, "Failed to delete column.");
      await loadBoard(selectedProject.id);
    } catch (err) {
      console.error("Failed to delete column", err);
      setError(err instanceof Error ? err.message : "Failed to delete column.");
    }
  };

  // ── Task CRUD ────────────────────────────────────────
  const openNewTask = (column: KanbanColumn) => {
    setSelected(column);
    setTaskForm(emptyTaskForm);
    setModal("add_task");
  };

  const openEditTask = (task: KanbanTask) => {
    setSelected(task);
    setTaskForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      assignee: task.assignee || "",
      tags: task.tags || "",
    });
    setModal("edit_task");
  };

  const saveTask = async () => {
    if (!selectedProject) return;
    setLoading(true);
    setError(null);
    try {
      if (modal === "add_task" && selected) {
        const column = selected as KanbanColumn;
        const tasksInColumn = tasks.filter((t) => t.column_id === column.id);
        const body = {
          project_id: selectedProject.id,
          column_id: column.id,
          title: taskForm.title,
          description: taskForm.description || null,
          priority: taskForm.priority,
          assignee: taskForm.assignee || null,
          tags: taskForm.tags || null,
          position: tasksInColumn.length,
        };
        await requestOk(`${API}/projects/${selectedProject.id}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }, "Failed to create task.");
      } else if (modal === "edit_task" && selected) {
        const task = selected as KanbanTask;
        const body = {
          title: taskForm.title,
          description: taskForm.description || null,
          priority: taskForm.priority,
          assignee: taskForm.assignee || null,
          tags: taskForm.tags || null,
        };
        await requestOk(`${API}/projects/tasks/${task.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }, "Failed to update task.");
      }
      await loadBoard(selectedProject.id);
      await loadProjects();
      setModal(null);
    } catch (err) {
      console.error("Failed to save task", err);
      setError(err instanceof Error ? err.message : "Failed to save task.");
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (id: number) => {
    if (!selectedProject) return;
    if (!confirm("Delete this task?")) return;
    setError(null);
    try {
      await requestOk(`${API}/projects/tasks/${id}`, { method: "DELETE" }, "Failed to delete task.");
      await loadBoard(selectedProject.id);
      await loadProjects();
    } catch (err) {
      console.error("Failed to delete task", err);
      setError(err instanceof Error ? err.message : "Failed to delete task.");
    }
  };

  // ── Drag & Drop ──────────────────────────────────────
  const handleDrop = async (columnId: number) => {
    if (!dragTask || !selectedProject) return;
    const tasksInColumn = tasks.filter((t) => t.column_id === columnId);
    const newPosition = tasksInColumn.length;
    setError(null);
    try {
      await requestOk(`${API}/projects/tasks/${dragTask.id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_id: columnId, position: newPosition }),
      }, "Failed to move task.");
      await loadBoard(selectedProject.id);
      await loadProjects();
      setDragTask(null);
      setDragOverColumn(null);
    } catch (err) {
      console.error("Failed to move task", err);
      setError(err instanceof Error ? err.message : "Failed to move task.");
    }
  };

  const renderStatusBadge = (status: ProjectStatus) => {
    const color = STATUS_COLOR[status];
    const label = status.replace("_", " ");
    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "6px",
          fontSize: "11px",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          background: `${color}12`,
          color,
          border: `1px solid ${color}20`,
        }}
      >
        <span
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: color,
          }}
        />
        {label}
      </span>
    );
  };

  const renderPriorityBadge = (priority: TaskPriority) => {
    const color = PRIORITY_COLOR[priority];
    const label = priority.charAt(0).toUpperCase() + priority.slice(1);
    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "999px",
          fontSize: "10px",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          background: `${color}18`,
          color,
          border: `1px solid ${color}30`,
        }}
      >
        <span
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: color,
          }}
        />
        {label}
      </span>
    );
  };

  const renderTagChips = (tags?: string | null) => {
    if (!tags) return null;
    const parts = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parts.length) return null;
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          marginLeft: "6px",
        }}
      >
        {parts.map((tag) => (
          <span
            key={tag}
            style={{
              padding: "2px 6px",
              borderRadius: "999px",
              fontSize: "10px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-soft)",
              color: "var(--text-muted)",
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div
      style={{
        padding: isDenseLayout ? "14px" : "24px",
        maxWidth: isDenseLayout ? "100%" : "1200px",
        margin: "0 auto",
        overflowX: "hidden",
      }}
    >
      {error ? (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 14px",
            borderRadius: "12px",
            border: "1px solid rgba(248, 113, 113, 0.25)",
            background: "rgba(248, 113, 113, 0.08)",
            color: "#ef4444",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* KPI Cards (list view only) */}
      {view === "projects_list" && summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isDenseLayout ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          {[
            {
              label: "Total Projects",
              value: summary.total_projects,
              color: "var(--accent)",
            },
            {
              label: "Active",
              value: summary.active,
              color: "#34d399",
            },
            {
              label: "Completed",
              value: summary.completed,
              color: "#60a5fa",
            },
            {
              label: "Total Tasks",
              value: summary.total_tasks,
              color: "#fbbf24",
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "12px",
                padding: isDenseLayout ? "14px 14px" : "18px 20px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginBottom: "10px" }}>
                {card.label}
              </p>
              <p
                style={{
                  fontSize: isDenseLayout ? "24px" : "28px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  lineHeight: 1,
                }}
              >
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

      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: isDenseLayout ? "stretch" : "center",
          justifyContent: "space-between",
          flexDirection: isDenseLayout ? "column" : "row",
          marginBottom: "16px",
          gap: isDenseLayout ? "10px" : 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: isDenseLayout ? "flex-start" : "center",
            gap: "10px",
            width: isDenseLayout ? "100%" : "auto",
          }}
        >
          {view === "kanban_board" && (
            <button
              onClick={() => {
                setView("projects_list");
                setSelectedProject(null);
                setColumns([]);
                setTasks([]);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 10px",
                borderRadius: "8px",
                border: "1px solid var(--border-default)",
                background: "var(--bg-surface)",
                color: "var(--text-muted)",
                fontSize: "12px",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={14} />
              All Projects
            </button>
          )}
          <div>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {view === "projects_list"
                ? "Projects"
                : selectedProject?.name || "Kanban Board"}
            </h2>
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-subtle)",
                marginTop: "2px",
              }}
            >
              {view === "projects_list"
                ? "Kanban boards, tasks and team collaboration"
                : "Drag tasks between columns to update workflow status"}
            </p>
          </div>
        </div>

        {view === "projects_list" ? (
          <button
            onClick={openNewProject}
            style={{
              display: "flex",
              alignItems: "center",
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
              justifyContent: "center",
            }}
          >
            <Plus size={14} />
            New Project
          </button>
        ) : (
          <button
            onClick={openNewColumn}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "9px",
              border: "1px dashed var(--border-soft)",
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: "13px",
              cursor: "pointer",
              width: isDenseLayout ? "100%" : "auto",
              justifyContent: "center",
            }}
          >
            <Plus size={14} />
            Add Column
          </button>
        )}
      </div>

      {/* Projects list view */}
      {view === "projects_list" && (
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "14px",
            padding: isDenseLayout ? "14px" : "20px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "1fr"
                : isDenseLayout
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(3, minmax(0, 1fr))",
              gap: "14px",
            }}
          >
            {projects.map((project) => {
              const color = project.color || "var(--accent)";
              const metrics = projectMetrics[project.id];
              const count = metrics?.totalTasks ?? taskCounts[project.id] ?? 0;
              const completedCount = metrics?.completedTasks ?? 0;
              const progressPercent = metrics?.progressPercent ?? 0;
              const health = metrics?.health ?? "watch";
              const healthLabel = metrics?.healthLabel ?? "Needs attention";
              const healthColor = PROJECT_HEALTH_COLOR[health];
              const criticalOpenTasks = metrics?.criticalOpenTasks ?? 0;
              return (
                <div
                  key={project.id}
                  style={{
                    position: "relative",
                    background: "var(--bg-canvas)",
                    borderRadius: "14px",
                    border: "1px solid var(--border-default)",
                    padding: isDenseLayout ? "14px 14px 12px 16px" : "16px 16px 14px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: "3px",
                      background: color,
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "8px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          flexWrap: isDenseLayout ? "wrap" : "nowrap",
                        }}
                      >
                        <h3
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            margin: 0,
                            whiteSpace: isDenseLayout ? "normal" : "nowrap",
                            overflow: "hidden",
                            textOverflow: isDenseLayout ? "clip" : "ellipsis",
                            display: isDenseLayout ? "-webkit-box" : "block",
                            WebkitLineClamp: isDenseLayout ? 2 : undefined,
                            WebkitBoxOrient: isDenseLayout ? "vertical" : undefined,
                            maxWidth: "100%",
                          }}
                        >
                          {project.name}
                        </h3>
                        {renderStatusBadge(project.status)}
                      </div>
                      {project.description && (
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--text-subtle)",
                            marginTop: "4px",
                            marginBottom: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: isDenseLayout ? 3 : 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid var(--border-soft)",
                      borderRadius: "10px",
                      background: "var(--bg-elevated)",
                      padding: "8px 10px",
                      display: "grid",
                      gap: "7px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: "10px", color: "var(--text-subtle)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        Progress
                      </span>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            borderRadius: "999px",
                            border: `1px solid ${healthColor}30`,
                            background: `${healthColor}16`,
                            color: healthColor,
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "2px 8px",
                          }}
                        >
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: healthColor }} />
                          {healthLabel}
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {progressPercent}%
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        height: "7px",
                        borderRadius: "999px",
                        border: "1px solid var(--border-soft)",
                        background: "var(--bg-canvas)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${progressPercent}%`,
                          background: `linear-gradient(90deg, ${color}B0, ${color})`,
                          transition: "width 260ms ease",
                        }}
                      />
                    </div>

                    <div style={{ fontSize: "10.5px", color: "var(--text-quiet)" }}>
                      {completedCount}/{count} completed
                      {criticalOpenTasks > 0 ? ` · ${criticalOpenTasks} high-priority open` : ""}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: isDenseLayout ? "stretch" : "center",
                      justifyContent: "space-between",
                      flexDirection: isDenseLayout ? "column" : "row",
                      marginTop: "4px",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "8px",
                        color: "var(--text-subtle)",
                        fontSize: "11px",
                        width: isDenseLayout ? "100%" : "auto",
                      }}
                    >
                      {project.owner && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <User size={11} />
                          <span>{project.owner}</span>
                        </span>
                      )}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Calendar size={11} />
                        <span>
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        width: isDenseLayout ? "100%" : "auto",
                        justifyContent: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                        }}
                      >
                        {count} task{count === 1 ? "" : "s"}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          marginLeft: "auto",
                        }}
                      >
                        <button
                          onClick={() => openEditProject(project)}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "7px",
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <Pencil size={11} color="var(--text-muted)" />
                        </button>
                        <button
                          onClick={() => deleteProject(project.id)}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "7px",
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={11} color="#f87171" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => openBoard(project)}
                    style={{
                      marginTop: "8px",
                      alignSelf: isDenseLayout ? "stretch" : "flex-start",
                      width: isDenseLayout ? "100%" : "auto",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-surface)",
                      color: "#a78bfa",
                      cursor: "pointer",
                    }}
                  >
                    Open Board →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Kanban board view */}
      {view === "kanban_board" && selectedProject && (
        <div
          style={{
            marginTop: "8px",
            background: "var(--bg-surface)",
            borderRadius: "14px",
            border: "1px solid var(--border-default)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              borderBottom: "1px solid var(--border-default)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  background: selectedProject.color || "var(--accent)",
                }}
              />
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                }}
              >
                {selectedProject.owner || "Unassigned owner"}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "16px",
              overflowX: "auto",
              padding: "24px",
            }}
          >
            {columns.map((column) => {
              const inColumn = tasks
                .filter((t) => t.column_id === column.id)
                .sort((a, b) => a.position - b.position);
              const isActiveDrop = dragOverColumn === column.id;
              return (
                <div
                  key={column.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverColumn(column.id);
                  }}
                  onDragLeave={() => setDragOverColumn(null)}
                  onDrop={() => handleDrop(column.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    minWidth: "280px",
                    maxWidth: "280px",
                    background: isActiveDrop ? "var(--accent-soft)" : "var(--bg-surface)",
                    borderRadius: "12px",
                    border: isActiveDrop
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border-default)",
                    padding: "14px 12px 10px",
                    boxSizing: "border-box",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "3px",
                          background: column.color || "var(--text-subtle)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "13px",
                          color: "var(--text-primary)",
                          fontWeight: 500,
                        }}
                      >
                        {column.name}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--text-subtle)",
                          padding: "2px 6px",
                          borderRadius: "999px",
                          border: "1px solid var(--border-default)",
                          background: "var(--bg-elevated)",
                        }}
                      >
                        {inColumn.length}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => openEditColumn(column)}
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "6px",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <Pencil size={11} color="var(--text-muted)" />
                      </button>
                      <button
                        onClick={() => deleteColumn(column.id)}
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "6px",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 size={11} color="#f87171" />
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: 1, minHeight: "10px" }}>
                    {inColumn.map((task) => {
                      const isDragging = dragTask && dragTask.id === task.id;
                      return (
                        <div
                          key={task.id}
                          draggable={true}
                          onDragStart={() => setDragTask(task)}
                          onDragEnd={() => {
                            setDragTask(null);
                            setDragOverColumn(null);
                          }}
                          style={{
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                            borderRadius: "10px",
                            padding: "14px",
                            marginBottom: "8px",
                            cursor: isDragging ? "grabbing" : "grab",
                            opacity: isDragging ? 0.4 : 1,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: "8px",
                              gap: "6px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              {renderPriorityBadge(task.priority)}
                              {renderTagChips(task.tags)}
                            </div>
                            <button
                              onClick={() => openEditTask(task)}
                              style={{
                                width: "22px",
                                height: "22px",
                                borderRadius: "6px",
                                background: "var(--bg-elevated)",
                                border: "1px solid var(--border-default)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                              }}
                            >
                              <Pencil size={11} color="var(--text-muted)" />
                            </button>
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "var(--text-primary)",
                              fontWeight: 500,
                              marginBottom: "6px",
                            }}
                          >
                            {task.title}
                          </div>
                          {task.description && (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--text-muted)",
                                marginBottom: "8px",
                              }}
                            >
                              {task.description}
                            </div>
                          )}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              fontSize: "11px",
                              color: "var(--text-subtle)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              {task.assignee && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  <User size={11} />
                                  <span>{task.assignee}</span>
                                </span>
                              )}
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <Calendar size={11} />
                                <span>
                                  {new Date(task.created_at).toLocaleDateString()}
                                </span>
                              </span>
                            </div>
                            <button
                              onClick={() => deleteTask(task.id)}
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "var(--text-subtle)",
                                fontSize: "11px",
                                cursor: "pointer",
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => openNewTask(column)}
                    style={{
                      marginTop: "6px",
                      padding: "7px 10px",
                      borderRadius: "8px",
                      border: "1px dashed var(--border-soft)",
                      background: "transparent",
                      color: "var(--text-subtle)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    + Add Task
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {modal && (
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
              padding: "26px",
              width: "480px",
              maxWidth: "90vw",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                {modal === "add_project"
                  ? "New Project"
                  : modal === "edit_project"
                  ? "Edit Project"
                  : modal === "add_column"
                  ? "New Column"
                  : modal === "edit_column"
                  ? "Edit Column"
                  : modal === "add_task"
                  ? "New Task"
                  : "Edit Task"}
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

            {/* Project form */}
            {(modal === "add_project" || modal === "edit_project") && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div>
                  <label style={labelStyle}>Name</label>
                  <input
                    style={inputStyle}
                    value={projectForm.name}
                    onChange={(e) =>
                      setProjectForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="Website Redesign"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <input
                    style={inputStyle}
                    value={projectForm.description}
                    onChange={(e) =>
                      setProjectForm((f) => ({
                        ...f,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Short description of the project"
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label style={labelStyle}>Owner</label>
                    <input
                      style={inputStyle}
                      value={projectForm.owner}
                      onChange={(e) =>
                        setProjectForm((f) => ({
                          ...f,
                          owner: e.target.value,
                        }))
                      }
                      placeholder="Lisa Park"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select
                      style={inputStyle}
                      value={projectForm.status}
                      onChange={(e) =>
                        setProjectForm((f) => ({
                          ...f,
                          status: e.target.value as ProjectStatus,
                        }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="on_hold">On Hold</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Color</label>
                  <input
                    type="color"
                    style={{
                      ...inputStyle,
                      padding: "3px 6px",
                      height: "34px",
                    }}
                    value={projectForm.color}
                    onChange={(e) =>
                      setProjectForm((f) => ({
                        ...f,
                        color: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {/* Column form */}
            {(modal === "add_column" || modal === "edit_column") && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div>
                  <label style={labelStyle}>Column Name</label>
                  <input
                    style={inputStyle}
                    value={columnForm.name}
                    onChange={(e) =>
                      setColumnForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="In Progress"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Color</label>
                  <input
                    type="color"
                    style={{
                      ...inputStyle,
                      padding: "3px 6px",
                      height: "34px",
                    }}
                    value={columnForm.color}
                    onChange={(e) =>
                      setColumnForm((f) => ({
                        ...f,
                        color: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {/* Task form */}
            {(modal === "add_task" || modal === "edit_task") && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div>
                  <label style={labelStyle}>Title</label>
                  <input
                    style={inputStyle}
                    value={taskForm.title}
                    onChange={(e) =>
                      setTaskForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="Design hero section"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <input
                    style={inputStyle}
                    value={taskForm.description}
                    onChange={(e) =>
                      setTaskForm((f) => ({
                        ...f,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Details about the task..."
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label style={labelStyle}>Priority</label>
                    <select
                      style={inputStyle}
                      value={taskForm.priority}
                      onChange={(e) =>
                        setTaskForm((f) => ({
                          ...f,
                          priority: e.target.value as TaskPriority,
                        }))
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Assignee</label>
                    <input
                      style={inputStyle}
                      value={taskForm.assignee}
                      onChange={(e) =>
                        setTaskForm((f) => ({
                          ...f,
                          assignee: e.target.value,
                        }))
                      }
                      placeholder="Lisa Park"
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>
                    Tags{" "}
                    <span style={{ color: "var(--text-quiet)" }}>
                      (comma separated, e.g. design, frontend)
                    </span>
                  </label>
                  <input
                    style={inputStyle}
                    value={taskForm.tags}
                    onChange={(e) =>
                      setTaskForm((f) => ({ ...f, tags: e.target.value }))
                    }
                    placeholder="design, frontend"
                  />
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "24px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setModal(null)}
                style={{
                  padding: "9px 18px",
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
                onClick={
                  modal === "add_project" || modal === "edit_project"
                    ? saveProject
                    : modal === "add_column" || modal === "edit_column"
                    ? saveColumn
                    : saveTask
                }
                disabled={loading}
                style={{
                  padding: "9px 20px",
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
                {loading
                  ? "Saving..."
                  : modal?.startsWith("add")
                  ? "Add"
                  : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
