import { BarChart3, CalendarDays, ListChecks, Trophy, User } from "lucide-react";
import type { ComponentType } from "react";
import {
  APP_TABS as SHARED_APP_TABS,
  buildAppTabs as buildSharedAppTabs,
  resolveDefaultMainPageHref as resolveSharedDefaultMainPageHref,
  TAB_ORDER as SHARED_TAB_ORDER,
  type DefaultMainPagePreference,
  type PlannerPrimaryTabPreference,
  type AppTabDefinition,
} from "@cadence/shared/navigation/tabs";

const WEB_TAB_ICONS: Record<
  AppTabDefinition["key"],
  ComponentType<{ className?: string }>
> = {
  insights: BarChart3,
  checklist: ListChecks,
  calendar: CalendarDays,
  social: Trophy,
  settings: User,
};

export type AppTab = AppTabDefinition & {
  icon: ComponentType<{ className?: string }>;
};

function withIcon(tab: AppTabDefinition): AppTab {
  return { ...tab, icon: WEB_TAB_ICONS[tab.key] };
}

export function buildAppTabs(
  plannerPrimaryTab?: PlannerPrimaryTabPreference
): AppTab[] {
  return buildSharedAppTabs(plannerPrimaryTab).map(withIcon);
}

export function resolveDefaultMainPageHref(
  preference: DefaultMainPagePreference
): string {
  return resolveSharedDefaultMainPageHref(preference);
}

export const APP_TABS: AppTab[] = SHARED_APP_TABS.map(withIcon);

export const TAB_ORDER = SHARED_TAB_ORDER;
