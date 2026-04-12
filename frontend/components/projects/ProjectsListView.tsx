"use client";

import type { CSSProperties } from "react";
import { Plus, FolderKanban, CheckCircle2, AlertTriangle, BarChart3 } from "lucide-react";
import type { Project, ProjectsSummary } from "@/lib/projects";

interface ProjectsListViewProps {
  projects: Project[];
  summary: ProjectsSummary | null;
  onSelectProject: (project: Project) => void;
  onNewProject: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  active: "#34d399",
  completed: "#60a5fa",
  archived: "var(--text-subtle)",
};

export default function ProjectsListView({
  projects,
  summary,
  onSelectProject,
  onNewProject,
}: ProjectsListViewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* KPI cards */}
      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
          }}
        >
          <KpiCard icon={<FolderKanban size={18} />} label="Projects" value={summary.total_projects} sub={`${summary.active_projects} active`} color="#7c6aff" />
          <KpiCard icon={<BarChart3 size={18} />} label="Tasks" value={summary.total_tasks} sub={`${summary.done_tasks} completed`} color="#4f8cff" />
          <KpiCard icon={<CheckCircle2 size={18} />} label="Done" value={summary.done_tasks} sub={summary.total_tasks > 0 ? `${Math.round((summary.done_tasks / summary.total_tasks) * 100)}% completion` : "No tasks"} color="#34d399" />
          <KpiCard icon={<AlertTriangle size={18} />} label="Overdue" value={summary.overdue_tasks} sub="tasks past due" color={summary.overdue_tasks > 0 ? "#f87171" : "var(--text-subtle)"} />
        </div>
      )}

      {/* Project grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "14px",
        }}
      >
        {/* New project card */}
        <button
          onClick={onNewProject}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            minHeight: "140px",
            borderRadius: "12px",
            border: "2px dashed var(--border-default)",
            background: "transparent",
            color: "var(--text-subtle)",
            cursor: "pointer",
            fontSize: "13px",
            transition: "border-color .2s, color .2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.color = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default)";
            e.currentTarget.style.color = "var(--text-subtle)";
          }}
        >
          <Plus size={22} />
          New Project
        </button>

        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onClick={() => onSelectProject(p)} />
        ))}
      </div>

    </div>
  );
}

function ProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const progress =
    project.task_count > 0
      ? Math.round((project.done_count / project.task_count) * 100)
      : 0;

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
        cursor: "pointer",
        textAlign: "left",
        transition: "border-color .2s, box-shadow .2s",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = project.color;
        e.currentTarget.style.boxShadow = `0 0 0 1px ${project.color}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: project.color,
        }}
      />

      {/* Name + status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {project.name}
        </span>
        <span
          style={{
            fontSize: "10px",
            padding: "2px 8px",
            borderRadius: "10px",
            background: `${STATUS_COLOR[project.status] || "var(--text-subtle)"}22`,
            color: STATUS_COLOR[project.status] || "var(--text-subtle)",
            fontWeight: 600,
            textTransform: "capitalize",
            flexShrink: 0,
            marginLeft: "8px",
          }}
        >
          {project.status}
        </span>
      </div>

      {/* Description */}
      {project.description && (
        <span
          style={{
            fontSize: "12px",
            color: "var(--text-subtle)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            lineHeight: "1.4",
          }}
        >
          {project.description}
        </span>
      )}

      {/* Progress bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-subtle)" }}>
          <span>
            {project.done_count}/{project.task_count} tasks
          </span>
          <span>{progress}%</span>
        </div>
        <div
          style={{
            width: "100%",
            height: "4px",
            borderRadius: "2px",
            background: "var(--border-default)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              borderRadius: "2px",
              background: project.color,
              transition: "width .3s",
            }}
          />
        </div>
      </div>

      {/* Meta row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "var(--text-subtle)",
        }}
      >
        <span>
          {new Date(project.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        {project.is_owner && (
          <span style={{ color: "var(--accent)", fontWeight: 500 }}>Owner</span>
        )}
      </div>
    </button>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", color }}>
        {icon}
        <span style={{ fontSize: "11px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </span>
      </div>
      <span style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)" }}>
        {value}
      </span>
      <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{sub}</span>
      {/* Bottom accent gradient — matches Finance KPI pattern */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: `linear-gradient(90deg, transparent, ${color}40, transparent)`,
        }}
      />
    </div>
  );
}
