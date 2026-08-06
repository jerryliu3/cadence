import { describe, expect, it } from "vitest";
import type { Goal, Completion } from "@/lib/goals/types";
import type { PlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import type { PlannerKernelOutput } from "@/lib/planner/kernel";
import {
  PlannerDraftEditValidationError,
  buildPlannerPublishPersistencePayload,
} from "@/lib/planner/publish-payload";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { createDefaultAssessment } from "@/lib/planner/assessment";

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

function createSnapshot(completions: Completion[]): PlannerCanonicalSnapshot {
  return {
    goals: [baseGoal],
    completions,
    links: [],
    revisions: { canonicalRevision: 0, executionRevision: 0 },
    preferences: null,
    activePlan: null,
  };
}

function createKernel(scheduledDate: string): PlannerKernelOutput {
  return {
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
  it("locks moved draft items and preserves original date", () => {
    const snapshot = createSnapshot([]);
    const kernel = createKernel("2026-08-05");
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");
    const payload = buildPlannerPublishPersistencePayload({
      scopeMonth: "2026-08",
      policy,
      kernel,
      snapshot,
      assessments: [createDefaultAssessment(baseGoal)],
      draftItemEdits: [
        {
          goalId: GOAL_ID,
          unitKey: "total:1",
          scheduledDate: "2026-08-06",
          label: null,
        },
      ],
    });

    expect(payload.changeSummary.draftMoved).toBe(1);
    const moved = payload.items.find((item) => item.unit_key === "total:1");
    expect(moved).toMatchObject({
      scheduled_date: "2026-08-06",
      original_scheduled_date: "2026-08-05",
      locked: true,
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
        assessments: [createDefaultAssessment(baseGoal)],
        draftItemEdits: [
          {
            goalId: GOAL_ID,
            unitKey: "total:1",
            scheduledDate: "2026-08-06",
            label: null,
          },
        ],
      })
    ).toThrowError(PlannerDraftEditValidationError);
  });
});
