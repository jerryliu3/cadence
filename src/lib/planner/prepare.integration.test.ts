import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal } from "@/lib/goals/types";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const DIGEST = "a".repeat(64);
const DEFAULT_POLICY = createDefaultPlannerPolicy(
  "UTC",
  "2026-08-01T00:00:00.000Z"
);

const mocks = vi.hoisted(() => ({
  loadPlannerPreparationSnapshot: vi.fn(),
  loadPlannerContextPayload: vi.fn(),
  resolveCanonicalAsOfDate: vi.fn(),
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
  const actual = await vi.importActual<typeof import("@/lib/planner/api")>(
    "@/lib/planner/api"
  );
  return {
    ...actual,
    resolveCanonicalAsOfDate: mocks.resolveCanonicalAsOfDate,
  };
});

import { preparePlannerSchedule } from "@/lib/planner/prepare";

const plannerGoal: Goal = {
  id: "22222222-2222-4222-8222-222222222222",
  owner_id: OWNER_ID,
  title: "Launch",
  description: null,
  category: "Personal",
  color: null,
  frequency_type: "fixed_milestones",
  recurrence_interval: null,
  target_count: 1,
  milestone_names: ["Ship"],
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  default_local_time: null,
  photo_path: null,
  team_id: null,
  is_deleted: false,
  archived_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

describe("preparePlannerSchedule integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-05");
    mocks.loadPlannerPreparationSnapshot.mockResolvedValue({
      snapshot: {
        goals: [plannerGoal],
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
          default_policy: DEFAULT_POLICY,
        },
        activePlan: null,
        unplaceableGoals: [],
      },
      persistedItems: [],
      unplaceableGoals: [],
    });
    mocks.loadPlannerContextPayload.mockResolvedValue({
      schemaVersion: "1",
      scopeMonth: "2026-08",
      asOfDate: "2026-08-05",
      timezone: "UTC",
      goalTitles: {},
      links: [],
      preferences: null,
      capabilities: { crossMonthMovesEnabled: false },
      activePlan: null,
      preview: null,
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
        scheduleDigest: DIGEST,
      },
      staleness: { stale: false, reasons: [] },
      unplaceableGoals: [],
    });
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

  it("runs prepare through the real kernel and persists generated items", async () => {
    await preparePlannerSchedule({
      supabase: { rpc: mocks.rpc } as never,
      ownerId: OWNER_ID,
      scopeMonth: "2026-08",
      visibleWindow: { start: "2026-08-01", end: "2026-08-31" },
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "prepare_planner_schedule",
      expect.objectContaining({
        p_expected_digest: DIGEST,
        p_items: expect.arrayContaining([
          expect.objectContaining({
            goal_id: plannerGoal.id,
            unit_key: "milestone:1",
          }),
        ]),
      })
    );
    expect(mocks.loadPlannerContextPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        scopeMonth: "2026-08",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      })
    );
  });
});
