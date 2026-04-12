"use client";

import React, { type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, MessageSquare, Paperclip, CheckSquare } from "lucide-react";
import type { Task } from "@/lib/projects";

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragOverlay?: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function initialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 52%, 48%)`;
}

function dueDateStatus(
  dueDateStr: string
): "overdue" | "today" | "future" {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueDateStr + (dueDateStr.includes("T") ? "" : "T00:00:00"));
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  if (dueDay < today) return "overdue";
  if (dueDay.getTime() === today.getTime()) return "today";
  return "future";
}

function formatDueDate(dueDateStr: string): string {
  const d = new Date(dueDateStr + (dueDateStr.includes("T") ? "" : "T00:00:00"));
  const mon = d.toLocaleString("en", { month: "short" });
  return `${mon} ${d.getDate()}`;
}

const duePillStyles: Record<
  "overdue" | "today" | "future",
  CSSProperties
> = {
  overdue: {
    background: "rgba(248, 113, 113, 0.18)",
    color: "#f87171",
    border: "1px solid rgba(248, 113, 113, 0.3)",
  },
  today: {
    background: "rgba(251, 146, 60, 0.18)",
    color: "#fb923c",
    border: "1px solid rgba(251, 146, 60, 0.3)",
  },
  future: {
    background: "rgba(255,255,255,0.06)",
    color: "var(--text-subtle)",
    border: "1px solid var(--border-soft)",
  },
};

export default function TaskCard({ task, onClick, isDragOverlay }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `task-${task.id}` });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    ...(isDragOverlay
      ? { transform: "scale(1.03)", boxShadow: "0 16px 40px rgba(0,0,0,0.35)" }
      : {}),
  };

  const visibleLabels = task.labels.slice(0, 4);
  const overflowCount = task.labels.length - 4;

  const cardStyle: CSSProperties = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-soft)",
    borderRadius: 10,
    cursor: "pointer",
    overflow: "hidden",
    transition: "border-color 0.15s, box-shadow 0.15s",
    ...style,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={cardStyle}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 0 0 1px var(--accent-soft), 0 4px 12px rgba(124,106,255,0.1)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-soft)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {/* Cover color stripe */}
      {task.cover_color && (
        <div
          style={{
            height: 4,
            width: "100%",
            background: task.cover_color,
          }}
        />
      )}

      <div style={{ padding: "8px 10px 10px" }}>
        {/* Label pills */}
        {task.labels.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: 6,
            }}
          >
            {visibleLabels.map((label) => (
              <span
                key={label.id}
                style={{
                  display: "inline-block",
                  height: 8,
                  width: 36,
                  borderRadius: 4,
                  background: label.color,
                }}
              />
            ))}
            {overflowCount > 0 && (
              <span
                style={{
                  fontSize: 9,
                  lineHeight: "8px",
                  color: "var(--text-subtle)",
                  fontWeight: 600,
                }}
              >
                +{overflowCount}
              </span>
            )}
          </div>
        )}

        {/* Title */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary)",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            wordBreak: "break-word",
          }}
        >
          {task.title}
        </div>

        {/* Bottom row */}
        {(task.assignee ||
          task.due_date ||
          task.checklist_total > 0 ||
          task.comment_count > 0 ||
          task.attachment_count > 0) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
              fontSize: 11,
              color: "var(--text-subtle)",
              flexWrap: "wrap",
            }}
          >
            {/* Assignee initials */}
            {task.assignee && (
              <div
                title={task.assignee.full_name}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: initialsColor(task.assignee.full_name),
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  letterSpacing: "0.02em",
                }}
              >
                {getInitials(task.assignee.full_name)}
              </div>
            )}

            {/* Due date pill */}
            {task.due_date && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "1px 6px",
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 600,
                  lineHeight: "18px",
                  whiteSpace: "nowrap",
                  ...duePillStyles[dueDateStatus(task.due_date)],
                }}
              >
                <Calendar size={12} style={{ flexShrink: 0 }} />
                {formatDueDate(task.due_date)}
              </span>
            )}

            {/* Checklist progress */}
            {task.checklist_total > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  whiteSpace: "nowrap",
                }}
              >
                <CheckSquare size={12} />
                {task.checklist_done}/{task.checklist_total}
              </span>
            )}

            {/* Comment count */}
            {task.comment_count > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  whiteSpace: "nowrap",
                }}
              >
                <MessageSquare size={12} />
                {task.comment_count}
              </span>
            )}

            {/* Attachment count */}
            {task.attachment_count > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  whiteSpace: "nowrap",
                }}
              >
                <Paperclip size={12} />
                {task.attachment_count}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
