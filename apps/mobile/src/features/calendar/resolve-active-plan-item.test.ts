import { describe, expect, it } from "vitest";
import type {
  PlannerContextPayload,
  PlannerWorkUnit,
} from "@cadence/shared/planner/context";
import { resolveActivePlanItem } from "./resolve-active-plan-item";

const activePlan: NonNullable<PlannerContextPayload["activePlan"]> = {
  plan: { id: "plan-1", version: 1, status: "active" },
  goals: [
    {
      id: "plan-goal-1",
      goal_id: "goal-1",
      original_goal_id: "goal-1",
      requirement_fingerprint: "fingerprint-1",
      title: "Run",
      category: "Fitness",
      color: null,
    },
    {
      id: "plan-goal-2",
      goal_id: "goal-2",
      original_goal_id: "goal-2",
      requirement_fingerprint: "fingerprint-2",
      title: "Read",
      category: "Learning",
      color: null,
    },
  ],
  items: [
    {
      id: "item-1",
      plan_goal_id: "plan-goal-1",
      unit_key: "total:1",
      requirement_kind: "deadline_total",
      scheduled_date: "2026-08-20",
      classification: "scheduled",
      credit_state: "uncredited",
      locked: false,
      revision: 1,
      credited_completion_id: null,
      credited_completion_date: null,
    },
    {
      id: "item-2",
      plan_goal_id: "plan-goal-2",
      unit_key: "total:1",
      requirement_kind: "deadline_total",
      scheduled_date: "2026-08-21",
      classification: "scheduled",
      credit_state: "uncredited",
      locked: true,
      revision: 1,
      credited_completion_id: null,
      credited_completion_date: null,
    },
  ],
};

describe("resolveActivePlanItem", () => {
  it("matches both the original goal and unit key", () => {
    const unit: PlannerWorkUnit = {
      originalGoalId: "goal-2",
      unitKey: "total:1",
      label: "Read",
      scheduledDate: "2026-08-21",
      classification: "scheduled",
      creditState: "uncredited",
    };

    expect(resolveActivePlanItem(activePlan, unit)?.id).toBe("item-2");
  });
});
