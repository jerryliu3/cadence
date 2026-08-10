import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import { remapGoalDatesForDraftMove } from "@/features/planner/draft-move-remap";
import { runPlannerKernel, type PlannerKernelInput } from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";

function goal(): Goal {
  return {
    id: "goal-a", owner_id: "owner-a", title: "Practice presentation",
    description: null, category: "Personal", color: null,
    frequency_type: "recurring", recurrence_interval: "daily",
    target_count: 12, milestone_names: null,
    start_date: "2026-08-01", end_date: "2026-08-31", photo_path: null,
    is_group: false, is_deleted: false, archived_at: null,
    created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  };
}
function input(o: Partial<PlannerKernelInput> = {}): PlannerKernelInput {
  return {
    schemaVersion: "1", eligibilityMode: "overlap_v1", ownerId: "owner-a",
    scopeMonth: "2026-08", asOfDate: "2026-08-01", timezone: "UTC",
    goals: [goal()], completions: [], links: [],
    policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00Z"),
    basePlan: null, ...o,
  };
}

// Regression: pinning a single ordinal to a later date used to drag every
// later ordinal with it, so moving one session shifted a week's worth.
describe("dragging one session of a 12-session goal", () => {
  it("changes exactly one occupied date", () => {
    const before = runPlannerKernel(input());
    const beforeDates = before.workUnits
      .map((unit) => unit.scheduledDate)
      .filter((date): date is string => date !== null);

    const dragged = before.workUnits[2];
    const target = "2026-08-19";
    const pinned = remapGoalDatesForDraftMove({
      units: before.workUnits.map((unit, index) => ({
        unitKey: unit.unitKey,
        ordinal: index,
        scheduledDate: unit.scheduledDate as string,
      })),
      movedUnitKey: dragged.unitKey,
      nextDate: target,
    });

    const after = runPlannerKernel(
      input({
        draftPinnedDates: Object.fromEntries(
          Object.entries(pinned).map(([unitKey, date]) => [
            `goal-a:${unitKey}`,
            date,
          ])
        ),
      })
    );
    const afterDates = after.workUnits
      .map((unit) => unit.scheduledDate)
      .filter((date): date is string => date !== null);

    const released = beforeDates.filter((date) => !afterDates.includes(date));
    const taken = afterDates.filter((date) => !beforeDates.includes(date));

    expect(released).toEqual([dragged.scheduledDate]);
    expect(taken).toEqual([target]);
    expect(afterDates).toHaveLength(beforeDates.length);
  });
});
