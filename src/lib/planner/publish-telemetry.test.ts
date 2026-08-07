import { describe, expect, it } from "vitest";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";
import { buildPlannerPublishTelemetryCounts } from "@/lib/planner/publish-telemetry";

function workUnit(overrides: Partial<PlannerWorkUnit>): PlannerWorkUnit {
  return {
    originalGoalId: "goal-a",
    requirementSchemaVersion: "1",
    requirementFingerprint: "fingerprint",
    unitKey: "total:1",
    kind: "deadline_total",
    ordinal: 1,
    periodKey: null,
    label: null,
    creditWindow: { start: "2026-08-01", end: "2026-08-31" },
    placementWindow: null,
    draftMoveWindow: null,
    classification: "open",
    missPolicy: "roll_forward",
    restEligible: true,
    maxPerDay: 1,
    creditedCompletionId: null,
    creditedCompletionDate: null,
    creditState: "uncredited",
    scheduledDate: null,
    locked: false,
    ...overrides,
  };
}

describe("buildPlannerPublishTelemetryCounts", () => {
  it("counts only explicitly timed units", () => {
    const counts = buildPlannerPublishTelemetryCounts([
      workUnit({
        unitKey: "total:1",
        scheduledDate: "2026-08-02",
        effectiveScheduledLocalTime: "08:00",
      }),
      workUnit({
        unitKey: "total:2",
        scheduledDate: "2026-08-03",
        effectiveScheduledLocalTime: null,
      }),
      workUnit({
        unitKey: "total:3",
        scheduledDate: null,
      }),
    ]);

    expect(counts).toEqual({
      workUnits: 3,
      placedUnits: 2,
      shortfallUnits: 1,
      timedUnits: 1,
    });
  });
});
