import { getFeatureFlags } from "@/lib/feature-flags";

export interface PlannerCapabilities {
  calendarEnabled: boolean;
  crossMonthMovesEnabled: boolean;
}

export function getPlannerCapabilities(): PlannerCapabilities {
  const flags = getFeatureFlags();
  return {
    calendarEnabled: flags.calendarEnabled,
    crossMonthMovesEnabled: flags.crossMonthMovesEnabled,
  };
}
