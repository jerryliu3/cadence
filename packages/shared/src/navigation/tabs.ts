export type AppTabKey =
  | "insights"
  | "checklist"
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
  { key: "checklist", href: "/checklist", label: "Checklist" },
  { key: "calendar", href: "/calendar", label: "Calendar" },
  { key: "social", href: "/social", label: "Challenges" },
  { key: "settings", href: "/settings", label: "Profile" },
];

export const TAB_ORDER = APP_TABS.map((tab) => tab.href);
