"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

function mergeStyles(...styles: Array<CSSProperties | undefined>): CSSProperties {
  return Object.assign({}, ...styles);
}

function useFloatingLayer(open: boolean) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);
}

export function AdminPageHero({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="admin-ui-surface admin-ui-hero">
      <div>
        {eyebrow ? <div className="admin-ui-eyebrow">{eyebrow}</div> : null}
        <h1 className="admin-ui-title">{title}</h1>
        {subtitle ? <p className="admin-ui-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="admin-ui-actions">{actions}</div> : null}
    </section>
  );
}

export function AdminMetricGrid({ children, columns = "repeat(auto-fit, minmax(190px, 1fr))" }: { children: ReactNode; columns?: string }) {
  return (
    <div className="admin-ui-metric-grid" style={{ gridTemplateColumns: columns }}>
      {children}
    </div>
  );
}

export function AdminMetricCard({
  label,
  value,
  detail,
  tone = "accent",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <section className={`admin-ui-surface admin-ui-metric admin-ui-tone-${tone}`}>
      <div className="admin-ui-metric-label">{label}</div>
      <div className="admin-ui-metric-value">{value}</div>
      {detail ? <div className="admin-ui-metric-detail">{detail}</div> : null}
    </section>
  );
}

export function AdminSectionCard({
  title,
  eyebrow,
  description,
  actions,
  children,
  className = "",
  contentStyle,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentStyle?: CSSProperties;
}) {
  return (
    <section className={`admin-ui-surface admin-ui-section ${className}`.trim()}>
      <header className="admin-ui-section-header">
        <div>
          {eyebrow ? <div className="admin-ui-eyebrow">{eyebrow}</div> : null}
          <h2 className="admin-ui-section-title">{title}</h2>
          {description ? <p className="admin-ui-section-subtitle">{description}</p> : null}
        </div>
        {actions ? <div className="admin-ui-actions">{actions}</div> : null}
      </header>
      <div className="admin-ui-section-content" style={contentStyle}>{children}</div>
    </section>
  );
}

export function AdminToolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`admin-ui-toolbar ${className}`.trim()}>{children}</div>;
}

export function AdminFilterBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`admin-ui-filter-bar ${className}`.trim()}>{children}</div>;
}

export function AdminPill({
  label,
  tone = "neutral",
}: {
  label: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger" | "neutral";
}) {
  return <span className={`admin-ui-pill admin-ui-pill-${tone}`}>{label}</span>;
}

export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-ui-empty">
      <div className="admin-ui-empty-title">{title}</div>
      {description ? <div className="admin-ui-empty-description">{description}</div> : null}
      {action ? <div className="admin-ui-empty-action">{action}</div> : null}
    </div>
  );
}

export function AdminDataTable({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`admin-ui-table ${className}`.trim()}>{children}</div>;
}

export function AdminTableHead({ columns, className = "" }: { columns: ReactNode[]; className?: string }) {
  return <div className={`admin-ui-table-head ${className}`.trim()}>{columns}</div>;
}

export function AdminTableRow({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`admin-ui-table-row ${className}`.trim()} style={style}>{children}</div>;
}

export function AdminChartSurface({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`admin-ui-chart ${className}`.trim()} style={style}>{children}</div>;
}

export function AdminStatStrip({ children }: { children: ReactNode }) {
  return <div className="admin-ui-stat-strip">{children}</div>;
}

export function AdminActionMenu({ children }: { children: ReactNode }) {
  return <div className="admin-ui-action-menu">{children}</div>;
}

export function AdminModal({
  open,
  onClose,
  title,
  description,
  width = 820,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  width?: number;
  children: ReactNode;
}) {
  useFloatingLayer(open);
  if (!open) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="admin-ui-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-ui-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: `${width}px` }}
      >
        <div className="admin-ui-modal-head">
          <div>
            <h3 className="admin-ui-modal-title">{title}</h3>
            {description ? <p className="admin-ui-modal-subtitle">{description}</p> : null}
          </div>
          <button type="button" className="admin-ui-ghost-btn" onClick={onClose}>Close</button>
        </div>
        <div className="admin-ui-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function AdminDrawer({
  open,
  onClose,
  title,
  description,
  width = 520,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  width?: number;
  children: ReactNode;
}) {
  useFloatingLayer(open);
  if (!open) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="admin-ui-overlay" role="presentation" onClick={onClose}>
      <aside
        className="admin-ui-drawer"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{ width: `min(${width}px, 92vw)` }}
      >
        <div className="admin-ui-modal-head">
          <div>
            <h3 className="admin-ui-modal-title">{title}</h3>
            {description ? <p className="admin-ui-modal-subtitle">{description}</p> : null}
          </div>
          <button type="button" className="admin-ui-ghost-btn" onClick={onClose}>Close</button>
        </div>
        <div className="admin-ui-modal-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

export function AdminConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
}) {
  if (!open) return null;
  return (
    <AdminModal open={open} onClose={onClose} title={title} description={description} width={520}>
      <div className="admin-ui-confirm-row">
        <button type="button" className="admin-ui-ghost-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="admin-ui-danger-btn" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </AdminModal>
  );
}

export const adminButtonStyles = {
  primary: {
    border: "1px solid color-mix(in srgb, var(--accent) 48%, transparent)",
    background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 90%, #fff 10%), color-mix(in srgb, var(--accent-2) 74%, var(--accent) 26%))",
    color: "white",
    boxShadow: "0 16px 30px color-mix(in srgb, var(--accent) 28%, transparent)",
  } satisfies CSSProperties,
  secondary: {
    border: "1px solid var(--border-default)",
    background: "color-mix(in srgb, var(--bg-surface) 86%, var(--accent-soft) 14%)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  ghost: {
    border: "1px solid color-mix(in srgb, var(--border-default) 76%, transparent)",
    background: "transparent",
    color: "var(--text-subtle)",
  } satisfies CSSProperties,
  danger: {
    border: "1px solid color-mix(in srgb, var(--danger) 45%, transparent)",
    background: "color-mix(in srgb, var(--danger) 16%, transparent)",
    color: "var(--danger)",
  } satisfies CSSProperties,
};

export function adminButtonStyle(kind: keyof typeof adminButtonStyles, extra?: CSSProperties): CSSProperties {
  return mergeStyles(
    {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      minHeight: "40px",
      borderRadius: "12px",
      padding: "0 14px",
      fontSize: "13px",
      fontWeight: 600,
      cursor: "pointer",
      textDecoration: "none",
      transition: "all 0.16s ease",
      whiteSpace: "nowrap",
    },
    adminButtonStyles[kind],
    extra,
  );
}

export function adminInputStyle(extra?: CSSProperties): CSSProperties {
  return mergeStyles(
    {
      width: "100%",
      minHeight: "44px",
      borderRadius: "12px",
      border: "1px solid var(--border-default)",
      background: "color-mix(in srgb, var(--bg-surface) 90%, var(--accent-soft) 10%)",
      color: "var(--text-primary)",
      padding: "0 14px",
      fontSize: "14px",
      outline: "none",
    },
    extra,
  );
}
