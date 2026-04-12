"use client";

import React, { useState, useRef, useCallback, type CSSProperties } from "react";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Plus, X } from "lucide-react";
import KanbanColumn from "./KanbanColumn";
import TaskCard from "./TaskCard";
import {
  moveTask,
  reorderColumns,
  reorderTasksInColumn,
  createColumn,
  type Column,
  type Task,
} from "@/lib/projects";

interface KanbanBoardProps {
  projectId: number;
  columns: Column[];
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onRefresh: () => void;
}

type DragType = "column" | "task";

export default function KanbanBoard({
  projectId,
  columns: columnsProp,
  tasks: tasksProp,
  onTaskClick,
  onRefresh,
}: KanbanBoardProps) {
  const [columns, setColumns] = useState<Column[]>(columnsProp);
  const [tasks, setTasks] = useState<Task[]>(tasksProp);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragTypeRef = useRef<DragType | null>(null);

  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);

  // Sync props into local state when they change
  React.useEffect(() => {
    setColumns(columnsProp);
  }, [columnsProp]);

  React.useEffect(() => {
    setTasks(tasksProp);
  }, [tasksProp]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const sortedColumns = [...columns].sort((a, b) => a.position - b.position);
  const columnIds = sortedColumns.map((c) => `col-${c.id}`);

  function tasksForColumn(colId: number): Task[] {
    return tasks
      .filter((t) => t.column_id === colId)
      .sort((a, b) => a.position - b.position);
  }

  function parseId(id: string): { type: DragType; numId: number } {
    if (id.startsWith("col-"))
      return { type: "column", numId: parseInt(id.slice(4), 10) };
    return { type: "task", numId: parseInt(id.slice(5), 10) };
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);
    dragTypeRef.current = id.startsWith("col-") ? "column" : "task";
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (dragTypeRef.current !== "task") return;

      const { active, over } = event;
      if (!over) return;

      const activeStr = String(active.id);
      const overStr = String(over.id);
      if (activeStr === overStr) return;

      const activeParsed = parseId(activeStr);
      const overParsed = parseId(overStr);

      // Find the column the active task is currently in
      const activeTask = tasks.find((t) => t.id === activeParsed.numId);
      if (!activeTask) return;

      let targetColumnId: number;
      if (overParsed.type === "column") {
        targetColumnId = overParsed.numId;
      } else {
        const overTask = tasks.find((t) => t.id === overParsed.numId);
        if (!overTask) return;
        targetColumnId = overTask.column_id;
      }

      // If dragged to a different column, move it optimistically
      if (activeTask.column_id !== targetColumnId) {
        setTasks((prev) => {
          const updated = prev.map((t) =>
            t.id === activeParsed.numId
              ? { ...t, column_id: targetColumnId }
              : t
          );
          return updated;
        });
      }
    },
    [tasks]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      const currentDragType = dragTypeRef.current;
      dragTypeRef.current = null;

      if (!over || active.id === over.id) {
        // If task was moved to a different column during dragOver but dropped back
        // in the same spot, we still need to persist the cross-column move
        if (currentDragType === "task") {
          const activeParsed = parseId(String(active.id));
          const taskInState = tasks.find((t) => t.id === activeParsed.numId);
          const taskInProps = tasksProp.find((t) => t.id === activeParsed.numId);
          if (
            taskInState &&
            taskInProps &&
            taskInState.column_id !== taskInProps.column_id
          ) {
            const colTasks = tasks
              .filter((t) => t.column_id === taskInState.column_id)
              .sort((a, b) => a.position - b.position);
            const position = colTasks.findIndex((t) => t.id === taskInState.id);
            try {
              await moveTask(
                taskInState.id,
                taskInState.column_id,
                position >= 0 ? position : colTasks.length
              );
              onRefresh();
            } catch {
              onRefresh();
            }
          }
        }
        return;
      }

      const activeStr = String(active.id);
      const overStr = String(over.id);

      if (currentDragType === "column") {
        // Column reorder
        const oldIndex = sortedColumns.findIndex(
          (c) => `col-${c.id}` === activeStr
        );
        const newIndex = sortedColumns.findIndex(
          (c) => `col-${c.id}` === overStr
        );

        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

        const reordered = arrayMove(sortedColumns, oldIndex, newIndex);
        // Optimistic update
        setColumns(
          reordered.map((c, i) => ({ ...c, position: i }))
        );

        try {
          await reorderColumns(
            projectId,
            reordered.map((c) => c.id)
          );
          onRefresh();
        } catch {
          onRefresh();
        }
      } else {
        // Task reorder or cross-column move
        const activeParsed = parseId(activeStr);
        const overParsed = parseId(overStr);

        const activeTask = tasks.find((t) => t.id === activeParsed.numId);
        if (!activeTask) return;

        let targetColumnId: number;
        if (overParsed.type === "column") {
          targetColumnId = overParsed.numId;
        } else {
          const overTask = tasks.find((t) => t.id === overParsed.numId);
          if (!overTask) return;
          targetColumnId = overTask.column_id;
        }

        // Determine new ordering in the target column
        const targetTasks = tasks
          .filter(
            (t) =>
              t.column_id === targetColumnId && t.id !== activeParsed.numId
          )
          .sort((a, b) => a.position - b.position);

        // Calculate the new position
        let insertIndex: number;
        if (overParsed.type === "column") {
          // Dropped on the column itself: append at the end
          insertIndex = targetTasks.length;
        } else {
          const overIndex = targetTasks.findIndex(
            (t) => t.id === overParsed.numId
          );
          insertIndex = overIndex >= 0 ? overIndex : targetTasks.length;
        }

        // Build new order: insert active task at insertIndex
        const newOrder = [...targetTasks];
        newOrder.splice(insertIndex, 0, {
          ...activeTask,
          column_id: targetColumnId,
        });

        // Optimistic update
        setTasks((prev) => {
          const rest = prev.filter(
            (t) =>
              t.id !== activeParsed.numId &&
              !(
                t.column_id === targetColumnId && t.id !== activeParsed.numId
              )
          );
          const updatedTargetTasks = newOrder.map((t, i) => ({
            ...t,
            column_id: targetColumnId,
            position: i,
          }));
          return [...rest, ...updatedTargetTasks];
        });

        const sourceColumnId = tasksProp.find(
          (t) => t.id === activeParsed.numId
        )?.column_id;

        try {
          if (sourceColumnId !== undefined && sourceColumnId !== targetColumnId) {
            // Cross-column move
            await moveTask(activeParsed.numId, targetColumnId, insertIndex);
          } else {
            // Same-column reorder
            await reorderTasksInColumn(
              targetColumnId,
              newOrder.map((t) => t.id)
            );
          }
          onRefresh();
        } catch {
          onRefresh();
        }
      }
    },
    [columns, tasks, tasksProp, sortedColumns, projectId, onRefresh]
  );

  // Find active item for DragOverlay
  const activeColumn = activeId?.startsWith("col-")
    ? sortedColumns.find((c) => `col-${c.id}` === activeId)
    : null;
  const activeTask = activeId?.startsWith("task-")
    ? tasks.find((t) => `task-${t.id}` === activeId)
    : null;

  async function handleAddColumn() {
    const name = newColumnName.trim();
    if (!name || addingColumn) return;
    setAddingColumn(true);
    try {
      await createColumn(projectId, { name });
      setNewColumnName("");
      setShowAddColumn(false);
      onRefresh();
    } catch {
      // keep form open
    } finally {
      setAddingColumn(false);
    }
  }

  const boardStyle: CSSProperties = {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    overflowX: "auto",
    overflowY: "hidden",
    padding: "8px 4px 16px",
    minHeight: 200,
    flex: 1,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div style={boardStyle}>
        <SortableContext
          items={columnIds}
          strategy={horizontalListSortingStrategy}
        >
          {sortedColumns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={tasksForColumn(col.id)}
              projectId={projectId}
              onTaskClick={onTaskClick}
              onRefresh={onRefresh}
            />
          ))}
        </SortableContext>

        {/* Add Column button / form */}
        <div style={{ flexShrink: 0, width: 290 }}>
          {showAddColumn ? (
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-soft)",
                borderRadius: 12,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <input
                autoFocus
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddColumn();
                  if (e.key === "Escape") {
                    setShowAddColumn(false);
                    setNewColumnName("");
                  }
                }}
                placeholder="Column name..."
                style={{
                  fontSize: 13,
                  color: "var(--text-primary)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  outline: "none",
                  fontFamily: "inherit",
                  width: "100%",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={handleAddColumn}
                  disabled={addingColumn || !newColumnName.trim()}
                  style={{
                    padding: "5px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                    background: "var(--accent)",
                    border: "none",
                    borderRadius: 6,
                    cursor:
                      addingColumn || !newColumnName.trim()
                        ? "not-allowed"
                        : "pointer",
                    opacity: addingColumn || !newColumnName.trim() ? 0.5 : 1,
                  }}
                >
                  {addingColumn ? "Adding..." : "Add column"}
                </button>
                <button
                  onClick={() => {
                    setShowAddColumn(false);
                    setNewColumnName("");
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
              onClick={() => setShowAddColumn(true)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-subtle)",
                background: "var(--bg-surface)",
                border: "1px dashed var(--border-soft)",
                borderRadius: 12,
                cursor: "pointer",
                transition: "background 0.12s, color 0.12s, border-color 0.12s",
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = "var(--bg-elevated)";
                btn.style.color = "var(--text-primary)";
                btn.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = "var(--bg-surface)";
                btn.style.color = "var(--text-subtle)";
                btn.style.borderColor = "var(--border-soft)";
              }}
            >
              <Plus size={16} />
              Add Column
            </button>
          )}
        </div>
      </div>

      {/* Drag overlay: ghost preview of dragged item */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            onClick={() => {}}
            isDragOverlay
          />
        ) : activeColumn ? (
          <div
            style={{
              width: 290,
              background: "var(--bg-surface)",
              borderRadius: 12,
              border: "1px solid var(--accent)",
              padding: 14,
              opacity: 0.85,
              boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
              transform: "scale(1.02)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: activeColumn.color || "var(--accent)",
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                {activeColumn.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-subtle)",
                  marginLeft: "auto",
                }}
              >
                {tasksForColumn(activeColumn.id).length} tasks
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
