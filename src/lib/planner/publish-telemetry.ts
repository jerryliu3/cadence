import type { PlannerWorkUnit } from "@/lib/planner/work-units";

export interface PlannerPublishTelemetryCounts {
  workUnits: number;
  placedUnits: number;
  shortfallUnits: number;
  timedUnits: number;
}

export function buildPlannerPublishTelemetryCounts(
  workUnits: PlannerWorkUnit[]
): PlannerPublishTelemetryCounts {
  const workUnitCount = workUnits.length;
  const placedUnits = workUnits.filter(
    (unit) => unit.scheduledDate !== null
  ).length;
  const timedUnits = workUnits.filter(
    (unit) => unit.effectiveScheduledLocalTime != null
  ).length;
  return {
    workUnits: workUnitCount,
    placedUnits,
    shortfallUnits: workUnitCount - placedUnits,
    timedUnits,
  };
}
