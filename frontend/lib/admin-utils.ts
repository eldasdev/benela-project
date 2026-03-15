export function readErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function formatMoney(value: number, currency = "$", maximumFractionDigits = 0): string {
  return `${currency}${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits })}`;
}

export function formatCompactMoney(value: number): string {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function toDateInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function toIsoOrNull(value: string): string | null {
  if (!value.trim()) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function splitMonthLabel(label: string): { month: string; year: string } {
  const [month, year] = label.split(" ");
  return { month: month || label, year: year || "" };
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
