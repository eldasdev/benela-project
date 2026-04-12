"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { Search, X, Filter } from "lucide-react";
import type { Label, EmployeeMini, TaskPriority } from "@/lib/projects";

interface BoardFiltersProps {
  labels: Label[];
  members: EmployeeMini[];
  filters: BoardFilterState;
  onChange: (f: BoardFilterState) => void;
}

export interface BoardFilterState {
  search: string;
  assigneeIds: number[];
  labelIds: number[];
  priorities: TaskPriority[];
  dueDateFilter: "" | "overdue" | "today" | "this_week" | "no_date";
  myCards: boolean;
}

export const emptyFilters: BoardFilterState = {
  search: "",
  assigneeIds: [],
  labelIds: [],
  priorities: [],
  dueDateFilter: "",
  myCards: false,
};

export function hasActiveFilters(f: BoardFilterState): boolean {
  return (
    f.search !== "" ||
    f.assigneeIds.length > 0 ||
    f.labelIds.length > 0 ||
    f.priorities.length > 0 ||
    f.dueDateFilter !== "" ||
    f.myCards
  );
}

const chipBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "4px 10px",
  borderRadius: "6px",
  fontSize: "12px",
  cursor: "pointer",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border-soft)",
  background: "var(--bg-elevated)",
  color: "var(--text-subtle)",
  whiteSpace: "nowrap",
  transition: "all .15s",
};

const chipActive: CSSProperties = {
  ...chipBase,
  background: "var(--accent-soft)",
  borderColor: "var(--accent)",
  color: "var(--accent)",
};

const DUE_OPTIONS: { value: BoardFilterState["dueDateFilter"]; label: string }[] = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "no_date", label: "No date" },
];

const PRIORITY_OPTIONS: TaskPriority[] = ["urgent", "high", "medium", "low"];

export default function BoardFilters({
  labels,
  members,
  filters,
  onChange,
}: BoardFiltersProps) {
  const [showFilterRow, setShowFilterRow] = useState(false);
  const active = hasActiveFilters(filters);

  const toggle = <K extends keyof BoardFilterState>(
    key: K,
    value: BoardFilterState[K] extends (infer U)[] ? U : never,
  ) => {
    const arr = filters[key] as unknown[];
    const next = arr.includes(value)
      ? arr.filter((v) => v !== value)
      : [...arr, value];
    onChange({ ...filters, [key]: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Top row: search + filter toggle + clear */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <div
          style={{
            position: "relative",
            flex: "1 1 200px",
            maxWidth: "320px",
          }}
        >
          <Search
            size={14}
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-subtle)",
            }}
          />
          <input
            type="text"
            placeholder="Search cards..."
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            style={{
              width: "100%",
              padding: "6px 10px 6px 30px",
              borderRadius: "8px",
              border: "1px solid var(--border-soft)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontSize: "13px",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>

        <button
          onClick={() => setShowFilterRow((p) => !p)}
          style={{
            ...(showFilterRow || active ? chipActive : chipBase),
            padding: "6px 12px",
          }}
        >
          <Filter size={13} />
          Filters
          {active && (
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--accent)",
              }}
            />
          )}
        </button>

        {/* My cards toggle */}
        <button
          onClick={() => onChange({ ...filters, myCards: !filters.myCards })}
          style={filters.myCards ? chipActive : chipBase}
        >
          My cards
        </button>

        {active && (
          <button
            onClick={() => onChange(emptyFilters)}
            style={{
              ...chipBase,
              color: "#f87171",
              borderColor: "rgba(248,113,113,.3)",
            }}
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Expanded filter row */}
      {showFilterRow && (
        <div
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
            padding: "8px 0",
          }}
        >
          {/* Priority */}
          <FilterGroup label="Priority">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => toggle("priorities", p)}
                style={
                  filters.priorities.includes(p) ? chipActive : chipBase
                }
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </FilterGroup>

          {/* Due date */}
          <FilterGroup label="Due date">
            {DUE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() =>
                  onChange({
                    ...filters,
                    dueDateFilter:
                      filters.dueDateFilter === opt.value ? "" : opt.value,
                  })
                }
                style={
                  filters.dueDateFilter === opt.value ? chipActive : chipBase
                }
              >
                {opt.label}
              </button>
            ))}
          </FilterGroup>

          {/* Labels */}
          {labels.length > 0 && (
            <FilterGroup label="Labels">
              {labels.map((l) => (
                <button
                  key={l.id}
                  onClick={() => toggle("labelIds", l.id)}
                  style={{
                    ...(filters.labelIds.includes(l.id)
                      ? chipActive
                      : chipBase),
                    borderLeftWidth: "3px",
                    borderLeftColor: l.color,
                  }}
                >
                  {l.name}
                </button>
              ))}
            </FilterGroup>
          )}

          {/* Assignees */}
          {members.length > 0 && (
            <FilterGroup label="Assignee">
              {members.slice(0, 12).map((m) => (
                <button
                  key={m.id}
                  onClick={() => toggle("assigneeIds", m.id)}
                  style={
                    filters.assigneeIds.includes(m.id) ? chipActive : chipBase
                  }
                >
                  {m.full_name}
                </button>
              ))}
            </FilterGroup>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span style={{ fontSize: "10px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {children}
      </div>
    </div>
  );
}
