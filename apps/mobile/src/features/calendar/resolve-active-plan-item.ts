import type {
  PlannerContextPayload,
  PlannerWorkUnit,
} from "@cadence/shared/planner/context";

export function resolveActivePlanItem(
  activePlan: PlannerContextPayload["activePlan"],
  unit: PlannerWorkUnit
) {
  if (!activePlan) {
    return null;
  }
  const planGoal = activePlan.goals.find(
    (goal) => goal.original_goal_id === unit.originalGoalId
  );
  if (!planGoal) {
    return null;
  }
  return (
    activePlan.items.find(
      (item) =>
        item.plan_goal_id === planGoal.id &&
        item.unit_key === unit.unitKey
    ) ?? null
  );
}
