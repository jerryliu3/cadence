export const MANUAL_PLANNER_UNIT_KEY_PREFIX = "manual:";

export function isManualPlannerUnitKey(unitKey: string | null | undefined) {
  if (typeof unitKey !== "string") {
    return false;
  }
  return unitKey.startsWith(MANUAL_PLANNER_UNIT_KEY_PREFIX);
}
