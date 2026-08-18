import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";
import { getAnchoredPeriod } from "@/lib/goals/periods";
import { canonicalHash } from "@/lib/planner/canonical";
import { MAX_GOAL_TARGET_COUNT } from "@/lib/planner/contracts/bounds";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { computeRequirementFingerprint } from "@/lib/planner/requirements";
import {
  buildPlannerGoalLockSignature,
  type PlannerGoalUnplaceableRecord,
} from "@/lib/planner/unplaceable";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const DIGEST = "a".repeat(64);
const DEFAULT_POLICY = createDefaultPlannerPolicy(
  "UTC",
  "2026-08-01T00:00:00.000Z"
);
const DEFAULT_POLICY_FINGERPRINT = canonicalHash(DEFAULT_POLICY);

const mocks = vi.hoisted(() => ({
  loadPlannerPreparationSnapshot: vi.fn(),
  loadPlannerContextPayload: vi.fn(),
  resolveCanonicalAsOfDate: vi.fn(),
  runPlannerKernel: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/planner/context-loader", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/planner/context-loader")>(
      "@/lib/planner/context-loader"
    );
  return {
    ...actual,
    loadPlannerPreparationSnapshot: mocks.loadPlannerPreparationSnapshot,
    loadPlannerContextPayload: mocks.loadPlannerContextPayload,
  };
});

vi.mock("@/lib/planner/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/planner/api")>(
      "@/lib/planner/api"
    );
  return {
    ...actual,
    resolveCanonicalAsOfDate: mocks.resolveCanonicalAsOfDate,
  };
});

vi.mock("@/lib/planner/kernel", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/planner/kernel")>(
      "@/lib/planner/kernel"
    );
  return {
    ...actual,
    runPlannerKernel: mocks.runPlannerKernel,
  };
});

import {
  computeCompletionCreditedUnitKeys,
  preparePlannerSchedule,
} from "@/lib/planner/prepare";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    owner_id: OWNER_ID,
    title: "Launch",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "fixed_milestones",
    recurrence_interval: null,
    target_count: 2,
    milestone_names: ["Draft", "Ship"],
    start_date: "2026-08-01",
    end_date: "2026-09-30",
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

function persistedItem(
  input: Partial<{
    id: string;
    goal_id: string;
    unit_key: string;
    scheduled_date: string;
    original_scheduled_date: string | null;
    scheduled_time: string | null;
    locked: boolean;
  }> = {}
) {
  return {
    id: input.id ?? "33333333-3333-4333-8333-333333333333",
    owner_id: OWNER_ID,
    goal_id: input.goal_id ?? goal().id,
    unit_key: input.unit_key ?? "milestone:1",
    scheduled_date: input.scheduled_date ?? "2026-08-12",
    original_scheduled_date:
      input.original_scheduled_date === undefined
        ? "2026-08-08"
        : input.original_scheduled_date,
    scheduled_time:
      input.scheduled_time === undefined ? "09:30" : input.scheduled_time,
    locked: input.locked ?? true,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

function preparationSnapshot(
  goals: Goal[],
  items: ReturnType<typeof persistedItem>[] = [],
  unplaceableGoals: PlannerGoalUnplaceableRecord[] = [],
  completions: Completion[] = [],
  links: Array<{ sourceGoalId: string; targetGoalId: string }> = []
) {
  return {
    snapshot: {
      goals,
      completions,
      links,
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
        scheduleDigest: DIGEST,
      },
      preferences: {
        timezone: "UTC",
        timezone_confirmed_at: "2026-08-01T00:00:00.000Z",
        policy_revision: 1,
        default_policy: DEFAULT_POLICY,
      },
      activePlan: null,
      unplaceableGoals,
    },
    persistedItems: items,
    unplaceableGoals,
  };
}

function unplaceableRecord(
  input: Partial<PlannerGoalUnplaceableRecord> = {}
): PlannerGoalUnplaceableRecord {
  return {
    goalId: input.goalId ?? goal().id,
    requirementFingerprint:
      input.requirementFingerprint ?? computeRequirementFingerprint(goal()),
    policyFingerprint: input.policyFingerprint ?? DEFAULT_POLICY_FINGERPRINT,
    policyRevision: input.policyRevision ?? 1,
    lockSignature: input.lockSignature ?? "lock-signature",
    effectiveSpanEnd: input.effectiveSpanEnd ?? "2028-07-31",
    unplacedCount: input.unplacedCount ?? 1,
    reason: input.reason ?? "capacity",
    computedAt: input.computedAt ?? "2026-08-15T00:00:00.000Z",
  };
}

function kernelOutput(
  goalId: string,
  units: Array<{
    unitKey: string;
    scheduledDate: string | null;
    locked?: boolean;
    scheduledTimeOverride?: string | null;
    creditedCompletionId?: string | null;
    creditedCompletionDate?: string | null;
  }>
) {
  return {
    solver: {
      issueCodes: [],
      invalidGoalIds: [],
      publishable: true,
    },
    validation: {
      valid: true,
      invariantViolations: [],
    },
    workUnits: units.map((unit, index) => ({
      originalGoalId: goalId,
      requirementFingerprint: "fingerprint",
      unitKey: unit.unitKey,
      scheduledDate: unit.scheduledDate,
      locked: unit.locked ?? false,
      scheduledTimeOverride: unit.scheduledTimeOverride ?? null,
      effectiveScheduledLocalTime: unit.scheduledTimeOverride ?? null,
      creditedCompletionId: unit.creditedCompletionId ?? null,
      creditedCompletionDate: unit.creditedCompletionDate ?? null,
      ordinal: index + 1,
    })),
  };
}

function contextPayload() {
  return {
    schemaVersion: "1" as const,
    scopeMonth: "2026-08",
    asOfDate: "2026-08-05",
    timezone: "UTC",
    goalTitles: {},
    links: [],
    revisions: {
      canonicalRevision: 0,
      executionRevision: 0,
      scheduleDigest: DIGEST,
    },
    capabilities: { crossMonthMovesEnabled: false },
    preferences: null,
    activePlan: null,
    preview: null,
    staleness: { stale: false, reasons: [] },
  };
}

async function prepare() {
  return preparePlannerSchedule({
    supabase: { rpc: mocks.rpc } as never,
    ownerId: OWNER_ID,
    scopeMonth: "2026-08",
    visibleWindow: { start: "2026-07-27", end: "2026-09-06" },
  });
}

describe("preparePlannerSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-05");
    mocks.loadPlannerContextPayload.mockResolvedValue(contextPayload());
    mocks.rpc.mockResolvedValue({
      data: [
        {
          schedule_digest: DIGEST,
          upserted_count: 1,
          deleted_count: 0,
          replayed: false,
        },
      ],
      error: null,
    });
  });

  it("materializes every newly scheduled identity for an empty owner schedule", async () => {
    const plannerGoal = goal();
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal])
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        { unitKey: "milestone:1", scheduledDate: "2026-08-12" },
        { unitKey: "milestone:2", scheduledDate: "2026-09-18" },
      ])
    );

    await prepare();

    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_expected_digest: DIGEST,
        p_items: [
          expect.objectContaining({
            goal_id: plannerGoal.id,
            unit_key: "milestone:1",
            scheduled_date: "2026-08-12",
            original_scheduled_date: "2026-08-12",
          }),
          expect.objectContaining({
            goal_id: plannerGoal.id,
            unit_key: "milestone:2",
            scheduled_date: "2026-09-18",
            original_scheduled_date: "2026-09-18",
          }),
        ],
      })
    );
  });

  it("preserves valid persisted dates, original dates, times, and locks", async () => {
    const plannerGoal = goal();
    const existing = persistedItem();
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [existing])
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        {
          unitKey: existing.unit_key,
          scheduledDate: existing.scheduled_date,
        },
      ])
    );

    await prepare();

    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_items: expect.arrayContaining([
          {
            goal_id: plannerGoal.id,
            unit_key: existing.unit_key,
            scheduled_date: existing.scheduled_date,
            original_scheduled_date: existing.original_scheduled_date,
            scheduled_time: existing.scheduled_time,
            locked: true,
          },
        ]),
      })
    );
  });

  it("adds only identities newly introduced by an increased ordinal count", async () => {
    const plannerGoal = goal({ target_count: 2 });
    const existing = persistedItem({ unit_key: "milestone:1" });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [existing])
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        { unitKey: "milestone:1", scheduledDate: "2026-08-12" },
        { unitKey: "milestone:2", scheduledDate: "2026-09-18" },
      ])
    );

    await prepare();

    const items = mocks.rpc.mock.calls[0]?.[1].p_items;
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unit_key: "milestone:1",
          original_scheduled_date: existing.original_scheduled_date,
        }),
        expect.objectContaining({
          unit_key: "milestone:2",
          original_scheduled_date: "2026-09-18",
        }),
      ])
    );
  });

  it("omits only persisted identities invalidated by a decreased ordinal count", async () => {
    const plannerGoal = goal({
      target_count: 1,
      milestone_names: ["Draft"],
    });
    const valid = persistedItem({ unit_key: "milestone:1" });
    const invalid = persistedItem({
      id: "44444444-4444-4444-8444-444444444444",
      unit_key: "milestone:2",
      scheduled_date: "2026-09-18",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [valid, invalid])
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        { unitKey: "milestone:1", scheduledDate: valid.scheduled_date },
      ])
    );

    await prepare();

    const items = mocks.rpc.mock.calls[0]?.[1].p_items;
    expect(items.map((item: { unit_key: string }) => item.unit_key)).toEqual([
      "milestone:1",
    ]);
  });

  it("does not regenerate a moved ordinal while solving another chunk", async () => {
    const plannerGoal = goal();
    const moved = persistedItem({
      unit_key: "milestone:1",
      scheduled_date: "2026-09-20",
      original_scheduled_date: "2026-08-12",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [moved])
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        { unitKey: "milestone:1", scheduledDate: "2026-08-12" },
      ])
    );

    await prepare();

    const matchingItems = mocks.rpc.mock.calls[0]?.[1].p_items.filter(
      (item: { unit_key: string }) => item.unit_key === "milestone:1"
    );
    expect(matchingItems).toEqual([
      expect.objectContaining({
        scheduled_date: "2026-09-20",
        original_scheduled_date: "2026-08-12",
      }),
    ]);
  });

  it("solves each goal independently in common whole-month chunks no longer than 366 days", async () => {
    const finite = goal({
      end_date: "2028-07-31",
      target_count: 24,
      milestone_names: Array.from({ length: 24 }, (_, index) => `M${index + 1}`),
    });
    const cadence = goal({
      id: "55555555-5555-4555-8555-555555555555",
      frequency_type: "recurring",
      recurrence_interval: "monthly",
      target_count: null,
      milestone_names: null,
      end_date: null,
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([finite, cadence])
    );
    mocks.runPlannerKernel.mockImplementation((input) =>
      kernelOutput(input.goals[0].id, [])
    );

    await prepare();

    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(4);
    for (const [input] of mocks.runPlannerKernel.mock.calls) {
      expect(input.goals).toHaveLength(1);
      const days =
        (Date.parse(`${input.endDate}T00:00:00Z`) -
          Date.parse(`${input.startDate}T00:00:00Z`)) /
          86_400_000 +
        1;
      expect(days).toBeLessThanOrEqual(366);
      expect(input.startDate.endsWith("-01")).toBe(true);
    }
    expect(mocks.rpc.mock.calls[0]?.[1].p_windows).toEqual([
      { start_date: "2026-08-01", end_date: "2027-07-31" },
      { start_date: "2027-08-01", end_date: "2028-07-31" },
    ]);
  });

  it("keeps a first goal's persisted assignment unchanged when another goal is added", async () => {
    const first = goal();
    const second = goal({
      id: "55555555-5555-4555-8555-555555555555",
      title: "Second",
    });
    const existing = persistedItem({ goal_id: first.id });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([first, second], [existing])
    );
    mocks.runPlannerKernel.mockImplementation((input) =>
      kernelOutput(
        input.goals[0].id,
        input.goals[0].id === first.id
          ? [{ unitKey: "milestone:1", scheduledDate: "2026-08-30" }]
          : [{ unitKey: "milestone:1", scheduledDate: "2026-08-20" }]
      )
    );

    await prepare();

    const firstItem = mocks.rpc.mock.calls[0]?.[1].p_items.find(
      (item: { goal_id: string }) => item.goal_id === first.id
    );
    expect(firstItem).toMatchObject({
      scheduled_date: existing.scheduled_date,
      original_scheduled_date: existing.original_scheduled_date,
      scheduled_time: existing.scheduled_time,
      locked: existing.locked,
    });
  });

  it("returns canonical context after an exact replay without requiring writes", async () => {
    const plannerGoal = goal();
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [persistedItem()])
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        { unitKey: "milestone:1", scheduledDate: "2026-08-12" },
      ])
    );
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          schedule_digest: DIGEST,
          upserted_count: 0,
          deleted_count: 0,
          replayed: true,
        },
      ],
      error: null,
    });

    await expect(prepare()).resolves.toEqual(contextPayload());
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.loadPlannerContextPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: "2026-07-27",
        endDate: "2026-09-06",
      })
    );
  });

  it("reloads, recomputes, and retries exactly once after a stale digest", async () => {
    const plannerGoal = goal();
    const staleState = preparationSnapshot([plannerGoal]);
    const freshState = preparationSnapshot([plannerGoal]);
    freshState.snapshot.revisions.scheduleDigest = "b".repeat(64);
    mocks.loadPlannerPreparationSnapshot
      .mockResolvedValueOnce(staleState)
      .mockResolvedValueOnce(freshState);
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        { unitKey: "milestone:1", scheduledDate: "2026-08-12" },
      ])
    );
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "P0001", message: "stale_schedule" },
      })
      .mockResolvedValueOnce({
        data: [
          {
            schedule_digest: "b".repeat(64),
            upserted_count: 1,
            deleted_count: 0,
            replayed: false,
          },
        ],
        error: null,
      });

    await prepare();

    expect(mocks.loadPlannerPreparationSnapshot).toHaveBeenCalledTimes(2);
    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1]?.[1].p_expected_digest).toBe("b".repeat(64));
  });

  it("keeps existing sessions, persists healthy placements, and records unplaceable counts", async () => {
    const blockedGoal = goal();
    const healthyGoal = goal({
      id: "99999999-9999-4999-8999-999999999999",
      title: "Healthy Goal",
    });
    const blockedExisting = persistedItem({
      goal_id: blockedGoal.id,
      unit_key: "milestone:1",
      scheduled_date: "2026-08-07",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([blockedGoal, healthyGoal], [blockedExisting])
    );
    mocks.runPlannerKernel.mockImplementation((input) =>
      input.goals[0].id === blockedGoal.id
        ? {
            solver: {
              issueCodes: ["placement_shortfall"],
              invalidGoalIds: [blockedGoal.id],
              publishable: false,
            },
            validation: {
              valid: true,
              invariantViolations: [],
            },
            workUnits: [
              {
                originalGoalId: blockedGoal.id,
                requirementFingerprint: "fingerprint",
                unitKey: "milestone:1",
                scheduledDate: "2026-08-07",
                locked: true,
                scheduledTimeOverride: null,
                effectiveScheduledLocalTime: null,
                ordinal: 1,
              },
              {
                originalGoalId: blockedGoal.id,
                requirementFingerprint: "fingerprint",
                unitKey: "milestone:2",
                scheduledDate: null,
                locked: false,
                scheduledTimeOverride: null,
                effectiveScheduledLocalTime: null,
                ordinal: 2,
              },
            ],
          }
        : kernelOutput(healthyGoal.id, [
            { unitKey: "milestone:1", scheduledDate: "2026-08-12" },
          ])
    );
    await prepare();

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const prepared = mocks.rpc.mock.calls[0]?.[1].p_items as Array<{
      goal_id: string;
      unit_key: string;
      scheduled_date: string;
    }>;
    expect(prepared).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goal_id: blockedGoal.id,
          unit_key: blockedExisting.unit_key,
          scheduled_date: blockedExisting.scheduled_date,
        }),
        expect.objectContaining({
          goal_id: healthyGoal.id,
          unit_key: "milestone:1",
          scheduled_date: "2026-08-12",
        }),
      ])
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: blockedGoal.id,
            reason: "capacity",
            unplaced_count: 1,
          }),
        ]),
      })
    );
  });

  it("records invalid_lock outcomes without mutating that goal schedule", async () => {
    const lockedGoal = goal();
    const healthyGoal = goal({
      id: "99999999-9999-4999-8999-999999999999",
      title: "Healthy Goal",
    });
    const lockedExisting = persistedItem({
      goal_id: lockedGoal.id,
      unit_key: "milestone:1",
      scheduled_date: "2026-08-07",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([lockedGoal, healthyGoal], [lockedExisting])
    );
    mocks.runPlannerKernel.mockImplementation((input) =>
      input.goals[0].id === lockedGoal.id
        ? {
            solver: {
              issueCodes: ["invalid_lock", "historical_shortfall"],
              invalidGoalIds: [lockedGoal.id],
              publishable: false,
            },
            validation: {
              valid: true,
              invariantViolations: [],
            },
            workUnits: [
              {
                originalGoalId: lockedGoal.id,
                requirementFingerprint: "fingerprint",
                unitKey: "milestone:1",
                scheduledDate: "2026-08-07",
                locked: true,
                scheduledTimeOverride: null,
                effectiveScheduledLocalTime: null,
                ordinal: 1,
              },
              {
                originalGoalId: lockedGoal.id,
                requirementFingerprint: "fingerprint",
                unitKey: "milestone:2",
                scheduledDate: null,
                locked: true,
                scheduledTimeOverride: null,
                effectiveScheduledLocalTime: null,
                ordinal: 2,
              },
            ],
          }
        : kernelOutput(healthyGoal.id, [
            { unitKey: "milestone:1", scheduledDate: "2026-08-12" },
          ])
    );

    await prepare();

    const prepared = mocks.rpc.mock.calls[0]?.[1].p_items as Array<{
      goal_id: string;
      unit_key: string;
      scheduled_date: string;
    }>;
    expect(
      prepared.filter((item) => item.goal_id === lockedGoal.id)
    ).toEqual([
      expect.objectContaining({
        goal_id: lockedGoal.id,
        unit_key: lockedExisting.unit_key,
        scheduled_date: lockedExisting.scheduled_date,
      }),
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: lockedGoal.id,
            reason: "invalid_lock",
            unplaced_count: 1,
          }),
        ]),
      })
    );
  });

  it("still applies completion credit when kernel returns invalid_lock", async () => {
    const lockedGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: 2,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-12-31",
    });
    const completion: Completion = {
      id: "81222222-2222-4222-8222-222222222222",
      goal_id: lockedGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-08-03",
      source: "manual",
      created_at: "2026-08-03T00:00:00.000Z",
    };
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([lockedGoal], [], [], [completion])
    );
    mocks.runPlannerKernel.mockReturnValue({
      solver: {
        issueCodes: ["invalid_lock"],
        invalidGoalIds: [lockedGoal.id],
        publishable: false,
      },
      validation: {
        valid: true,
        invariantViolations: [],
      },
      workUnits: [
        {
          originalGoalId: lockedGoal.id,
          requirementFingerprint: "fingerprint",
          unitKey: "total:1",
          scheduledDate: null,
          locked: true,
          scheduledTimeOverride: null,
          effectiveScheduledLocalTime: null,
          creditedCompletionId: null,
          creditedCompletionDate: null,
          ordinal: 1,
        },
        {
          originalGoalId: lockedGoal.id,
          requirementFingerprint: "fingerprint",
          unitKey: "total:2",
          scheduledDate: null,
          locked: true,
          scheduledTimeOverride: null,
          effectiveScheduledLocalTime: null,
          creditedCompletionId: null,
          creditedCompletionDate: null,
          ordinal: 2,
        },
      ],
    });

    await prepare();

    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: lockedGoal.id,
            reason: "invalid_lock",
            unplaced_count: 1,
          }),
        ]),
      })
    );
  });

  it("does not report unplaceable capacity for ineligible goals", async () => {
    const ineligibleGoal = goal({
      owner_id: "99999999-9999-4999-8999-999999999999",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 3,
      milestone_names: null,
      end_date: null,
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([ineligibleGoal])
    );

    await prepare();

    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: ineligibleGoal.id,
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("skips kernel execution for linked targets suppressed through preparation horizon", async () => {
    const sourceGoal = goal({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Source",
      end_date: "2028-12-31",
    });
    const targetGoal = goal({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Target",
      target_count: 1,
      milestone_names: ["Only"],
      end_date: "2028-12-31",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoal, targetGoal],
        [],
        [],
        [],
        [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    await prepare();

    const targetCalls = mocks.runPlannerKernel.mock.calls.filter(
      ([kernelInput]) => kernelInput.goals[0]?.id === targetGoal.id
    );
    expect(targetCalls).toHaveLength(0);
  });

  it("skips kernel execution when suppression comes from an ancestor behind a missing intermediate source", async () => {
    const sourceGoal = goal({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      title: "Ancestor Source",
      end_date: "2028-12-31",
    });
    const targetGoal = goal({
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      title: "Target",
      target_count: 1,
      milestone_names: ["Only"],
      end_date: "2028-12-31",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoal, targetGoal],
        [],
        [],
        [],
        [
          { sourceGoalId: sourceGoal.id, targetGoalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
          { sourceGoalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", targetGoalId: targetGoal.id },
        ]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    await prepare();

    const targetCalls = mocks.runPlannerKernel.mock.calls.filter(
      ([kernelInput]) => kernelInput.goals[0]?.id === targetGoal.id
    );
    expect(targetCalls).toHaveLength(0);
  });

  it("clamps linked target preparation windows to the source resume date", async () => {
    const sourceGoal = goal({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      title: "Source",
      start_date: "2026-05-01",
      end_date: "2026-08-31",
    });
    const targetGoal = goal({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      title: "Target",
      start_date: "2026-08-01",
      end_date: "2026-10-31",
      target_count: 1,
      milestone_names: ["Only"],
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoal, targetGoal],
        [],
        [],
        [],
        [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    await prepare();

    const targetCalls = mocks.runPlannerKernel.mock.calls.filter(
      ([kernelInput]) => kernelInput.goals[0]?.id === targetGoal.id
    );
    expect(targetCalls.length).toBeGreaterThan(0);
    for (const [kernelInput] of targetCalls) {
      expect(kernelInput.startDate >= "2026-09-01").toBe(true);
      expect(kernelInput.linkSourceGoals).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: sourceGoal.id })])
      );
    }
  });

  it("treats planned-and-completed source dates as projected linked coverage", async () => {
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-18");
    const sourceGoal = goal({
      id: "12121212-1212-4212-8212-121212121212",
      title: "Create videos",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 5,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const targetGoal = goal({
      id: "13131313-1313-4313-8313-131313131313",
      title: "Post videos",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 6,
      milestone_names: ["1", "2", "3", "4", "5", "6"],
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const sourcePlannedItems = [
      persistedItem({
        id: "14141414-1414-4414-8414-141414141414",
        goal_id: sourceGoal.id,
        unit_key: "total:4",
        scheduled_date: "2026-08-20",
        original_scheduled_date: "2026-08-20",
        scheduled_time: null,
        locked: false,
      }),
      persistedItem({
        id: "15151515-1515-4515-8515-151515151515",
        goal_id: sourceGoal.id,
        unit_key: "total:5",
        scheduled_date: "2026-08-25",
        original_scheduled_date: "2026-08-25",
        scheduled_time: null,
        locked: false,
      }),
    ];
    const targetPersistedItem = persistedItem({
      id: "16161616-1616-4616-8616-161616161616",
      goal_id: targetGoal.id,
      unit_key: "milestone:6",
      scheduled_date: "2026-09-01",
      original_scheduled_date: "2026-09-01",
      scheduled_time: null,
      locked: false,
    });
    const sourceCompletions: Completion[] = [
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ].map((completedOn, index) => ({
      id: `source-completion-${index + 1}`,
      goal_id: sourceGoal.id,
      user_id: OWNER_ID,
      completed_on: completedOn,
      source: "manual",
      created_at: `${completedOn}T00:00:00.000Z`,
    }));
    const targetCompletions: Completion[] = [
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ].map((completedOn, index) => ({
      id: `target-completion-${index + 1}`,
      goal_id: targetGoal.id,
      user_id: OWNER_ID,
      completed_on: completedOn,
      source: "linked_cascade",
      created_at: `${completedOn}T00:00:00.000Z`,
    }));
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoal, targetGoal],
        [targetPersistedItem, ...sourcePlannedItems],
        [],
        [...sourceCompletions, ...targetCompletions],
        [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }]
      )
    );

    await prepare();

    const targetCalls = mocks.runPlannerKernel.mock.calls.filter(
      ([kernelInput]) => kernelInput.goals[0]?.id === targetGoal.id
    );
    expect(targetCalls).toHaveLength(0);

    const rpcPayload = mocks.rpc.mock.calls[0]?.[1] as {
      p_unplaceable: Array<{
        goal_id: string;
        unplaced_count: number;
      }>;
    };
    const targetOutcome = rpcPayload.p_unplaceable.find(
      (entry) => entry.goal_id === targetGoal.id
    );
    expect(targetOutcome?.unplaced_count).toBe(0);
  });

  it("passes projected source coverage to the prepare kernel input", async () => {
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-18");
    const sourceGoal = goal({
      id: "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0",
      title: "Source work",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 2,
      milestone_names: ["1", "2"],
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const targetGoal = goal({
      id: "a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0",
      title: "Target work",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 4,
      milestone_names: ["1", "2", "3", "4"],
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoal, targetGoal],
        [
          persistedItem({
            id: "b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0",
            goal_id: sourceGoal.id,
            unit_key: "milestone:2",
            scheduled_date: "2026-08-20",
            original_scheduled_date: "2026-08-20",
            scheduled_time: null,
            locked: false,
          }),
          persistedItem({
            id: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0",
            goal_id: targetGoal.id,
            unit_key: "milestone:4",
            scheduled_date: "2026-09-01",
            original_scheduled_date: "2026-09-01",
            scheduled_time: null,
            locked: false,
          }),
        ],
        [],
        [
          {
            id: "source-completion-1",
            goal_id: sourceGoal.id,
            user_id: OWNER_ID,
            completed_on: "2026-08-03",
            source: "manual",
            created_at: "2026-08-03T00:00:00.000Z",
          },
        ],
        [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [
        { unitKey: "milestone:3", scheduledDate: "2026-09-02" },
      ])
    );

    await prepare();

    const targetCalls = mocks.runPlannerKernel.mock.calls.filter(
      ([kernelInput]) => kernelInput.goals[0]?.id === targetGoal.id
    );
    expect(targetCalls.length).toBeGreaterThan(0);
    for (const [kernelInput] of targetCalls) {
      expect(kernelInput.precoveredCountByGoalId).toEqual({
        [targetGoal.id]: 2,
      });
    }
  });

  it("does not re-solve when source dates move but projected coverage count stays constant", async () => {
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-18");
    const sourceGoal = goal({
      id: "d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1",
      title: "Source",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 2,
      milestone_names: ["1", "2"],
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const targetGoal = goal({
      id: "e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1",
      title: "Target",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 5,
      milestone_names: ["1", "2", "3", "4", "5"],
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const sourceItemsRunOne = [
      persistedItem({
        id: "run-one-source-1",
        goal_id: sourceGoal.id,
        unit_key: "milestone:1",
        scheduled_date: "2026-08-20",
        original_scheduled_date: "2026-08-20",
        scheduled_time: null,
        locked: false,
      }),
      persistedItem({
        id: "run-one-source-2",
        goal_id: sourceGoal.id,
        unit_key: "milestone:2",
        scheduled_date: "2026-08-22",
        original_scheduled_date: "2026-08-22",
        scheduled_time: null,
        locked: false,
      }),
    ];
    const sourceItemsRunTwo = [
      persistedItem({
        id: "run-two-source-1",
        goal_id: sourceGoal.id,
        unit_key: "milestone:1",
        scheduled_date: "2026-08-24",
        original_scheduled_date: "2026-08-24",
        scheduled_time: null,
        locked: false,
      }),
      persistedItem({
        id: "run-two-source-2",
        goal_id: sourceGoal.id,
        unit_key: "milestone:2",
        scheduled_date: "2026-08-26",
        original_scheduled_date: "2026-08-26",
        scheduled_time: null,
        locked: false,
      }),
    ];
    const existingTargetShortfall = unplaceableRecord({
      goalId: targetGoal.id,
      requirementFingerprint: computeRequirementFingerprint(targetGoal),
      policyFingerprint: DEFAULT_POLICY_FINGERPRINT,
      policyRevision: 1,
      lockSignature: buildPlannerGoalLockSignature([]),
      effectiveSpanEnd: targetGoal.end_date ?? "2026-12-31",
      unplacedCount: 3,
      reason: "capacity",
    });
    mocks.loadPlannerPreparationSnapshot
      .mockResolvedValueOnce(
        preparationSnapshot(
          [sourceGoal, targetGoal],
          sourceItemsRunOne,
          [existingTargetShortfall],
          [],
          [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }]
        )
      )
      .mockResolvedValueOnce(
        preparationSnapshot(
          [sourceGoal, targetGoal],
          sourceItemsRunTwo,
          [existingTargetShortfall],
          [],
          [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }]
        )
      );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    await prepare();
    await prepare();

    const targetCalls = mocks.runPlannerKernel.mock.calls.filter(
      ([kernelInput]) => kernelInput.goals[0]?.id === targetGoal.id
    );
    expect(targetCalls).toHaveLength(0);
    const firstRunPayload = mocks.rpc.mock.calls[0]?.[1] as {
      p_unplaceable: Array<{ goal_id: string; unplaced_count: number }>;
    };
    const secondRunPayload = mocks.rpc.mock.calls[1]?.[1] as {
      p_unplaceable: Array<{ goal_id: string; unplaced_count: number }>;
    };
    expect(
      firstRunPayload.p_unplaceable.find((entry) => entry.goal_id === targetGoal.id)
        ?.unplaced_count
    ).toBe(3);
    expect(
      secondRunPayload.p_unplaceable.find((entry) => entry.goal_id === targetGoal.id)
        ?.unplaced_count
    ).toBe(3);
  });

  it("shrinks projected linked coverage after uncompleted source planned dates elapse", async () => {
    const sourceGoal = goal({
      id: "17171717-1717-4717-8717-171717171717",
      title: "Create videos source",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 5,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const targetGoal = goal({
      id: "18181818-1818-4818-8818-181818181818",
      title: "Post videos target",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 5,
      milestone_names: ["1", "2", "3", "4", "5"],
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const sourcePlannedItems = [
      persistedItem({
        id: "19191919-1919-4919-8919-191919191919",
        goal_id: sourceGoal.id,
        unit_key: "total:4",
        scheduled_date: "2026-08-20",
        original_scheduled_date: "2026-08-20",
        scheduled_time: null,
        locked: false,
      }),
      persistedItem({
        id: "20202020-2020-4020-8020-202020202020",
        goal_id: sourceGoal.id,
        unit_key: "total:5",
        scheduled_date: "2026-08-25",
        original_scheduled_date: "2026-08-25",
        scheduled_time: null,
        locked: false,
      }),
    ];
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoal, targetGoal],
        sourcePlannedItems,
        [],
        [],
        [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-18");
    await prepare();

    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-28");
    await prepare();

    const firstRunPayload = mocks.rpc.mock.calls[0]?.[1] as {
      p_unplaceable: Array<{
        goal_id: string;
        unplaced_count: number;
      }>;
    };
    const secondRunPayload = mocks.rpc.mock.calls[1]?.[1] as {
      p_unplaceable: Array<{
        goal_id: string;
        unplaced_count: number;
      }>;
    };
    const firstRunTargetOutcome = firstRunPayload.p_unplaceable.find(
      (entry) => entry.goal_id === targetGoal.id
    );
    const secondRunTargetOutcome = secondRunPayload.p_unplaceable.find(
      (entry) => entry.goal_id === targetGoal.id
    );
    expect(firstRunTargetOutcome?.unplaced_count).toBe(3);
    expect(secondRunTargetOutcome?.unplaced_count).toBe(5);
  });

  it("deduplicates overlapping projected dates across multiple linked sources", async () => {
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-18");
    const sourceGoalA = goal({
      id: "21212121-2121-4212-8212-212121212121",
      title: "Source A",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 2,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const sourceGoalB = goal({
      id: "22222222-2222-4222-8222-222222222223",
      title: "Source B",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 2,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const targetGoal = goal({
      id: "23232323-2323-4232-8232-232323232323",
      title: "Target",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 4,
      milestone_names: ["1", "2", "3", "4"],
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const sourceItems = [
      persistedItem({
        id: "24242424-2424-4242-8242-242424242424",
        goal_id: sourceGoalA.id,
        unit_key: "total:1",
        scheduled_date: "2026-08-20",
        original_scheduled_date: "2026-08-20",
        scheduled_time: null,
        locked: false,
      }),
      persistedItem({
        id: "25252525-2525-4252-8252-252525252525",
        goal_id: sourceGoalA.id,
        unit_key: "total:2",
        scheduled_date: "2026-08-21",
        original_scheduled_date: "2026-08-21",
        scheduled_time: null,
        locked: false,
      }),
      persistedItem({
        id: "26262626-2626-4262-8262-262626262626",
        goal_id: sourceGoalB.id,
        unit_key: "total:1",
        scheduled_date: "2026-08-21",
        original_scheduled_date: "2026-08-21",
        scheduled_time: null,
        locked: false,
      }),
      persistedItem({
        id: "27272727-2727-4272-8272-272727272727",
        goal_id: sourceGoalB.id,
        unit_key: "total:2",
        scheduled_date: "2026-08-22",
        original_scheduled_date: "2026-08-22",
        scheduled_time: null,
        locked: false,
      }),
    ];
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoalA, sourceGoalB, targetGoal],
        sourceItems,
        [],
        [],
        [
          { sourceGoalId: sourceGoalA.id, targetGoalId: targetGoal.id },
          { sourceGoalId: sourceGoalB.id, targetGoalId: targetGoal.id },
        ]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    await prepare();

    const rpcPayload = mocks.rpc.mock.calls[0]?.[1] as {
      p_unplaceable: Array<{ goal_id: string; unplaced_count: number }>;
    };
    const targetOutcome = rpcPayload.p_unplaceable.find(
      (entry) => entry.goal_id === targetGoal.id
    );
    expect(targetOutcome?.unplaced_count).toBe(1);
  });

  it("filters projected source coverage to dates inside the target lifetime window", async () => {
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-09-20");
    const sourceGoal = goal({
      id: "28282828-2828-4282-8282-282828282828",
      title: "Source windowed",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 4,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-09-15",
    });
    const targetGoal = goal({
      id: "29292929-2929-4292-8292-292929292929",
      title: "Target September",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 2,
      milestone_names: ["1", "2"],
      start_date: "2026-09-01",
      end_date: "2026-09-30",
    });
    const sourceItems = [
      persistedItem({
        id: "30303030-3030-4303-8303-303030303030",
        goal_id: sourceGoal.id,
        unit_key: "total:3",
        scheduled_date: "2026-08-25",
        original_scheduled_date: "2026-08-25",
        scheduled_time: null,
        locked: false,
      }),
      persistedItem({
        id: "31313131-3131-4313-8313-313131313131",
        goal_id: sourceGoal.id,
        unit_key: "total:4",
        scheduled_date: "2026-10-01",
        original_scheduled_date: "2026-10-01",
        scheduled_time: null,
        locked: false,
      }),
    ];
    const sourceCompletions: Completion[] = [
      {
        id: "source-window-completion-before",
        goal_id: sourceGoal.id,
        user_id: OWNER_ID,
        completed_on: "2026-08-20",
        source: "manual",
        created_at: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "source-window-completion-inside",
        goal_id: sourceGoal.id,
        user_id: OWNER_ID,
        completed_on: "2026-09-10",
        source: "manual",
        created_at: "2026-09-10T00:00:00.000Z",
      },
    ];
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoal, targetGoal],
        sourceItems,
        [],
        sourceCompletions,
        [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    await prepare();

    const rpcPayload = mocks.rpc.mock.calls[0]?.[1] as {
      p_unplaceable: Array<{ goal_id: string; unplaced_count: number }>;
    };
    const targetOutcome = rpcPayload.p_unplaceable.find(
      (entry) => entry.goal_id === targetGoal.id
    );
    expect(targetOutcome?.unplaced_count).toBe(1);
  });

  it("ignores archived or deleted linked sources when projecting coverage", async () => {
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-18");
    const activeSourceGoal = goal({
      id: "32323232-3232-4323-8323-323232323232",
      title: "Active source",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 2,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const archivedSourceGoal = goal({
      id: "33333333-3333-4333-8333-333333333334",
      title: "Archived source",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 2,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
      archived_at: "2026-08-10T00:00:00.000Z",
    });
    const deletedSourceGoal = goal({
      id: "34343434-3434-4343-8343-343434343434",
      title: "Deleted source",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 2,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
      is_deleted: true,
    });
    const targetGoal = goal({
      id: "35353535-3535-4353-8353-353535353535",
      title: "Target",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 3,
      milestone_names: ["1", "2", "3"],
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const sourceCompletions: Completion[] = [
      {
        id: "active-source-completion",
        goal_id: activeSourceGoal.id,
        user_id: OWNER_ID,
        completed_on: "2026-08-10",
        source: "manual",
        created_at: "2026-08-10T00:00:00.000Z",
      },
      {
        id: "archived-source-completion",
        goal_id: archivedSourceGoal.id,
        user_id: OWNER_ID,
        completed_on: "2026-08-11",
        source: "manual",
        created_at: "2026-08-11T00:00:00.000Z",
      },
      {
        id: "deleted-source-completion",
        goal_id: deletedSourceGoal.id,
        user_id: OWNER_ID,
        completed_on: "2026-08-12",
        source: "manual",
        created_at: "2026-08-12T00:00:00.000Z",
      },
    ];
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [activeSourceGoal, archivedSourceGoal, deletedSourceGoal, targetGoal],
        [],
        [],
        sourceCompletions,
        [
          { sourceGoalId: activeSourceGoal.id, targetGoalId: targetGoal.id },
          { sourceGoalId: archivedSourceGoal.id, targetGoalId: targetGoal.id },
          { sourceGoalId: deletedSourceGoal.id, targetGoalId: targetGoal.id },
        ]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    await prepare();

    const rpcPayload = mocks.rpc.mock.calls[0]?.[1] as {
      p_unplaceable: Array<{ goal_id: string; unplaced_count: number }>;
    };
    const targetOutcome = rpcPayload.p_unplaceable.find(
      (entry) => entry.goal_id === targetGoal.id
    );
    expect(targetOutcome?.unplaced_count).toBe(2);
  });

  it("composes projected source coverage with existing linked target completions", async () => {
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-18");
    const sourceGoal = goal({
      id: "36363636-3636-4363-8363-363636363636",
      title: "Source",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 3,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const targetGoal = goal({
      id: "37373737-3737-4373-8373-373737373737",
      title: "Target",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 4,
      milestone_names: ["1", "2", "3", "4"],
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const sourceItems = [
      persistedItem({
        id: "38383838-3838-4383-8383-383838383838",
        goal_id: sourceGoal.id,
        unit_key: "total:3",
        scheduled_date: "2026-08-20",
        original_scheduled_date: "2026-08-20",
        scheduled_time: null,
        locked: false,
      }),
    ];
    const sourceCompletions: Completion[] = ["2026-08-03", "2026-08-04"].map(
      (completedOn, index) => ({
        id: `source-overlap-completion-${index + 1}`,
        goal_id: sourceGoal.id,
        user_id: OWNER_ID,
        completed_on: completedOn,
        source: "manual",
        created_at: `${completedOn}T00:00:00.000Z`,
      })
    );
    const targetCompletions: Completion[] = ["2026-08-03", "2026-08-04"].map(
      (completedOn, index) => ({
        id: `target-linked-completion-${index + 1}`,
        goal_id: targetGoal.id,
        user_id: OWNER_ID,
        completed_on: completedOn,
        source: "linked_cascade",
        created_at: `${completedOn}T00:00:00.000Z`,
      })
    );
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoal, targetGoal],
        sourceItems,
        [],
        [...sourceCompletions, ...targetCompletions],
        [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    await prepare();

    const rpcPayload = mocks.rpc.mock.calls[0]?.[1] as {
      p_unplaceable: Array<{ goal_id: string; unplaced_count: number }>;
    };
    const targetOutcome = rpcPayload.p_unplaceable.find(
      (entry) => entry.goal_id === targetGoal.id
    );
    expect(targetOutcome?.unplaced_count).toBe(0);
  });

  it("applies projected source coverage after already-credited target ordinals", async () => {
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-18");
    const sourceGoal = goal({
      id: "43434343-4343-4434-8434-434343434343",
      title: "Source for prefix composition",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 5,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const targetGoal = goal({
      id: "44444444-4444-4444-8444-444444444444",
      title: "Target with direct completions",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 13,
      milestone_names: Array.from({ length: 13 }, (_, index) => `${index + 1}`),
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const sourceItems = Array.from({ length: 5 }, (_, index) =>
      persistedItem({
        id: `source-prefix-item-${index + 1}`,
        goal_id: sourceGoal.id,
        unit_key: `total:${index + 1}`,
        scheduled_date: `2026-08-${String(20 + index).padStart(2, "0")}`,
        original_scheduled_date: `2026-08-${String(20 + index).padStart(2, "0")}`,
        scheduled_time: null,
        locked: false,
      })
    );
    const targetManualCompletions: Completion[] = Array.from(
      { length: 8 },
      (_, index) => ({
        id: `target-direct-completion-${index + 1}`,
        goal_id: targetGoal.id,
        user_id: OWNER_ID,
        completed_on: `2026-08-${String(index + 1).padStart(2, "0")}`,
        source: "manual",
        created_at: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      })
    );
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoal, targetGoal],
        sourceItems,
        [],
        targetManualCompletions,
        [{ sourceGoalId: sourceGoal.id, targetGoalId: targetGoal.id }]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    await prepare();

    const rpcPayload = mocks.rpc.mock.calls[0]?.[1] as {
      p_unplaceable: Array<{ goal_id: string; unplaced_count: number }>;
    };
    const targetOutcome = rpcPayload.p_unplaceable.find(
      (entry) => entry.goal_id === targetGoal.id
    );
    expect(targetOutcome?.unplaced_count).toBe(0);
  });

  it("applies projected linked coverage to targeted recurring goals", async () => {
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-18");
    const sourceGoal = goal({
      id: "39393939-3939-4393-8393-393939393939",
      title: "Source for recurring target",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 2,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    const recurringTargetGoal = goal({
      id: "40404040-4040-4404-8404-404040404040",
      title: "Targeted recurring target",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 4,
      milestone_names: null,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const sourceItems = [
      persistedItem({
        id: "41414141-4141-4414-8414-414141414141",
        goal_id: sourceGoal.id,
        unit_key: "total:1",
        scheduled_date: "2026-08-20",
        original_scheduled_date: "2026-08-20",
        scheduled_time: null,
        locked: false,
      }),
      persistedItem({
        id: "42424242-4242-4424-8424-424242424242",
        goal_id: sourceGoal.id,
        unit_key: "total:2",
        scheduled_date: "2026-08-25",
        original_scheduled_date: "2026-08-25",
        scheduled_time: null,
        locked: false,
      }),
    ];
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [sourceGoal, recurringTargetGoal],
        sourceItems,
        [],
        [],
        [{ sourceGoalId: sourceGoal.id, targetGoalId: recurringTargetGoal.id }]
      )
    );
    mocks.runPlannerKernel.mockImplementation((kernelInput) =>
      kernelOutput(kernelInput.goals[0].id, [])
    );

    await prepare();

    const rpcPayload = mocks.rpc.mock.calls[0]?.[1] as {
      p_unplaceable: Array<{ goal_id: string; unplaced_count: number }>;
    };
    const targetOutcome = rpcPayload.p_unplaceable.find(
      (entry) => entry.goal_id === recurringTargetGoal.id
    );
    expect(targetOutcome?.unplaced_count).toBe(2);
  });

  it("skips re-solving unchanged infeasible goals when a valid record already accounts for missing units", async () => {
    const plannerGoal = goal({ target_count: 2 });
    const existing = persistedItem({ unit_key: "milestone:1" });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [existing], [
        unplaceableRecord({
          goalId: plannerGoal.id,
          requirementFingerprint: computeRequirementFingerprint(plannerGoal),
          effectiveSpanEnd: plannerGoal.end_date ?? "2026-09-30",
          unplacedCount: 1,
          reason: "capacity",
          lockSignature: buildPlannerGoalLockSignature([
            {
              unitKey: existing.unit_key,
              scheduledDate: existing.scheduled_date,
              locked: existing.locked,
            },
          ]),
        }),
      ])
    );

    await prepare();

    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: plannerGoal.id,
            unplaced_count: 1,
            reason: "capacity",
          }),
        ]),
      })
    );
  });

  it("preserves durable unplaceable payload fields verbatim on unchanged short-circuit", async () => {
    const plannerGoal = goal({ target_count: 2 });
    const existing = persistedItem({ unit_key: "milestone:1" });
    const lockSignature = buildPlannerGoalLockSignature([
      {
        unitKey: existing.unit_key,
        scheduledDate: existing.scheduled_date,
        locked: existing.locked,
      },
    ]);
    const existingRecord = unplaceableRecord({
      goalId: plannerGoal.id,
      requirementFingerprint: computeRequirementFingerprint(plannerGoal),
      policyFingerprint: DEFAULT_POLICY_FINGERPRINT,
      policyRevision: 1,
      lockSignature,
      effectiveSpanEnd: plannerGoal.end_date ?? "2026-09-30",
      unplacedCount: 1,
      reason: "capacity",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [existing], [existingRecord])
    );

    await prepare();

    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: plannerGoal.id,
            requirement_fingerprint: existingRecord.requirementFingerprint,
            policy_fingerprint: existingRecord.policyFingerprint,
            policy_revision: existingRecord.policyRevision,
            lock_signature: existingRecord.lockSignature,
            effective_span_end: existingRecord.effectiveSpanEnd,
            unplaced_count: existingRecord.unplacedCount,
            reason: existingRecord.reason,
          }),
        ]),
      })
    );
  });

  it("re-solves preserved capacity rows when policy shape changes", async () => {
    const plannerGoal = goal({ target_count: 2 });
    const existing = persistedItem({ unit_key: "milestone:1", locked: false });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [existing], [
        unplaceableRecord({
          goalId: plannerGoal.id,
          requirementFingerprint: computeRequirementFingerprint(plannerGoal),
          lockSignature: buildPlannerGoalLockSignature([
            {
              unitKey: existing.unit_key,
              scheduledDate: existing.scheduled_date,
              locked: existing.locked,
            },
          ]),
          effectiveSpanEnd: plannerGoal.end_date ?? "2026-09-30",
          unplacedCount: 1,
          reason: "capacity",
          policyFingerprint: "stale-policy-fingerprint",
        }),
      ])
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        { unitKey: "milestone:1", scheduledDate: existing.scheduled_date },
        { unitKey: "milestone:2", scheduledDate: "2026-09-18" },
      ])
    );

    await prepare();

    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: plannerGoal.id,
            policy_fingerprint: DEFAULT_POLICY_FINGERPRINT,
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("treats oversized targeted goals as ineligible and clears durable shortfall rows", async () => {
    const oversizedGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: MAX_GOAL_TARGET_COUNT + 1,
      milestone_names: null,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const existingRecord = unplaceableRecord({
      goalId: oversizedGoal.id,
      requirementFingerprint: computeRequirementFingerprint(oversizedGoal),
      lockSignature: buildPlannerGoalLockSignature([]),
      effectiveSpanEnd: oversizedGoal.end_date ?? "2026-12-31",
      unplacedCount: 4,
      reason: "capacity",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([oversizedGoal], [], [existingRecord], [])
    );

    await prepare();

    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: oversizedGoal.id,
            reason: "capacity",
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("treats oversized fixed milestones as ineligible and clears durable invalid_lock rows", async () => {
    const oversizedGoal = goal({
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: MAX_GOAL_TARGET_COUNT + 1,
      milestone_names: [],
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const existingRecord = unplaceableRecord({
      goalId: oversizedGoal.id,
      requirementFingerprint: computeRequirementFingerprint(oversizedGoal),
      lockSignature: buildPlannerGoalLockSignature([]),
      effectiveSpanEnd: oversizedGoal.end_date ?? "2026-12-31",
      unplacedCount: 2,
      reason: "invalid_lock",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([oversizedGoal], [], [existingRecord], [])
    );

    await prepare();

    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: oversizedGoal.id,
            reason: "capacity",
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("re-solves stale positive capacity rows with no covered units so trivial goals can self-heal", async () => {
    const plannerGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: 1,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [], [
        unplaceableRecord({
          goalId: plannerGoal.id,
          requirementFingerprint: computeRequirementFingerprint(plannerGoal),
          effectiveSpanEnd: plannerGoal.end_date ?? "2026-08-31",
          unplacedCount: 1,
          reason: "capacity",
          lockSignature: buildPlannerGoalLockSignature([]),
        }),
      ])
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        { unitKey: "total:1", scheduledDate: "2026-08-20" },
      ])
    );

    await prepare();

    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: plannerGoal.id,
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("re-solves invalid_lock records when lock signature changes", async () => {
    const plannerGoal = goal({ target_count: 2 });
    const existing = persistedItem({
      unit_key: "milestone:1",
      scheduled_date: "2026-08-12",
      locked: false,
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [existing], [
        unplaceableRecord({
          goalId: plannerGoal.id,
          requirementFingerprint: computeRequirementFingerprint(plannerGoal),
          effectiveSpanEnd: plannerGoal.end_date ?? "2026-09-30",
          unplacedCount: 1,
          reason: "invalid_lock",
          lockSignature: "stale-lock-signature",
        }),
      ])
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        { unitKey: "milestone:1", scheduledDate: existing.scheduled_date },
        { unitKey: "milestone:2", scheduledDate: "2026-09-18" },
      ])
    );

    await prepare();

    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(1);
    const unplaceablePayload = mocks.rpc.mock.calls[0]?.[1].p_unplaceable as Array<{
      goal_id: string;
      lock_signature: string;
      unplaced_count: number;
    }>;
    const goalPayload = unplaceablePayload.find(
      (entry) => entry.goal_id === plannerGoal.id
    );
    expect(goalPayload).toMatchObject({
      goal_id: plannerGoal.id,
      unplaced_count: 0,
    });
    expect(goalPayload?.lock_signature).not.toBe("stale-lock-signature");
  });

  it("deletes stale durable unplaceable rows after a goal becomes fully placeable", async () => {
    const plannerGoal = goal({ target_count: 1, milestone_names: ["Draft"] });
    const existing = persistedItem({
      unit_key: "milestone:1",
      scheduled_date: "2026-08-12",
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [existing], [
        unplaceableRecord({
          goalId: plannerGoal.id,
          requirementFingerprint: computeRequirementFingerprint(plannerGoal),
          effectiveSpanEnd: plannerGoal.end_date ?? "2026-09-30",
          unplacedCount: 2,
          reason: "capacity",
        }),
      ])
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(plannerGoal.id, [
        {
          unitKey: "milestone:1",
          scheduledDate: existing.scheduled_date,
        },
      ])
    );

    await prepare();

    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: plannerGoal.id,
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("does not create phantom shortfall for ordinal goals already satisfied by historical units", async () => {
    const plannerGoal = goal({
      target_count: 3,
      milestone_names: ["M1", "M2", "M3"],
      start_date: "2026-06-01",
      end_date: "2026-08-31",
    });
    const historicalOne = persistedItem({
      id: "71111111-1111-4111-8111-111111111111",
      goal_id: plannerGoal.id,
      unit_key: "milestone:1",
      scheduled_date: "2026-06-15",
      original_scheduled_date: "2026-06-15",
      locked: false,
    });
    const historicalTwo = persistedItem({
      id: "72222222-2222-4222-8222-222222222222",
      goal_id: plannerGoal.id,
      unit_key: "milestone:2",
      scheduled_date: "2026-07-10",
      original_scheduled_date: "2026-07-10",
      locked: false,
    });
    const currentUnit = persistedItem({
      id: "73333333-3333-4333-8333-333333333333",
      goal_id: plannerGoal.id,
      unit_key: "milestone:3",
      scheduled_date: "2026-08-20",
      original_scheduled_date: "2026-08-20",
      locked: false,
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [historicalOne, historicalTwo, currentUnit])
    );

    await prepare();

    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: plannerGoal.id,
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("credits completions outside the current scope across both preparation windows", async () => {
    const spanningGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: 2,
      milestone_names: null,
      start_date: "2026-01-01",
      end_date: "2027-12-31",
    });
    const completion: Completion = {
      id: "82111111-1111-4111-8111-111111111111",
      goal_id: spanningGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-02-10",
      source: "manual",
      created_at: "2026-02-10T00:00:00.000Z",
    };
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([spanningGoal], [], [], [completion])
    );
    mocks.runPlannerKernel.mockReturnValue(kernelOutput(spanningGoal.id, []));

    await prepare();

    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: spanningGoal.id,
            reason: "capacity",
            unplaced_count: 1,
          }),
        ]),
      })
    );
  });

  it("does not create phantom shortfall for cadence goals with earlier-in-period sessions", async () => {
    const cadenceGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "monthly",
      target_count: null,
      milestone_names: null,
      start_date: "2026-07-01",
      end_date: "2026-08-31",
    });
    const augustPeriodKey = getAnchoredPeriod(
      cadenceGoal.start_date,
      "monthly",
      "2026-08-03",
      { weekStartsOn: 1 }
    ).periodKey;
    const existingCadenceUnit = persistedItem({
      goal_id: cadenceGoal.id,
      unit_key: `cadence:${augustPeriodKey}`,
      scheduled_date: "2026-08-03",
      original_scheduled_date: "2026-08-03",
      locked: false,
    });
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([cadenceGoal], [existingCadenceUnit])
    );

    await prepare();

    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: cadenceGoal.id,
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("does not create phantom shortfall for cadence goals satisfied by completions without scheduled items", async () => {
    const cadenceGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "monthly",
      target_count: null,
      milestone_names: null,
      start_date: "2026-07-01",
      end_date: "2026-08-31",
    });
    const completion: Completion = {
      id: "82222222-2222-4222-8222-222222222222",
      goal_id: cadenceGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-08-02",
      source: "manual",
      created_at: "2026-08-02T00:00:00.000Z",
    };
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([cadenceGoal], [], [], [completion])
    );

    await prepare();

    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: cadenceGoal.id,
            reason: "capacity",
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("keeps targeted mixed scheduled/completion shortfall accounting accurate", async () => {
    const targetedGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: 4,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-12-31",
    });
    const scheduledThree = persistedItem({
      goal_id: targetedGoal.id,
      unit_key: "total:3",
      scheduled_date: "2026-08-11",
      original_scheduled_date: "2026-08-11",
      locked: false,
    });
    const scheduledFour = persistedItem({
      id: "83333333-3333-4333-8333-333333333333",
      goal_id: targetedGoal.id,
      unit_key: "total:4",
      scheduled_date: "2026-08-12",
      original_scheduled_date: "2026-08-12",
      locked: false,
    });
    const completionOne: Completion = {
      id: "84444444-4444-4444-8444-444444444444",
      goal_id: targetedGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-08-03",
      source: "manual",
      created_at: "2026-08-03T00:00:00.000Z",
    };
    const completionTwo: Completion = {
      id: "85555555-5555-4555-8555-555555555555",
      goal_id: targetedGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-08-12",
      source: "manual",
      created_at: "2026-08-12T00:00:00.000Z",
    };
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [targetedGoal],
        [scheduledThree, scheduledFour],
        [],
        [completionOne, completionTwo]
      )
    );
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(targetedGoal.id, [
        {
          unitKey: "total:1",
          scheduledDate: null,
          creditedCompletionId: completionOne.id,
          creditedCompletionDate: completionOne.completed_on,
        },
        {
          unitKey: "total:2",
          scheduledDate: null,
        },
        {
          unitKey: "total:3",
          scheduledDate: "2026-08-11",
        },
        {
          unitKey: "total:4",
          scheduledDate: "2026-08-12",
          creditedCompletionId: completionTwo.id,
          creditedCompletionDate: completionTwo.completed_on,
        },
      ])
    );

    await prepare();

    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: targetedGoal.id,
            reason: "capacity",
            unplaced_count: 1,
          }),
        ]),
      })
    );
  });

  it("does not create capacity shortfall for targeted goals already satisfied by completions", async () => {
    const completedGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: 1,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const completion: Completion = {
      id: "81111111-1111-4111-8111-111111111111",
      goal_id: completedGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-03-10",
      source: "manual",
      created_at: "2026-03-10T00:00:00.000Z",
    };
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([completedGoal], [], [], [completion])
    );

    await prepare();

    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: completedGoal.id,
            reason: "capacity",
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("heals stale deadline-total unplaceable rows when completions already satisfy the target", async () => {
    const completedGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: 2,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      milestone_names: null,
    });
    const completionOne: Completion = {
      id: "86666666-6666-4666-8666-666666666666",
      goal_id: completedGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-03-10",
      source: "manual",
      created_at: "2026-03-10T00:00:00.000Z",
    };
    const completionTwo: Completion = {
      id: "87777777-7777-4777-8777-777777777777",
      goal_id: completedGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-03-11",
      source: "manual",
      created_at: "2026-03-11T00:00:00.000Z",
    };
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot(
        [completedGoal],
        [],
        [
          unplaceableRecord({
            goalId: completedGoal.id,
            requirementFingerprint: computeRequirementFingerprint(completedGoal),
            effectiveSpanEnd: completedGoal.end_date ?? "2026-12-31",
            unplacedCount: 2,
            reason: "capacity",
            lockSignature: buildPlannerGoalLockSignature([]),
          }),
        ],
        [completionOne, completionTwo]
      )
    );
    // In production this stale-row case can arrive with all completions in
    // months outside the current solve window, so scoped kernel work units can
    // carry zero credit identities even though the lifetime target is fully met.
    mocks.runPlannerKernel.mockReturnValue(kernelOutput(completedGoal.id, []));

    await prepare();

    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: completedGoal.id,
            reason: "capacity",
            unplaced_count: 0,
          }),
        ]),
      })
    );
  });

  it("does not double-count a single completion when scoped kernel and lifetime credit ordinals diverge", async () => {
    const targetedGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: 2,
      milestone_names: null,
      start_date: "2026-08-01",
      end_date: "2026-12-31",
    });
    const completion: Completion = {
      id: "8f111111-1111-4111-8111-111111111111",
      goal_id: targetedGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-08-03",
      source: "manual",
      created_at: "2026-08-03T00:00:00.000Z",
    };
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([targetedGoal], [], [], [completion])
    );
    // Simulate a scoped kernel run that credits the same completion against a
    // different ordinal than lifetime credit identity resolution.
    mocks.runPlannerKernel.mockReturnValue(
      kernelOutput(targetedGoal.id, [
        {
          unitKey: "total:2",
          scheduledDate: null,
          creditedCompletionId: completion.id,
          creditedCompletionDate: completion.completed_on,
        },
      ])
    );

    await prepare();

    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_unplaceable: expect.arrayContaining([
          expect.objectContaining({
            goal_id: targetedGoal.id,
            reason: "capacity",
            unplaced_count: 1,
          }),
        ]),
      })
    );
  });

  it("credits targeted completions even when they occurred before the current window start", () => {
    const targetedGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: 2,
      milestone_names: null,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const completion: Completion = {
      id: "91111111-1111-4111-8111-111111111111",
      goal_id: targetedGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-01-10",
      source: "manual",
      created_at: "2026-01-10T00:00:00.000Z",
    };

    const credited = computeCompletionCreditedUnitKeys({
      goal: targetedGoal,
      completions: [completion],
      asOfDate: "2026-08-15",
      weekStartsOn: 1,
      requiredUnitKeys: new Set(["total:1", "total:2"]),
      persistedItems: [],
      window: { start: "2026-08-01", end: "2026-12-31" },
    });

    expect(Array.from(credited).sort()).toEqual(["total:1"]);
  });

  it("credits milestone completions that occurred before the current window start", () => {
    const milestoneGoal = goal({
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 2,
      milestone_names: ["One", "Two"],
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const completion: Completion = {
      id: "91222222-2222-4222-8222-222222222222",
      goal_id: milestoneGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-01-11",
      source: "manual",
      created_at: "2026-01-11T00:00:00.000Z",
    };

    const credited = computeCompletionCreditedUnitKeys({
      goal: milestoneGoal,
      completions: [completion],
      asOfDate: "2026-08-15",
      weekStartsOn: 1,
      requiredUnitKeys: new Set(["milestone:1", "milestone:2"]),
      persistedItems: [],
      window: { start: "2026-08-01", end: "2026-12-31" },
    });

    expect(Array.from(credited).sort()).toEqual(["milestone:1"]);
  });

  it("credits cadence completions earlier in-period even when before asOfDate", () => {
    const cadenceGoal = goal({
      frequency_type: "recurring",
      recurrence_interval: "monthly",
      target_count: null,
      milestone_names: null,
      start_date: "2026-07-01",
      end_date: "2026-12-31",
    });
    const completion: Completion = {
      id: "91333333-3333-4333-8333-333333333333",
      goal_id: cadenceGoal.id,
      user_id: OWNER_ID,
      completed_on: "2026-08-02",
      source: "manual",
      created_at: "2026-08-02T00:00:00.000Z",
    };
    const augustPeriodKey = getAnchoredPeriod(
      cadenceGoal.start_date,
      "monthly",
      "2026-08-20",
      { weekStartsOn: 1 }
    ).periodKey;

    const credited = computeCompletionCreditedUnitKeys({
      goal: cadenceGoal,
      completions: [completion],
      asOfDate: "2026-08-15",
      weekStartsOn: 1,
      requiredUnitKeys: new Set([`cadence:${augustPeriodKey}`]),
      persistedItems: [],
      window: { start: "2026-08-15", end: "2026-08-31" },
    });

    expect(Array.from(credited)).toEqual([`cadence:${augustPeriodKey}`]);
  });

  it("uses the canonical snapshot digest for preparation", async () => {
    const plannerGoal = goal();
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal])
    );
    mocks.runPlannerKernel.mockReturnValue(kernelOutput(plannerGoal.id, []));

    await preparePlannerSchedule({
      supabase: { rpc: mocks.rpc } as never,
      ownerId: OWNER_ID,
      scopeMonth: "2026-08",
      visibleWindow: { start: "2026-08-01", end: "2026-08-31" },
    });

    expect(mocks.rpc.mock.calls[0]?.[1].p_expected_digest).toBe(DIGEST);
  });

  it("passes the current requirement fingerprint in every goal base plan", async () => {
    const plannerGoal = goal();
    const existing = persistedItem();
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue(
      preparationSnapshot([plannerGoal], [existing])
    );
    mocks.runPlannerKernel.mockReturnValue(kernelOutput(plannerGoal.id, []));

    await prepare();

    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        basePlan: expect.objectContaining({
          assignments: [
            expect.objectContaining({
              goalId: plannerGoal.id,
              requirementFingerprint:
                computeRequirementFingerprint(plannerGoal),
            }),
          ],
        }),
      })
    );
  });
});
