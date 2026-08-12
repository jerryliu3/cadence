import { BarChart3, CalendarDays, ListChecks, Trophy, User } from "lucide-react";
import type { ComponentType } from "react";

export type AppTab = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const APP_TABS: AppTab[] = [
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/checklist", label: "Checklist", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/social", label: "Challenges", icon: Trophy },
  { href: "/settings", label: "Profile", icon: User },
];

export const TAB_ORDER = APP_TABS.map((tab) => tab.href);
