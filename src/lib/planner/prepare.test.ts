import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal } from "@/lib/goals/types";
import { getAnchoredPeriod } from "@/lib/goals/periods";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { computeRequirementFingerprint } from "@/lib/planner/requirements";
import type { PlannerGoalUnplaceableRecord } from "@/lib/planner/unplaceable";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const DIGEST = "a".repeat(64);

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

import { preparePlannerSchedule } from "@/lib/planner/prepare";

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
  unplaceableGoals: PlannerGoalUnplaceableRecord[] = []
) {
  return {
    snapshot: {
      goals,
      completions: [],
      links: [],
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
        scheduleDigest: DIGEST,
      },
      preferences: {
        timezone: "UTC",
        timezone_confirmed_at: "2026-08-01T00:00:00.000Z",
        policy_revision: 1,
        default_policy: createDefaultPlannerPolicy(
          "UTC",
          "2026-08-01T00:00:00.000Z"
        ),
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
    policyRevision: input.policyRevision ?? 1,
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
