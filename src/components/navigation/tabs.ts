import { BarChart3, CalendarDays, Trophy, User } from "lucide-react";
import type { ComponentType } from "react";
import {
  APP_TABS as SHARED_APP_TABS,
  TAB_ORDER as SHARED_TAB_ORDER,
  type AppTabDefinition,
} from "@cadence/shared/navigation/tabs";

const WEB_TAB_ICONS: Record<
  AppTabDefinition["key"],
  ComponentType<{ className?: string }>
> = {
  insights: BarChart3,
  calendar: CalendarDays,
  social: Trophy,
  settings: User,
};

export type AppTab = AppTabDefinition & {
  icon: ComponentType<{ className?: string }>;
};

export const APP_TABS: AppTab[] = SHARED_APP_TABS.map((tab) => ({
  ...tab,
  icon: WEB_TAB_ICONS[tab.key],
}));

export const TAB_ORDER = SHARED_TAB_ORDER;
