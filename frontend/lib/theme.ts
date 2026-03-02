export type ThemeId = "obsidian" | "arctic" | "emerald" | "graphite";

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  description: string;
  preview: [string, string, string];
};

export const THEME_STORAGE_KEY = "benela-theme";

export const THEMES: ThemeDefinition[] = [
  {
    id: "obsidian",
    label: "Obsidian",
    description: "Dark, high-contrast workspace for focused operations.",
    preview: ["#080808", "#0f0f0f", "#7c6aff"],
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Cool charcoal with cobalt accents for command-center feel.",
    preview: ["#0a1018", "#151d27", "#4f8cff"],
  },
  {
    id: "emerald",
    label: "Emerald",
    description: "Dark slate with green highlights for analytical workflows.",
    preview: ["#07100d", "#121c18", "#22c55e"],
  },
  {
    id: "arctic",
    label: "Arctic",
    description: "Clean light theme for daytime operations and reporting.",
    preview: ["#f5f7fb", "#ffffff", "#2563eb"],
  },
];

export function isThemeId(value: string | null): value is ThemeId {
  if (!value) return false;
  return THEMES.some((theme) => theme.id === value);
}
