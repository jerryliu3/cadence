export type AppTabKey =
  | "insights"
  | "calendar"
  | "social"
  | "settings";

export interface AppTabDefinition {
  key: AppTabKey;
  href: string;
  label: string;
}

export const APP_TABS: AppTabDefinition[] = [
  { key: "insights", href: "/insights", label: "Insights" },
  { key: "calendar", href: "/calendar", label: "Planner" },
  { key: "social", href: "/social", label: "Challenges" },
  { key: "settings", href: "/settings", label: "Profile" },
];

export const TAB_ORDER = APP_TABS.map((tab) => tab.href);
