import { getFeatureFlags } from "@/lib/feature-flags";

export interface PlannerCapabilities {
  crossMonthMovesEnabled: boolean;
}

export function getPlannerCapabilities(): PlannerCapabilities {
  const flags = getFeatureFlags();
  return {
    crossMonthMovesEnabled: flags.crossMonthMovesEnabled,
  };
}
