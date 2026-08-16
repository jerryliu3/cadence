export type AppTabKey =
  | "insights"
  | "calendar"
  | "social"
  | "settings";

export type PlannerPrimaryTabPreference = "calendar" | "checklist";

export interface AppTabDefinition {
  key: AppTabKey;
  href: string;
  label: string;
}

const TAB_BY_KEY: Record<AppTabKey, AppTabDefinition> = {
  insights: { key: "insights", href: "/insights", label: "Insights" },
  calendar: { key: "calendar", href: "/calendar", label: "Planner" },
  social: { key: "social", href: "/social", label: "Community" },
  settings: { key: "settings", href: "/settings", label: "Profile" },
};

export const DEFAULT_PLANNER_PRIMARY_TAB_PREFERENCE: PlannerPrimaryTabPreference =
  "checklist";

export function normalizePlannerPrimaryTabPreference(
  value: string | null | undefined
): PlannerPrimaryTabPreference {
  if (value === "calendar" || value === "checklist") {
    return value;
  }
  return DEFAULT_PLANNER_PRIMARY_TAB_PREFERENCE;
}

export function buildAppTabs(
  plannerPrimaryTab: PlannerPrimaryTabPreference = DEFAULT_PLANNER_PRIMARY_TAB_PREFERENCE
): AppTabDefinition[] {
  void plannerPrimaryTab;
  const orderedKeys: AppTabKey[] = [
    "insights",
    "calendar",
    "social",
    "settings",
  ];
  return orderedKeys.map((key) => TAB_BY_KEY[key]);
}

export const APP_TABS: AppTabDefinition[] = buildAppTabs();

export const TAB_ORDER = APP_TABS.map((tab) => tab.href);
