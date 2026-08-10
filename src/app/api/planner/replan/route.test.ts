// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { PlannerError } from "@/lib/planner/kernel";

const mocks = vi.hoisted(() => ({
  parseBoundedJsonBody: vi.fn(),
  requirePlannerRouteContext: vi.fn(),
  resolveCanonicalAsOfDate: vi.fn(),
  loadPlannerCanonicalSnapshot: vi.fn(),
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
}));

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

import { POST } from "./route";

describe("planner replan proposal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: {},
      capabilities: {
        calendarEnabled: true,
      },
    });
    mocks.parseBoundedJsonBody.mockResolvedValue({
      scopeMonth: "2026-08",
      draftCommands: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          sequence: 1,
          kind: "move_item",
          goalId: "12000000-0000-4000-8000-000000000001",
          unitKey: "total:1",
          scheduledDate: "2026-08-12",
        },
      ],
    });
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-05");
    mocks.loadPlannerCanonicalSnapshot.mockResolvedValue({
      goals: [
        {
          id: "12000000-0000-4000-8000-000000000001",
          owner_id: "11111111-1111-4111-8111-111111111111",
          title: "Run",
          description: null,
          category: "Health",
          color: null,
          frequency_type: "recurring",
          recurrence_interval: "weekly",
          target_count: 4,
          milestone_names: null,
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          photo_path: null,
          is_group: false,
          is_deleted: false,
          archived_at: null,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      completions: [],
      links: [],
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
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
    });
  });

  it("compares stable pinned schedule against replan intent", async () => {
    mocks.runPlannerKernel
      .mockReturnValueOnce({
        generationInputHash:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        workUnits: [
          {
            originalGoalId: "12000000-0000-4000-8000-000000000001",
            unitKey: "total:1",
            scheduledDate: "2026-08-12",
          },
        ],
        solver: { issueCodes: [], publishable: true },
      })
      .mockReturnValueOnce({
        generationInputHash:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        workUnits: [
          {
            originalGoalId: "12000000-0000-4000-8000-000000000001",
            unitKey: "total:1",
            scheduledDate: "2026-08-14",
          },
        ],
        solver: { issueCodes: [], publishable: true },
      });

    const response = await POST(
      new Request("http://localhost/api/planner/replan", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      proposal: {
        moveCount: 1,
        moves: [
          {
            goalId: "12000000-0000-4000-8000-000000000001",
            unitKey: "total:1",
            fromDate: "2026-08-12",
            toDate: "2026-08-14",
          },
        ],
      },
      stable: {
        publishable: true,
      },
      replan: {
        publishable: true,
      },
      correlationId: expect.any(String),
    });
    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(2);
    expect(mocks.runPlannerKernel).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        solveIntent: "stable",
        draftPinnedDates: {
          "12000000-0000-4000-8000-000000000001:total:1": "2026-08-12",
        },
      })
    );
    expect(mocks.runPlannerKernel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        solveIntent: "replan",
      })
    );
    expect(mocks.runPlannerKernel).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({
        draftPinnedDates: expect.anything(),
      })
    );
  });

  it("maps planner kernel validation errors to typed 400 responses", async () => {
    mocks.runPlannerKernel.mockImplementation(() => {
      throw new PlannerError(
        "validation_failed",
        400,
        "Planner policy failed validation."
      );
    });

    const response = await POST(
      new Request("http://localhost/api/planner/replan", {
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      message: "Planner policy failed validation.",
      correlationId: expect.any(String),
    });
  });
});
