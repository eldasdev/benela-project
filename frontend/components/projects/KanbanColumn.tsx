"use client";

import React, { useState, useRef, useEffect, type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { MoreHorizontal, Plus, X } from "lucide-react";
import TaskCard from "./TaskCard";
import {
  createTask,
  updateColumn,
  deleteColumn,
  type Column,
  type Task,
} from "@/lib/projects";

interface KanbanColumnProps {
  column: Column;
  tasks: Task[];
  projectId: number;
  onTaskClick: (task: Task) => void;
  onRefresh: () => void;
}

export default function KanbanColumn({
  column,
  tasks,
  projectId,
  onTaskClick,
  onRefresh,
}: KanbanColumnProps) {
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [addingCard, setAddingCard] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(column.name);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `col-${column.id}` });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  const taskIds = tasks.map((t) => `task-${t.id}`);

  useEffect(() => {
    if (showAddCard && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showAddCard]);

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  async function handleAddCard() {
    const title = newCardTitle.trim();
    if (!title || addingCard) return;
    setAddingCard(true);
    try {
      await createTask(projectId, {
        column_id: column.id,
        title,
      });
      setNewCardTitle("");
      setShowAddCard(false);
      onRefresh();
    } catch {
      // keep form open so user can retry
    } finally {
      setAddingCard(false);
    }
  }

  function handleCardKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddCard();
    }
    if (e.key === "Escape") {
      setNewCardTitle("");
      setShowAddCard(false);
    }
  }

  async function handleRename() {
    const name = editName.trim();
    if (!name || name === column.name) {
      setEditing(false);
      setEditName(column.name);
      return;
    }
    try {
      await updateColumn(column.id, { name });
      setEditing(false);
      onRefresh();
    } catch {
      setEditing(false);
      setEditName(column.name);
    }
  }

  async function handleDelete() {
    setMenuOpen(false);
    const ok = window.confirm(
      `Delete column "${column.name}" and all its tasks?`
    );
    if (!ok) return;
    try {
      await deleteColumn(column.id);
      onRefresh();
    } catch {
      // swallow
    }
  }

  const columnStyle: CSSProperties = {
    width: 290,
    minHeight: 100,
    flexShrink: 0,
    background: "var(--bg-surface)",
    borderRadius: 12,
    border: "1px solid var(--border-soft)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100vh - 160px)",
    ...style,
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px 8px",
    cursor: "grab",
  };

  const bodyStyle: CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "0 8px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minHeight: 24,
  };

  const footerStyle: CSSProperties = {
    padding: "4px 8px 8px",
  };

  return (
    <div ref={setNodeRef} style={columnStyle}>
      {/* Header */}
      <div style={headerStyle} {...attributes} {...listeners}>
        {/* Colored dot */}
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: column.color || "var(--accent)",
            flexShrink: 0,
          }}
        />

        {/* Column name or edit input */}
        {editing ? (
          <input
            ref={editInputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") {
                setEditing(false);
                setEditName(column.name);
              }
            }}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--accent)",
              borderRadius: 6,
              padding: "2px 6px",
              outline: "none",
            }}
          />
        ) : (
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {column.name}
          </span>
        )}

        {/* Task count badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-subtle)",
            background: "var(--bg-elevated)",
            borderRadius: 6,
            padding: "1px 7px",
            lineHeight: "18px",
            flexShrink: 0,
          }}
        >
          {tasks.length}
        </span>

        {/* Menu button */}
        <div style={{ position: "relative", flexShrink: 0 }} ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-subtle)",
              cursor: "pointer",
              padding: 2,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MoreHorizontal size={16} />
          </button>

          {menuOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                zIndex: 50,
                marginTop: 4,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                minWidth: 140,
                overflow: "hidden",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setEditing(true);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  color: "var(--text-primary)",
                  padding: "8px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--accent-soft)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "none";
                }}
              >
                Rename column
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  color: "var(--danger)",
                  padding: "8px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--danger-soft-bg)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "none";
                }}
              >
                Delete column
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Body - tasks */}
      <div style={bodyStyle}>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </SortableContext>
      </div>

      {/* Footer - quick add */}
      <div style={footerStyle}>
        {showAddCard ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              ref={textareaRef}
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={handleCardKeyDown}
              placeholder="Enter a title..."
              rows={2}
              style={{
                width: "100%",
                resize: "none",
                fontSize: 13,
                color: "var(--text-primary)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: 8,
                padding: "8px 10px",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={handleAddCard}
                disabled={addingCard || !newCardTitle.trim()}
                style={{
                  padding: "5px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: 6,
                  cursor:
                    addingCard || !newCardTitle.trim()
                      ? "not-allowed"
                      : "pointer",
                  opacity: addingCard || !newCardTitle.trim() ? 0.5 : 1,
                }}
              >
                {addingCard ? "Adding..." : "Add card"}
              </button>
              <button
                onClick={() => {
                  setShowAddCard(false);
                  setNewCardTitle("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-subtle)",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddCard(true)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 8px",
              fontSize: 12,
              color: "var(--text-subtle)",
              background: "none",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--bg-elevated)";
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "none";
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--text-subtle)";
            }}
          >
            <Plus size={14} />
            Add a card
          </button>
        )}
      </div>
    </div>
  );
}
