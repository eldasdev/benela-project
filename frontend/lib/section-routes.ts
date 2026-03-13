import type { Section } from "@/types";

const SECTION_PATHS: Record<Section, string> = {
  dashboard: "/dashboard",
  projects: "/projects",
  finance: "/finance",
  hr: "/hr",
  sales: "/sales",
  support: "/support",
  legal: "/legal",
  marketing: "/marketing",
  supply_chain: "/supply-chain",
  procurement: "/procurement",
  insights: "/insights",
  settings: "/settings",
  marketplace: "/marketplace",
};

export const CLIENT_MODULE_PATHS = new Set<string>([
  SECTION_PATHS.dashboard,
  SECTION_PATHS.projects,
  SECTION_PATHS.finance,
  SECTION_PATHS.hr,
  SECTION_PATHS.sales,
  SECTION_PATHS.support,
  SECTION_PATHS.legal,
  SECTION_PATHS.marketing,
  SECTION_PATHS.supply_chain,
  SECTION_PATHS.procurement,
  SECTION_PATHS.insights,
  SECTION_PATHS.marketplace,
  SECTION_PATHS.settings,
  "/notifications",
]);

export const CLIENT_MODULE_SECTIONS: Section[] = [
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

export function pathForSection(section: Section): string {
  return SECTION_PATHS[section] || SECTION_PATHS.dashboard;
}

export function sectionFromPathname(pathname: string): Section | null {
  const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  const match = (Object.entries(SECTION_PATHS) as Array<[Section, string]>).find(
    ([, path]) => normalized === path || normalized.startsWith(`${path}/`),
  );
  return match ? match[0] : null;
}

export function isClientModulePath(pathname: string): boolean {
  const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  for (const path of CLIENT_MODULE_PATHS) {
    if (normalized === path || normalized.startsWith(`${path}/`)) {
      return true;
    }
  }
  return false;
}
