import { Section } from "@/types";

export type ClientSection = Exclude<Section, "settings">;

export type NotificationSettings = {
  product_updates: boolean;
  weekly_digest: boolean;
  security_alerts: boolean;
  billing_alerts: boolean;
};

export type ClientSettings = {
  workspaceId: string;
  defaultSection: ClientSection;
  notifications: NotificationSettings;
};

export const CLIENT_SETTINGS_STORAGE_KEY = "benela-client-settings-v1";

export const CLIENT_SECTIONS: ClientSection[] = [
  "dashboard",
  "projects",
  "finance",
  "hr",
  "sales",
  "support",
  "legal",
  "marketing",
  "supply_chain",
  "procurement",
  "insights",
  "marketplace",
];

export const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  workspaceId: "",
  defaultSection: "dashboard",
  notifications: {
    product_updates: true,
    weekly_digest: true,
    security_alerts: true,
    billing_alerts: true,
  },
};

export function isClientSection(value: string | null): value is ClientSection {
  return value !== null && CLIENT_SECTIONS.includes(value as ClientSection);
}

export function readClientSettings(): ClientSettings {
  if (typeof window === "undefined") return DEFAULT_CLIENT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(CLIENT_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_CLIENT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ClientSettings> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_CLIENT_SETTINGS;

    const normalizedWorkspaceId =
      typeof parsed.workspaceId === "string" ? parsed.workspaceId.trim() : "";
    const workspaceId =
      normalizedWorkspaceId && normalizedWorkspaceId !== "default-workspace"
        ? normalizedWorkspaceId
        : DEFAULT_CLIENT_SETTINGS.workspaceId;

    const rawDefaultSection =
      typeof parsed.defaultSection === "string" ? parsed.defaultSection : null;
    const defaultSection: ClientSection = isClientSection(rawDefaultSection)
      ? rawDefaultSection
      : DEFAULT_CLIENT_SETTINGS.defaultSection;

    const notificationsRaw = parsed.notifications;
    const notifications = {
      product_updates:
        typeof notificationsRaw?.product_updates === "boolean"
          ? notificationsRaw.product_updates
          : DEFAULT_CLIENT_SETTINGS.notifications.product_updates,
      weekly_digest:
        typeof notificationsRaw?.weekly_digest === "boolean"
          ? notificationsRaw.weekly_digest
          : DEFAULT_CLIENT_SETTINGS.notifications.weekly_digest,
      security_alerts:
        typeof notificationsRaw?.security_alerts === "boolean"
          ? notificationsRaw.security_alerts
          : DEFAULT_CLIENT_SETTINGS.notifications.security_alerts,
      billing_alerts:
        typeof notificationsRaw?.billing_alerts === "boolean"
          ? notificationsRaw.billing_alerts
          : DEFAULT_CLIENT_SETTINGS.notifications.billing_alerts,
    };

    return {
      workspaceId,
      defaultSection,
      notifications,
    };
  } catch {
    return DEFAULT_CLIENT_SETTINGS;
  }
}

export function saveClientSettings(settings: ClientSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLIENT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function getClientWorkspaceId(): string {
  return readClientSettings().workspaceId;
}

export function hasClientWorkspaceId(): boolean {
  return Boolean(getClientWorkspaceId().trim());
}
