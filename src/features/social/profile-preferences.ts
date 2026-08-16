import type { PlannerPrimaryTabPreference } from "@cadence/shared/navigation/tabs";

export function buildProfilePreferencesUpdate({
  plannerPrimaryTabDirty,
  socialActivityVisibleDirty,
  plannerPrimaryTab,
  socialActivityVisible,
}: {
  plannerPrimaryTabDirty: boolean;
  socialActivityVisibleDirty: boolean;
  plannerPrimaryTab: PlannerPrimaryTabPreference;
  socialActivityVisible: boolean;
}) {
  if (!plannerPrimaryTabDirty && !socialActivityVisibleDirty) {
    return null;
  }

  return {
    ...(plannerPrimaryTabDirty
      ? { planner_primary_tab: plannerPrimaryTab }
      : null),
    ...(socialActivityVisibleDirty
      ? { social_activity_visible: socialActivityVisible }
      : null),
  };
}
