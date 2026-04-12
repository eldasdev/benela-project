/**
 * Client-side filtering logic for the kanban board.
 */

import type { Task } from "@/lib/projects";
import type { BoardFilterState } from "./BoardFilters";

export function applyFilters(
  tasks: Task[],
  filters: BoardFilterState,
  currentUserId?: string | null,
): Task[] {
  let filtered = tasks;

  // Search
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q),
    );
  }

  // Assignee
  if (filters.assigneeIds.length > 0) {
    filtered = filtered.filter(
      (t) => t.employee_id != null && filters.assigneeIds.includes(t.employee_id),
    );
  }

  // Labels
  if (filters.labelIds.length > 0) {
    filtered = filtered.filter((t) =>
      t.labels.some((l) => filters.labelIds.includes(l.id)),
    );
  }

  // Priority
  if (filters.priorities.length > 0) {
    filtered = filtered.filter((t) => filters.priorities.includes(t.priority));
  }

  // Due date
  if (filters.dueDateFilter) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86400000);
    const endOfWeek = new Date(startOfToday.getTime() + 7 * 86400000);

    filtered = filtered.filter((t) => {
      if (filters.dueDateFilter === "no_date") return !t.due_date;
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      switch (filters.dueDateFilter) {
        case "overdue":
          return d < startOfToday && !t.completed_at;
        case "today":
          return d >= startOfToday && d < endOfToday;
        case "this_week":
          return d >= startOfToday && d < endOfWeek;
        default:
          return true;
      }
    });
  }

  // My cards
  if (filters.myCards && currentUserId) {
    filtered = filtered.filter(
      (t) => t.assignee?.email === currentUserId || t.employee_id != null,
    );
  }

  return filtered;
}
