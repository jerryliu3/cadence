// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";

const mocks = vi.hoisted(() => ({
  parseBoundedJsonBody: vi.fn(),
  requirePlannerRouteContext: vi.fn(),
  resolveCanonicalAsOfDate: vi.fn(),
  loadPlannerCanonicalSnapshot: vi.fn(),
  loadPlannerItemsForWindow: vi.fn(),
  runPlannerKernel: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: vi.fn() } }),
}));

vi.mock("@/lib/planner/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/planner/api")>(
      "@/lib/planner/api"
    );
  return {
    ...actual,
    createCorrelationId: () => "test-correlation-id",
    parseBoundedJsonBody: mocks.parseBoundedJsonBody,
    requirePlannerRouteContext: mocks.requirePlannerRouteContext,
    resolveCanonicalAsOfDate: mocks.resolveCanonicalAsOfDate,
  };
});

vi.mock("@/lib/planner/context-loader", () => ({
  loadPlannerCanonicalSnapshot: mocks.loadPlannerCanonicalSnapshot,
  loadPlannerItemsForWindow: mocks.loadPlannerItemsForWindow,
}));

vi.mock("@/lib/planner/kernel", () => ({
  PlannerError: class PlannerError extends Error {
    code: string;
    httpStatus: number;
    details?: Record<string, unknown>;

    constructor(
      code: string,
      httpStatus: number,
      message: string,
      details?: Record<string, unknown>
    ) {
      super(message);
      this.code = code;
      this.httpStatus = httpStatus;
      this.details = details;
    }
  },
  runPlannerKernel: mocks.runPlannerKernel,
}));

import { POST } from "./route";

const DRAFT_GOAL_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_ITEM_ID = "44444444-4444-4444-8444-444444444444";

describe("planner context preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: {},
      capabilities: {
        crossMonthMovesEnabled: false,
      },
    });
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-05");
    mocks.loadPlannerItemsForWindow.mockResolvedValue([]);
    mocks.loadPlannerCanonicalSnapshot.mockResolvedValue({
      goals: [],
      completions: [],
      links: [],
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
      },
      preferences: {
        timezone: "UTC",
        default_policy: {
          schemaVersion: "v1",
          timezone: "UTC",
        },
      },
      activePlan: null,
    });
  });

  it("returns typed 400 when request policy fails schema validation", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValue({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      source: "manual",
      timezone: "UTC",
      policy: {
        timezone: "UTC",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/planner/context", {
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      message: "Planner policy failed validation.",
      correlationId: expect.any(String),
      details: {
        stage: "request_policy",
      },
    });
    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
  });

  it("uses fresh recomputation for explicit preview generation", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      source: "manual",
      timezone: "UTC",
      policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
    });
    mocks.runPlannerKernel.mockImplementationOnce(() => {
      throw new Error("forced");
    });

    const response = await POST(
      new Request("http://localhost/api/planner/context", {
        method: "POST",
      })
    );

    expect(response.status).toBe(500);
    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveExistingAssignments: true,
      })
    );
  });

  it("threads solve intent and draft pins into the kernel", async () => {
    mocks.loadPlannerCanonicalSnapshot.mockResolvedValueOnce({
      goals: [],
      completions: [],
      links: [],
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
      },
      preferences: {
        timezone: "UTC",
        default_policy: createDefaultPlannerPolicy(
          "UTC",
          "2026-08-01T00:00:00.000Z"
        ),
      },
      activePlan: {
        goals: [
          {
            id: DRAFT_GOAL_ID,
            original_goal_id: DRAFT_GOAL_ID,
          },
        ],
        items: [
          {
            id: DRAFT_ITEM_ID,
            plan_goal_id: DRAFT_GOAL_ID,
            unit_key: "total:1",
          },
        ],
      },
    });
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      source: "manual",
      timezone: "UTC",
      solveIntent: "replan",
      policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
      draftCommands: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          sequence: 1,
          kind: "move_item",
          itemId: DRAFT_ITEM_ID,
          goalId: DRAFT_GOAL_ID,
          unitKey: "total:1",
          scheduledDate: "2026-08-20",
          sourceDate: "2026-08-01",
        },
      ],
    });
    mocks.runPlannerKernel.mockImplementationOnce(() => {
      throw new Error("forced");
    });

    await POST(
      new Request("http://localhost/api/planner/context", { method: "POST" })
    );

    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        solveIntent: "replan",
        preserveExistingAssignments: false,
        draftPinnedDates: {
          [`${DRAFT_GOAL_ID}:total:1`]: "2026-08-20",
        },
      })
    );
  });

  it("threads the recovery flag into the kernel while preserving assignments", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      startDate: "2026-02-01",
      endDate: "2027-01-31",
      source: "update",
      timezone: "UTC",
      solveIntent: "stable",
      recoverPastPlacements: true,
      policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
      draftCommands: [],
    });
    mocks.runPlannerKernel.mockImplementationOnce(() => {
      throw new Error("forced");
    });

    await POST(
      new Request("http://localhost/api/planner/context", { method: "POST" })
    );

    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        solveIntent: "stable",
        recoverPastPlacements: true,
        preserveExistingAssignments: true,
      })
    );
  });

  it("defaults the recovery flag off so ordinary previews are unchanged", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      source: "manual",
      timezone: "UTC",
      policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
    });
    mocks.runPlannerKernel.mockImplementationOnce(() => {
      throw new Error("forced");
    });

    await POST(
      new Request("http://localhost/api/planner/context", { method: "POST" })
    );

    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        recoverPastPlacements: false,
      })
    );
  });

  it("threads linked-source projected coverage into preview kernel input", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      source: "manual",
      timezone: "UTC",
      policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
    });
    const sourceGoalId = "33333333-3333-4333-8333-333333333333";
    const targetGoalId = "44444444-4444-4444-8444-444444444444";
    mocks.loadPlannerCanonicalSnapshot.mockResolvedValueOnce({
      goals: [
        {
          id: sourceGoalId,
          owner_id: "11111111-1111-4111-8111-111111111111",
          title: "Source",
          category: "Personal",
          color: null,
          frequency_type: "fixed_milestones",
          recurrence_interval: null,
          target_count: 2,
          milestone_names: ["1", "2"],
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          is_deleted: false,
          archived_at: null,
        },
        {
          id: targetGoalId,
          owner_id: "11111111-1111-4111-8111-111111111111",
          title: "Target",
          category: "Personal",
          color: null,
          frequency_type: "fixed_milestones",
          recurrence_interval: null,
          target_count: 4,
          milestone_names: ["1", "2", "3", "4"],
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          is_deleted: false,
          archived_at: null,
        },
      ],
      completions: [
        {
          id: "completion-1",
          goal_id: sourceGoalId,
          user_id: "11111111-1111-4111-8111-111111111111",
          completed_on: "2026-08-03",
          source: "manual",
          created_at: "2026-08-03T00:00:00.000Z",
        },
      ],
      links: [{ sourceGoalId, targetGoalId }],
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
      },
      preferences: {
        timezone: "UTC",
        default_policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
      },
      activePlan: null,
    });
    mocks.loadPlannerItemsForWindow.mockResolvedValueOnce([
      {
        goal_id: sourceGoalId,
        scheduled_date: "2026-08-10",
      },
    ]);
    mocks.runPlannerKernel.mockImplementationOnce(() => {
      throw new Error("forced");
    });

    await POST(new Request("http://localhost/api/planner/context", { method: "POST" }));

    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        precoveredCountByGoalId: { [targetGoalId]: 2 },
      })
    );
  });

  it("rejects a preview that did not honor a draft pin", async () => {
    mocks.loadPlannerCanonicalSnapshot.mockResolvedValueOnce({
      goals: [],
      completions: [],
      links: [],
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
      },
      preferences: {
        timezone: "UTC",
        default_policy: createDefaultPlannerPolicy(
          "UTC",
          "2026-08-01T00:00:00.000Z"
        ),
      },
      activePlan: {
        goals: [
          {
            id: DRAFT_GOAL_ID,
            original_goal_id: DRAFT_GOAL_ID,
          },
        ],
        items: [
          {
            id: DRAFT_ITEM_ID,
            plan_goal_id: DRAFT_GOAL_ID,
            unit_key: "total:1",
          },
        ],
      },
    });
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      source: "manual",
      timezone: "UTC",
      policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
      draftCommands: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          sequence: 1,
          kind: "move_item",
          itemId: DRAFT_ITEM_ID,
          goalId: DRAFT_GOAL_ID,
          unitKey: "total:1",
          scheduledDate: "2026-08-20",
          sourceDate: "2026-08-01",
        },
      ],
    });
    mocks.runPlannerKernel.mockReturnValueOnce({
      workUnits: [
        {
          originalGoalId: DRAFT_GOAL_ID,
          unitKey: "total:1",
          scheduledDate: "2026-08-06",
          creditState: "uncredited",
          classification: "open",
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost/api/planner/context", { method: "POST" })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "draft_pin_unhonored",
      details: {
        violations: [
          {
            goalId: DRAFT_GOAL_ID,
            unitKey: "total:1",
            expectedDate: "2026-08-20",
            actualDate: "2026-08-06",
          },
        ],
      },
    });
  });
});
