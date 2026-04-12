"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Settings, Trash2 } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";

import type {
  Project,
  ProjectsSummary,
  Column,
  Task,
  Label,
  EmployeeMini,
} from "@/lib/projects";
import {
  fetchProjects,
  fetchProjectsSummary,
  fetchColumns,
  fetchTasks,
  fetchLabels,
  fetchMembers,
  createProject,
  updateProject,
  deleteProject,
} from "@/lib/projects";

import ProjectsListView from "@/components/projects/ProjectsListView";
import KanbanBoard from "@/components/projects/KanbanBoard";
import ProjectModal from "@/components/projects/ProjectModal";
import TaskDetailDrawer from "@/components/projects/TaskDetailDrawer";
import BoardFilters, {
  emptyFilters,
  hasActiveFilters,
  type BoardFilterState,
} from "@/components/projects/BoardFilters";
import { applyFilters } from "@/components/projects/FilterUtils";

type View = "list" | "board";

export default function ProjectsPage() {
  const isMobile = useIsMobile(980);

  // ── State ────────────────────────────────────────
  const [view, setView] = useState<View>("list");
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<ProjectsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Board state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [members, setMembers] = useState<EmployeeMini[]>([]);
  const [filters, setFilters] = useState<BoardFilterState>(emptyFilters);

  // Drawer
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);

  // Modal
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  // ── Data fetching ────────────────────────────────

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([fetchProjects(), fetchProjectsSummary()]);
      setProjects(p);
      setSummary(s);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    fetchMembers().then(setMembers).catch(() => {});
  }, [loadProjects]);

  const openProject = useCallback(async (project: Project) => {
    setSelectedProject(project);
    setView("board");
    setFilters(emptyFilters);
    try {
      const [cols, t, l] = await Promise.all([
        fetchColumns(project.id),
        fetchTasks(project.id),
        fetchLabels(project.id),
      ]);
      setColumns(cols);
      setTasks(t);
      setLabels(l);
    } catch {
      // handle
    }
  }, []);

  const refreshBoard = useCallback(async () => {
    if (!selectedProject) return;
    try {
      const [cols, t, l] = await Promise.all([
        fetchColumns(selectedProject.id),
        fetchTasks(selectedProject.id),
        fetchLabels(selectedProject.id),
      ]);
      setColumns(cols);
      setTasks(t);
      setLabels(l);
    } catch {
      // handle
    }
  }, [selectedProject]);

  const goBackToList = useCallback(() => {
    setView("list");
    setSelectedProject(null);
    setColumns([]);
    setTasks([]);
    setLabels([]);
    setDrawerTask(null);
    loadProjects();
  }, [loadProjects]);

  // ── Handlers ─────────────────────────────────────

  const handleCreateProject = async (data: Parameters<typeof createProject>[0]) => {
    const p = await createProject(data);
    setProjects((prev) => [p, ...prev]);
    openProject(p);
  };

  const handleUpdateProject = async (data: Parameters<typeof updateProject>[1]) => {
    if (!editProject) return;
    const updated = await updateProject(editProject.id, data);
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (selectedProject?.id === updated.id) setSelectedProject(updated);
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    if (!window.confirm(`Delete "${selectedProject.name}"? This cannot be undone.`)) return;
    await deleteProject(selectedProject.id);
    goBackToList();
  };

  const handleTaskClick = useCallback(
    (task: Task) => setDrawerTask(task),
    [],
  );

  const handleTaskUpdated = useCallback(
    (updated: Task) => {
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (drawerTask?.id === updated.id) setDrawerTask(updated);
    },
    [drawerTask],
  );

  const handleTaskDeleted = useCallback(
    (taskId: number) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (drawerTask?.id === taskId) setDrawerTask(null);
    },
    [drawerTask],
  );

  // ── Filtered tasks ───────────────────────────────
  const filteredTasks = hasActiveFilters(filters)
    ? applyFilters(tasks, filters)
    : tasks;

  // ── Render ───────────────────────────────────────

  if (loading && projects.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "300px",
          color: "var(--text-subtle)",
          fontSize: "14px",
        }}
      >
        Loading projects...
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        height: "100%",
        minHeight: 0,
        padding: isMobile ? "12px" : "24px",
        maxWidth: "1200px",
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Board-only header — list view uses Dashboard wrapper title */}
      {view === "board" && selectedProject && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={goBackToList}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 12px",
                borderRadius: "9px",
                border: "1px solid var(--border-default)",
                background: "var(--bg-elevated)",
                color: "var(--text-muted)",
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              <ChevronLeft size={14} /> Back
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "3px",
                  height: "16px",
                  borderRadius: "2px",
                  background: selectedProject.color,
                }}
              />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {selectedProject.name}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {selectedProject.is_owner && (
              <>
                <button
                  onClick={() => {
                    setEditProject(selectedProject);
                    setShowProjectModal(true);
                  }}
                  title="Project settings"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "7px",
                    borderRadius: "9px",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  <Settings size={14} />
                </button>
                <button
                  onClick={handleDeleteProject}
                  title="Delete project"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "7px",
                    borderRadius: "9px",
                    border: "1px solid var(--danger-soft-border)",
                    background: "var(--danger-soft-bg)",
                    color: "var(--danger)",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filter bar (board view only) */}
      {view === "board" && selectedProject && (
        <BoardFilters
          labels={labels}
          members={members}
          filters={filters}
          onChange={setFilters}
        />
      )}

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: view === "board" ? "hidden" : "auto" }}>
        {view === "list" ? (
          <ProjectsListView
            projects={projects}
            summary={summary}
            onSelectProject={openProject}
            onNewProject={() => {
              setEditProject(null);
              setShowProjectModal(true);
            }}
          />
        ) : selectedProject ? (
          <KanbanBoard
            projectId={selectedProject.id}
            columns={columns}
            tasks={filteredTasks}
            onTaskClick={handleTaskClick}
            onRefresh={refreshBoard}
          />
        ) : null}
      </div>

      {/* Project modal */}
      {showProjectModal && (
        <ProjectModal
          project={editProject}
          onSave={editProject ? handleUpdateProject : handleCreateProject}
          onClose={() => {
            setShowProjectModal(false);
            setEditProject(null);
          }}
        />
      )}

      {/* Task detail drawer */}
      {drawerTask && selectedProject && (
        <TaskDetailDrawer
          task={drawerTask}
          members={members}
          projectLabels={labels}
          onClose={() => setDrawerTask(null)}
          onTaskUpdated={handleTaskUpdated}
          onTaskDeleted={handleTaskDeleted}
        />
      )}
    </div>
  );
}
