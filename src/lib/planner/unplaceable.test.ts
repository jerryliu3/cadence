import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import { computeRequirementFingerprint } from "@/lib/planner/requirements";
import {
  buildPlannerGoalLockSignature,
  isPlannerGoalUnplaceableRecordValid,
  summarizePlannerGoalUnplaceableRecords,
  type PlannerGoalUnplaceableRecord,
} from "@/lib/planner/unplaceable";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Read 30 books",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "fixed_milestones",
    recurrence_interval: null,
    target_count: 30,
    milestone_names: Array.from({ length: 30 }, (_, index) => `Book ${index + 1}`),
    start_date: "2026-08-01",
    end_date: "2026-12-31",
    default_local_time: null,
    photo_path: null,
    team_id: null,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function record(
  input: Partial<PlannerGoalUnplaceableRecord> = {}
): PlannerGoalUnplaceableRecord {
  const baselineGoal = goal();
  return {
    goalId: input.goalId ?? baselineGoal.id,
    requirementFingerprint:
      input.requirementFingerprint ?? computeRequirementFingerprint(baselineGoal),
    policyFingerprint: input.policyFingerprint ?? "policy-fingerprint",
    coverageFingerprint: input.coverageFingerprint ?? "coverage-fingerprint",
    policyRevision: input.policyRevision ?? 2,
    lockSignature: input.lockSignature ?? "lock-signature",
    effectiveSpanEnd: input.effectiveSpanEnd ?? "2027-07-31",
    unplacedCount: input.unplacedCount ?? 8,
    reason: input.reason ?? "capacity",
    computedAt: input.computedAt ?? "2026-08-15T00:00:00.000Z",
  };
}

describe("planner unplaceable helpers", () => {
  it("accepts a record when fingerprint, policy fingerprint, policy revision, and span end match", () => {
    const plannerGoal = goal();
    const unplaceable = record({
      goalId: plannerGoal.id,
      requirementFingerprint: computeRequirementFingerprint(plannerGoal),
      policyRevision: 3,
      effectiveSpanEnd: "2027-07-31",
    });
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: unplaceable,
        goal: plannerGoal,
        policyFingerprint: "policy-fingerprint",
        policyRevision: 3,
        lockSignature: "lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(true);
  });

  it("invalidates when fingerprint mismatches", () => {
    const plannerGoal = goal();
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({
          goalId: plannerGoal.id,
          requirementFingerprint: "b".repeat(64),
        }),
        goal: plannerGoal,
        policyFingerprint: "policy-fingerprint",
        policyRevision: 2,
        lockSignature: "lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(false);
  });

  it("invalidates when policy revision mismatches", () => {
    const plannerGoal = goal();
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({ goalId: plannerGoal.id, policyRevision: 4 }),
        goal: plannerGoal,
        policyFingerprint: "policy-fingerprint",
        policyRevision: 2,
        lockSignature: "lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(false);
  });

  it("invalidates when policy fingerprint mismatches", () => {
    const plannerGoal = goal();
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({
          goalId: plannerGoal.id,
          policyFingerprint: "stale-policy-fingerprint",
        }),
        goal: plannerGoal,
        policyFingerprint: "current-policy-fingerprint",
        policyRevision: 2,
        lockSignature: "lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(false);
  });

  it("invalidates when coverage fingerprint mismatches", () => {
    const plannerGoal = goal();
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({
          goalId: plannerGoal.id,
          coverageFingerprint: "stale-coverage-fingerprint",
        }),
        goal: plannerGoal,
        policyFingerprint: "policy-fingerprint",
        coverageFingerprint: "current-coverage-fingerprint",
        policyRevision: 2,
        lockSignature: "lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(false);
  });

  it("invalidates when record span end is behind current effective span", () => {
    const plannerGoal = goal({ end_date: "2027-09-30" });
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({
          goalId: plannerGoal.id,
          requirementFingerprint: computeRequirementFingerprint(plannerGoal),
          effectiveSpanEnd: "2027-08-31",
        }),
        goal: plannerGoal,
        policyFingerprint: "policy-fingerprint",
        policyRevision: 2,
        lockSignature: "lock-signature",
        preparationEnd: "2027-09-30",
      })
    ).toBe(false);
  });

  it("keeps validity when record span end is beyond current effective span", () => {
    const plannerGoal = goal({ end_date: "2026-12-31" });
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({
          goalId: plannerGoal.id,
          requirementFingerprint: computeRequirementFingerprint(plannerGoal),
          effectiveSpanEnd: "2027-07-31",
        }),
        goal: plannerGoal,
        policyFingerprint: "policy-fingerprint",
        policyRevision: 2,
        lockSignature: "lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(true);
  });

  it("invalidates when lock signature mismatches", () => {
    const plannerGoal = goal();
    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: record({
          goalId: plannerGoal.id,
          lockSignature: "prior-lock-signature",
        }),
        goal: plannerGoal,
        policyFingerprint: "policy-fingerprint",
        policyRevision: 2,
        lockSignature: "next-lock-signature",
        preparationEnd: "2027-07-31",
      })
    ).toBe(false);
  });

  it("summarizes unresolved goals in descending unresolved order", () => {
    const summary = summarizePlannerGoalUnplaceableRecords({
      records: [
        record({
          goalId: "goal-b",
          unplacedCount: 1,
          reason: "invalid_lock",
        }),
        record({
          goalId: "goal-a",
          unplacedCount: 4,
          reason: "capacity",
        }),
      ],
      goalTitles: {
        "goal-a": "A",
        "goal-b": "B",
      },
    });
    expect(summary).toEqual([
      expect.objectContaining({
        goalId: "goal-a",
        title: "A",
        unplacedCount: 4,
        reason: "capacity",
      }),
      expect.objectContaining({
        goalId: "goal-b",
        title: "B",
        unplacedCount: 1,
        reason: "invalid_lock",
      }),
    ]);
  });
});

describe("buildPlannerGoalLockSignature", () => {
  // Prepare writes the signature from preparation-horizon items while the
  // context loader reads it back. If either side narrowed its input set to the
  // visible window, records would look permanently invalid and the shortfall
  // banner would never render. These cases pin the horizon-parity contract.
  const inHorizonEntries = [
    { unitKey: "milestone:1", scheduledDate: "2026-08-10", locked: false },
    { unitKey: "milestone:2", scheduledDate: "2026-11-04", locked: false },
    { unitKey: "milestone:3", scheduledDate: "2027-03-19", locked: false },
  ];

  it("changes when a lock flips on a session outside the visible month", () => {
    const before = buildPlannerGoalLockSignature(inHorizonEntries);
    const after = buildPlannerGoalLockSignature(
      inHorizonEntries.map((entry) =>
        entry.unitKey === "milestone:3" ? { ...entry, locked: true } : entry
      )
    );

    expect(after).not.toBe(before);
  });

  it("differs between the full horizon set and a visible-window subset", () => {
    const visibleOnly = inHorizonEntries.filter((entry) =>
      entry.scheduledDate.startsWith("2026-08")
    );

    expect(buildPlannerGoalLockSignature(visibleOnly)).not.toBe(
      buildPlannerGoalLockSignature(inHorizonEntries)
    );
  });

  it("is independent of input ordering", () => {
    expect(
      buildPlannerGoalLockSignature([...inHorizonEntries].reverse())
    ).toBe(buildPlannerGoalLockSignature(inHorizonEntries));
  });

  it("changes when a session moves, since placement affects solvability", () => {
    const moved = inHorizonEntries.map((entry) =>
      entry.unitKey === "milestone:2"
        ? { ...entry, scheduledDate: "2026-11-05" }
        : entry
    );

    expect(buildPlannerGoalLockSignature(moved)).not.toBe(
      buildPlannerGoalLockSignature(inHorizonEntries)
    );
  });

  it("returns a stable value for a goal with no persisted sessions", () => {
    expect(buildPlannerGoalLockSignature([])).toBe(
      buildPlannerGoalLockSignature([])
    );
  });
});

describe("record validity under out-of-window lock changes", () => {
  const entries = [
    { unitKey: "milestone:1", scheduledDate: "2026-08-10", locked: false },
    { unitKey: "milestone:9", scheduledDate: "2027-02-11", locked: false },
  ];

  it("invalidates a record when a lock changes on a far-future session", () => {
    const plannerGoal = goal();
    const storedSignature = buildPlannerGoalLockSignature(entries);
    const stored = record({
      requirementFingerprint: computeRequirementFingerprint(plannerGoal),
      lockSignature: storedSignature,
      effectiveSpanEnd: plannerGoal.end_date ?? "2027-07-31",
      reason: "invalid_lock",
    });

    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: stored,
        goal: plannerGoal,
        policyFingerprint: stored.policyFingerprint,
        policyRevision: stored.policyRevision,
        lockSignature: storedSignature,
        preparationEnd: "2028-07-31",
      })
    ).toBe(true);

    const afterUnlock = buildPlannerGoalLockSignature(
      entries.map((entry) =>
        entry.unitKey === "milestone:9" ? { ...entry, locked: true } : entry
      )
    );

    expect(
      isPlannerGoalUnplaceableRecordValid({
        record: stored,
        goal: plannerGoal,
        policyFingerprint: stored.policyFingerprint,
        policyRevision: stored.policyRevision,
        lockSignature: afterUnlock,
        preparationEnd: "2028-07-31",
      })
    ).toBe(false);
  });
});
