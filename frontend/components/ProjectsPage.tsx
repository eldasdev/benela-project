"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, ChevronLeft, Calendar, User } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  background: "#111",
  border: "1px solid #2a2a2a",
  color: "#f0f0f5",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  fontSize: "11px",
  color: "#555",
  marginBottom: "6px",
  display: "block",
};

const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: "#34d399",
  on_hold: "#fbbf24",
  completed: "#60a5fa",
  archived: "#555555",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: "#f87171",
  high: "#f59e0b",
  medium: "#60a5fa",
  low: "#555555",
};

const emptyProjectForm = {
  name: "",
  description: "",
  owner: "",
  status: "active" as ProjectStatus,
  color: "#7c6aff",
};

const emptyColumnForm = {
  name: "",
  color: "#555555",
};

const emptyTaskForm = {
  title: "",
  description: "",
  priority: "medium" as TaskPriority,
  assignee: "",
  tags: "",
};

export default function ProjectsPage() {
  const [view, setView] = useState<View>("projects_list");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dragTask, setDragTask] = useState<KanbanTask | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);
  const [taskCounts, setTaskCounts] = useState<Record<number, number>>({});

  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [columnForm, setColumnForm] = useState(emptyColumnForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);

  const loadProjects = async () => {
    try {
      const [sRes, pRes] = await Promise.all([
        fetch(`${API}/projects/summary`),
        fetch(`${API}/projects/`),
      ]);
      const s = sRes.ok ? await sRes.json() : null;
      const p: Project[] = pRes.ok ? await pRes.json() : [];
      setSummary(s);
      setProjects(p);

      const counts: Record<number, number> = {};
      await Promise.all(
        p.map(async (proj) => {
          const res = await fetch(`${API}/projects/${proj.id}/tasks`);
          if (res.ok) {
            const tsks: KanbanTask[] = await res.json();
            counts[proj.id] = tsks.length;
          }
        })
      );
      setTaskCounts(counts);
    } catch (err) {
      console.error("Failed to load projects", err);
      setSummary(null);
      setProjects([]);
      setTaskCounts({});
    }
  };

  const loadBoard = async (projectId: number) => {
    try {
      const [cRes, tRes] = await Promise.all([
        fetch(`${API}/projects/${projectId}/columns`),
        fetch(`${API}/projects/${projectId}/tasks`),
      ]);
      const cols: KanbanColumn[] = cRes.ok ? await cRes.json() : [];
      const tsks: KanbanTask[] = tRes.ok ? await tRes.json() : [];
      setColumns(cols);
      setTasks(tsks);
    } catch (err) {
      console.error("Failed to load board", err);
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
      color: project.color || "#7c6aff",
    });
    setModal("edit_project");
  };

  const saveProject = async () => {
    setLoading(true);
    const body = {
      name: projectForm.name,
      description: projectForm.description || null,
      owner: projectForm.owner || null,
      status: projectForm.status,
      color: projectForm.color || "#7c6aff",
    };
    if (modal === "add_project") {
      await fetch(`${API}/projects/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else if (modal === "edit_project" && selected) {
      await fetch(`${API}/projects/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    await loadProjects();
    setModal(null);
    setLoading(false);
  };

  const deleteProject = async (id: number) => {
    if (!confirm("Delete this project and all its board data?")) return;
    await fetch(`${API}/projects/${id}`, { method: "DELETE" });
    if (selectedProject && selectedProject.id === id) {
      setSelectedProject(null);
      setView("projects_list");
      setColumns([]);
      setTasks([]);
    }
    await loadProjects();
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
    setColumnForm({ name: col.name, color: col.color || "#555555" });
    setModal("edit_column");
  };

  const saveColumn = async () => {
    if (!selectedProject) return;
    setLoading(true);
    if (modal === "add_column") {
      const body = {
        project_id: selectedProject.id,
        name: columnForm.name,
        color: columnForm.color || "#555555",
        position: columns.length,
      };
      await fetch(`${API}/projects/${selectedProject.id}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else if (modal === "edit_column" && selected) {
      const body = {
        name: columnForm.name,
        color: columnForm.color || "#555555",
      };
      await fetch(`${API}/projects/columns/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    await loadBoard(selectedProject.id);
    setModal(null);
    setLoading(false);
  };

  const deleteColumn = async (id: number) => {
    if (!selectedProject) return;
    if (!confirm("Delete this column and all tasks inside it?")) return;
    await fetch(`${API}/projects/columns/${id}`, { method: "DELETE" });
    await loadBoard(selectedProject.id);
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
      await fetch(`${API}/projects/${selectedProject.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else if (modal === "edit_task" && selected) {
      const task = selected as KanbanTask;
      const body = {
        title: taskForm.title,
        description: taskForm.description || null,
        priority: taskForm.priority,
        assignee: taskForm.assignee || null,
        tags: taskForm.tags || null,
      };
      await fetch(`${API}/projects/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    await loadBoard(selectedProject.id);
    await loadProjects();
    setModal(null);
    setLoading(false);
  };

  const deleteTask = async (id: number) => {
    if (!selectedProject) return;
    if (!confirm("Delete this task?")) return;
    await fetch(`${API}/projects/tasks/${id}`, { method: "DELETE" });
    await loadBoard(selectedProject.id);
    await loadProjects();
  };

  // ── Drag & Drop ──────────────────────────────────────
  const handleDrop = async (columnId: number) => {
    if (!dragTask || !selectedProject) return;
    const tasksInColumn = tasks.filter((t) => t.column_id === columnId);
    const newPosition = tasksInColumn.length;
    await fetch(`${API}/projects/tasks/${dragTask.id}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column_id: columnId, position: newPosition }),
    });
    await loadBoard(selectedProject.id);
    await loadProjects();
    setDragTask(null);
    setDragOverColumn(null);
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
              background: "#111",
              border: "1px solid #1f1f1f",
              color: "#666",
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
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* KPI Cards (list view only) */}
      {view === "projects_list" && summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          {[
            {
              label: "Total Projects",
              value: summary.total_projects,
              color: "#7c6aff",
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
                background: "#0d0d0d",
                border: "1px solid #1c1c1c",
                borderRadius: "12px",
                padding: "18px 20px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <p style={{ fontSize: "11px", color: "#444", marginBottom: "10px" }}>
                {card.label}
              </p>
              <p
                style={{
                  fontSize: "28px",
                  fontWeight: 600,
                  color: "#f0f0f5",
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
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                border: "1px solid #1c1c1c",
                background: "#0d0d0d",
                color: "#888",
                fontSize: "12px",
                cursor: "pointer",
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
                color: "#f0f0f5",
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
                color: "#444",
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
              background: "#7c6aff",
              border: "none",
              color: "white",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
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
              border: "1px dashed #2a2a2a",
              background: "transparent",
              color: "#888",
              fontSize: "13px",
              cursor: "pointer",
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
            background: "#0d0d0d",
            border: "1px solid #1c1c1c",
            borderRadius: "14px",
            padding: "20px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "14px",
            }}
          >
            {projects.map((project) => {
              const color = project.color || "#7c6aff";
              const count = taskCounts[project.id] ?? 0;
              return (
                <div
                  key={project.id}
                  style={{
                    position: "relative",
                    background: "#080808",
                    borderRadius: "14px",
                    border: "1px solid #1c1c1c",
                    padding: "16px 16px 14px 18px",
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
                        }}
                      >
                        <h3
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#f0f0f5",
                            margin: 0,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
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
                            color: "#555",
                            marginTop: "4px",
                            marginBottom: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
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
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: "4px",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "#444",
                        fontSize: "11px",
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
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#666",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background: "#111",
                          border: "1px solid #1c1c1c",
                        }}
                      >
                        {count} task{count === 1 ? "" : "s"}
                      </span>
                      <button
                        onClick={() => openEditProject(project)}
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "7px",
                          background: "#111",
                          border: "1px solid #222",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <Pencil size={11} color="#777" />
                      </button>
                      <button
                        onClick={() => deleteProject(project.id)}
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "7px",
                          background: "#111",
                          border: "1px solid #222",
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

                  <button
                    onClick={() => openBoard(project)}
                    style={{
                      marginTop: "8px",
                      alignSelf: "flex-start",
                      fontSize: "12px",
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid #222",
                      background: "#0d0d0d",
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
            background: "#0d0d0d",
            borderRadius: "14px",
            border: "1px solid #1c1c1c",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              borderBottom: "1px solid #1c1c1c",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  background: selectedProject.color || "#7c6aff",
                }}
              />
              <span
                style={{
                  fontSize: "13px",
                  color: "#888",
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
                    background: isActiveDrop
                      ? "rgba(124,106,255,0.04)"
                      : "#0d0d0d",
                    borderRadius: "12px",
                    border: isActiveDrop
                      ? "1px solid #7c6aff"
                      : "1px solid #1c1c1c",
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
                          background: column.color || "#555555",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "13px",
                          color: "#e0e0e0",
                          fontWeight: 500,
                        }}
                      >
                        {column.name}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          color: "#555",
                          padding: "2px 6px",
                          borderRadius: "999px",
                          border: "1px solid #222",
                          background: "#111",
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
                          background: "#111",
                          border: "1px solid #222",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <Pencil size={11} color="#777" />
                      </button>
                      <button
                        onClick={() => deleteColumn(column.id)}
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "6px",
                          background: "#111",
                          border: "1px solid #222",
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
                            background: "#111",
                            border: "1px solid #1c1c1c",
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
                                background: "#151515",
                                border: "1px solid #222",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                              }}
                            >
                              <Pencil size={11} color="#777" />
                            </button>
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "#e0e0e0",
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
                                color: "#666",
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
                              color: "#555",
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
                                color: "#555",
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
                      border: "1px dashed #2a2a2a",
                      background: "transparent",
                      color: "#555",
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
            background: "rgba(0,0,0,0.7)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setModal(null)}
        >
          <div
            style={{
              background: "#0d0d0d",
              border: "1px solid #222",
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
                  color: "#f0f0f5",
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
                  background: "#1a1a1a",
                  border: "1px solid #222",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={13} color="#777" />
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
                    <span style={{ color: "#333" }}>
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
                  background: "#1a1a1a",
                  border: "1px solid #222",
                  color: "#777",
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
                  background: "#7c6aff",
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

