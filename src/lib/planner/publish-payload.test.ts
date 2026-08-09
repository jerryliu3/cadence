import { describe, expect, it } from "vitest";
import type { Goal, Completion } from "@/lib/goals/types";
import type { PlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import type { PlannerKernelOutput } from "@/lib/planner/kernel";
import {
  PlannerDraftEditValidationError,
  buildPlannerPublishPersistencePayload,
} from "@/lib/planner/publish-payload";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";

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
  it("keeps moved preview items unlocked unless explicitly locked", () => {
    const snapshot = createSnapshot([]);
    const kernel = createKernel("2026-08-05");
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");
    const payload = buildPlannerPublishPersistencePayload({
      scopeMonth: "2026-08",
      policy,
      kernel,
      snapshot,
      draftCommands: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          sequence: 1,
          kind: "move_item",
          goalId: GOAL_ID,
          unitKey: "total:1",
          scheduledDate: "2026-08-06",
        },
      ],
    });

    expect(payload.changeSummary.draftMoved).toBe(1);
    const moved = payload.items.find((item) => item.unit_key === "total:1");
    expect(moved).toMatchObject({
      scheduled_date: "2026-08-06",
      original_scheduled_date: "2026-08-05",
      locked: false,
    });
  });

  it("rejects moves when the target date already has a completion fact", () => {
    const snapshot = createSnapshot([
      {
        id: "50000000-0000-4000-8000-000000000001",
        goal_id: GOAL_ID,
        user_id: "11111111-1111-4111-8111-111111111111",
        completed_on: "2026-08-06",
        source: "manual",
        created_at: "2026-08-06T00:00:00.000Z",
      },
    ]);
    const kernel = createKernel("2026-08-05");
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");

    expect(() =>
      buildPlannerPublishPersistencePayload({
        scopeMonth: "2026-08",
        policy,
        kernel,
        snapshot,
        draftCommands: [
          {
            id: "30000000-0000-4000-8000-000000000002",
            sequence: 1,
            kind: "move_item",
            goalId: GOAL_ID,
            unitKey: "total:1",
            scheduledDate: "2026-08-06",
          },
        ],
      })
    ).toThrowError(PlannerDraftEditValidationError);
  });

  it("applies move commands by deterministic sequence order", () => {
    const snapshot = createSnapshot([]);
    const kernel = createKernel("2026-08-05");
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");
    const payload = buildPlannerPublishPersistencePayload({
      scopeMonth: "2026-08",
      policy,
      kernel,
      snapshot,
      draftCommands: [
        {
          id: "30000000-0000-4000-8000-000000000010",
          sequence: 2,
          kind: "move_item",
          goalId: GOAL_ID,
          unitKey: "total:1",
          scheduledDate: "2026-08-08",
        },
        {
          id: "30000000-0000-4000-8000-000000000011",
          sequence: 1,
          kind: "move_item",
          goalId: GOAL_ID,
          unitKey: "total:1",
          scheduledDate: "2026-08-06",
        },
      ],
    });

    const moved = payload.items.find((item) => item.unit_key === "total:1");
    expect(moved?.scheduled_date).toBe("2026-08-08");
  });

  it("persists overlap draft moves outside the scope month", () => {
    const snapshot = createSnapshot([]);
    const kernel = {
      ...createKernel("2026-08-28"),
      eligibilityMode: "overlap_v1" as const,
      workUnits: [
        {
          ...createKernel("2026-08-28").workUnits[0],
          draftMoveWindow: { start: "2026-08-01", end: "2026-09-15" },
          creditWindow: { start: "2026-08-01", end: "2026-09-15" },
        },
      ],
    } as PlannerKernelOutput;
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");

    const payload = buildPlannerPublishPersistencePayload({
      scopeMonth: "2026-08",
      policy,
      kernel,
      snapshot,
      draftCommands: [
        {
          id: "30000000-0000-4000-8000-000000000012",
          sequence: 1,
          kind: "move_item",
          goalId: GOAL_ID,
          unitKey: "total:1",
          scheduledDate: "2026-09-03",
        },
      ],
    });

    const moved = payload.items.find((item) => item.unit_key === "total:1");
    expect(moved).toMatchObject({
      scheduled_date: "2026-09-03",
      original_scheduled_date: "2026-08-28",
    });
  });

  it("allows draft moves that conflict with advisory policy preferences", () => {
    const snapshot = createSnapshot([]);
    const kernel = createKernel("2026-08-05");
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");
    policy.restWeekdays = [4];
    policy.blackoutRanges = [{ start: "2026-08-08", end: "2026-08-08" }];

    const payload = buildPlannerPublishPersistencePayload({
      scopeMonth: "2026-08",
      policy,
      kernel,
      snapshot,
      draftCommands: [
        {
          id: "30000000-0000-4000-8000-000000000013",
          sequence: 1,
          kind: "move_item",
          goalId: GOAL_ID,
          unitKey: "total:1",
          scheduledDate: "2026-08-08",
        },
      ],
    });

    const moved = payload.items.find((item) => item.unit_key === "total:1");
    expect(moved?.scheduled_date).toBe("2026-08-08");
    expect(payload.changeSummary.draftMoved).toBe(1);
  });

  it("applies item-level time override draft commands", () => {
    const snapshot = createSnapshot([]);
    const kernel = createKernel("2026-08-10");
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");

    const payload = buildPlannerPublishPersistencePayload({
      scopeMonth: "2026-08",
      policy,
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
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");

    const payload = buildPlannerPublishPersistencePayload({
      scopeMonth: "2026-08",
      policy,
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
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");

    expect(() =>
      buildPlannerPublishPersistencePayload({
        scopeMonth: "2026-08",
        policy,
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
