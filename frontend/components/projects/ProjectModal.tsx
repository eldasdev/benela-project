"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Project, ProjectStatus } from "@/lib/projects";

interface ProjectModalProps {
  project?: Project | null;
  onSave: (data: {
    name: string;
    description?: string;
    color?: string;
    status?: ProjectStatus;
    due_date?: string | null;
  }) => Promise<void>;
  onClose: () => void;
}

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

const PRESETS = [
  "#7c6aff", "#4f8cff", "#34d399", "#f59e0b",
  "#f87171", "#ec4899", "#8b5cf6", "#06b6d4",
];

export default function ProjectModal({ project, onSave, onClose }: ProjectModalProps) {
  const isEdit = !!project;
  const [name, setName] = useState(project?.name || "");
  const [description, setDescription] = useState(project?.description || "");
  const [color, setColor] = useState(project?.color || "#7c6aff");
  const [status, setStatus] = useState<ProjectStatus>(project?.status || "active");
  const [dueDate, setDueDate] = useState(project?.due_date?.slice(0, 16) || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        status,
        due_date: dueDate || null,
      });
      onClose();
    } catch {
      // toast handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 900,
        background: "var(--overlay-backdrop)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-soft)",
          borderRadius: "14px",
          padding: "24px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
          <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
            {isEdit ? "Edit Project" : "New Project"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-subtle)" }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              autoFocus
              style={inputStyle}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              style={inputStyle}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Due Date</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Color</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: c,
                    border: color === c ? "2px solid var(--text-primary)" : "2px solid transparent",
                    cursor: "pointer",
                    transition: "border .15s",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border-soft)",
              background: "none",
              color: "var(--text-subtle)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: name.trim() && !saving ? "pointer" : "not-allowed",
              opacity: name.trim() && !saving ? 1 : 0.5,
            }}
          >
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
