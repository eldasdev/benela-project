export const READ_NOTIFICATIONS_STORAGE_KEY = "benela-read-notifications-v1";

export function readSeenNotificationIds(): Set<number> {
  if (typeof window === "undefined") return new Set<number>();
  try {
    const raw = window.localStorage.getItem(READ_NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return new Set<number>();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<number>();
    const ids = parsed  
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    return new Set<number>(ids);
  } catch {
    return new Set<number>();
  }
}

export function writeSeenNotificationIds(ids: Set<number>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(READ_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

export function markNotificationsAsRead(ids: number[]): void {
  const existing = readSeenNotificationIds();
  for (const id of ids) {
    if (Number.isInteger(id) && id > 0) existing.add(id);
  }
  writeSeenNotificationIds(existing);
}

export function getUnreadNotificationCount(ids: number[]): number {
  const seen = readSeenNotificationIds();
  return ids.filter((id) => !seen.has(id)).length;
}
