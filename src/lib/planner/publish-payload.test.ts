import { describe, expect, it } from "vitest";
import type { Goal, Completion } from "@/lib/goals/types";
import type { PlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import type { PlannerKernelOutput } from "@/lib/planner/kernel";
import {
  PlannerDraftEditValidationError,
  buildPlannerPublishPersistencePayload,
} from "@/lib/planner/publish-payload";

const GOAL_ID = "12000000-0000-4000-8000-000000000001";

const baseGoal: Goal = {
  id: GOAL_ID,
  owner_id: "11111111-1111-4111-8111-111111111111",
  title: "Run 20 times",
  description: null,
  category: "Health",
  color: null,
  frequency_type: "recurring",
  recurrence_interval: "weekly",
  target_count: 20,
  milestone_names: null,
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  photo_path: null,
  is_group: false,
  is_deleted: false,
  archived_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

function createSnapshot(
  completions: Completion[],
  goalOverrides: Partial<Goal> = {}
): PlannerCanonicalSnapshot {
  return {
    goals: [{ ...baseGoal, ...goalOverrides }],
    completions,
    links: [],
    revisions: { canonicalRevision: 0, executionRevision: 0 },
    preferences: null,
    activePlan: null,
  };
}

function createKernel(scheduledDate: string): PlannerKernelOutput {
  return {
    eligibilityMode: "overlap_v1",
    eligibility: [{ goalId: GOAL_ID, eligible: true, reason: "eligible" }],
    scopeState: "current",
    workUnits: [
      {
        originalGoalId: GOAL_ID,
        requirementSchemaVersion: "1",
        requirementFingerprint: "a".repeat(64),
        unitKey: "total:1",
        kind: "deadline_total",
        ordinal: 1,
        periodKey: null,
        label: "Run",
        creditWindow: { start: "2026-08-01", end: "2026-08-31" },
        placementWindow: { start: "2026-08-01", end: "2026-08-31" },
        draftMoveWindow: { start: "2026-08-01", end: "2026-08-31" },
        classification: "open",
        missPolicy: "roll_forward",
        restEligible: true,
        maxPerDay: 1,
        creditedCompletionId: null,
        creditedCompletionDate: null,
        creditState: "uncredited",
        scheduledDate,
        locked: false,
      },
    ],
    solver: {
      issueCodes: [],
      confirmationRequired: false,
      publishable: true,
    },
    diff: [],
  } as unknown as PlannerKernelOutput;
}

describe("buildPlannerPublishPersistencePayload draft edit validation", () => {
  it("applies item-level time override draft commands", () => {
    const snapshot = createSnapshot([]);
    const kernel = createKernel("2026-08-10");

    const payload = buildPlannerPublishPersistencePayload({
      kernel,
      snapshot,
      draftCommands: [
        {
          id: "30000000-0000-4000-8000-000000000014",
          sequence: 1,
          kind: "set_item_time_override",
          goalId: GOAL_ID,
          unitKey: "total:1",
          localTime: "18:30",
        },
      ],
    });

    expect(payload.changeSummary.draftRetimed).toBe(1);
    expect(payload.items.find((item) => item.unit_key === "total:1")).toMatchObject({
      scheduled_time_override: "18:30",
      effective_scheduled_local_time: "18:30",
      effective_scheduled_at_local: "2026-08-10T18:30:00",
    });
  });

  it("uses goal default time when no item override exists", () => {
    const snapshot = createSnapshot([], { default_local_time: "07:15" });
    const kernel = createKernel("2026-08-10");

    const payload = buildPlannerPublishPersistencePayload({
      kernel,
      snapshot,
      draftCommands: [],
    });

    expect(payload.items.find((item) => item.unit_key === "total:1")).toMatchObject({
      scheduled_time_override: null,
      effective_scheduled_local_time: "07:15",
      effective_scheduled_at_local: "2026-08-10T07:15:00",
    });
  });

  it("rejects draft retiming for completed or historical units", () => {
    const snapshot = createSnapshot([]);
    const kernel = {
      ...createKernel("2026-08-10"),
      workUnits: [
        {
          ...createKernel("2026-08-10").workUnits[0],
          creditState: "completed_as_scheduled" as const,
        },
      ],
    } as PlannerKernelOutput;

    expect(() =>
      buildPlannerPublishPersistencePayload({
        kernel,
        snapshot,
        draftCommands: [
          {
            id: "30000000-0000-4000-8000-000000000015",
            sequence: 1,
            kind: "set_item_time_override",
            goalId: GOAL_ID,
            unitKey: "total:1",
            localTime: "23:45",
          },
        ],
      })
    ).toThrowError(PlannerDraftEditValidationError);
  });
});

describe("positional draft moves are kernel-owned", () => {
  it("refuses a move command that reached publish unresolved", () => {
    const kernel = createKernel("2026-08-05");
    const snapshot = createSnapshot([]);

    expect(() =>
      buildPlannerPublishPersistencePayload({
        kernel,
        snapshot,
        draftCommands: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            sequence: 1,
            kind: "move_item",
            goalId: GOAL_ID,
            unitKey: "total:1",
            scheduledDate: "2026-08-20",
          },
        ],
      })
    ).toThrowError(
      expect.objectContaining({ code: "draft_item_move_unsupported" })
    );
  });

  it("accepts a move command the kernel already resolved", () => {
    const kernel = createKernel("2026-08-20");
    const snapshot = createSnapshot([]);

    const payload = buildPlannerPublishPersistencePayload({
      kernel,
      snapshot,
      draftCommands: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          sequence: 1,
          kind: "move_item",
          goalId: GOAL_ID,
          unitKey: "total:1",
          scheduledDate: "2026-08-20",
        },
      ],
    });

    expect(payload.items[0].scheduled_date).toBe("2026-08-20");
  });
});
