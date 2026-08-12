import { BarChart3, CalendarDays, ListChecks, Settings, Users } from "lucide-react";
import type { ComponentType } from "react";

export type AppTab = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const APP_TABS: AppTab[] = [
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/", label: "Checklist", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/social", label: "Social", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const TAB_ORDER = APP_TABS.map((tab) => tab.href);
