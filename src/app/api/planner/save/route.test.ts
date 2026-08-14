// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { PlannerError } from "@/lib/planner/kernel";

const mocks = vi.hoisted(() => ({
  parseBoundedJsonBody: vi.fn(),
  requirePlannerRouteContext: vi.fn(),
  requirePlannerAdminClient: vi.fn(),
  resolveCanonicalAsOfDate: vi.fn(),
  loadPlannerCanonicalSnapshot: vi.fn(),
  runPlannerKernel: vi.fn(),
  routeRpc: vi.fn(),
  adminFrom: vi.fn(),
  adminSelect: vi.fn(),
  adminIn: vi.fn(),
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
    requirePlannerAdminClient: mocks.requirePlannerAdminClient,
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

describe("planner save route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminSelect.mockReturnValue({ in: mocks.adminIn });
    mocks.adminFrom.mockReturnValue({ select: mocks.adminSelect });
    mocks.adminIn.mockResolvedValue({ data: [], error: null });
    mocks.requirePlannerAdminClient.mockReturnValue({
      from: mocks.adminFrom,
    });
    mocks.routeRpc.mockResolvedValue({
      data: [
        {
          schedule_digest:
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          upserted_count: 0,
        },
      ],
      error: null,
    });
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: {
        rpc: mocks.routeRpc,
      },
      capabilities: {
        crossMonthMovesEnabled: false,
      },
    });
    mocks.parseBoundedJsonBody.mockResolvedValue({
      expectedDigest:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      scopes: [
        {
          scopeMonth: "2026-08",
          previewHash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          confirmationHash: null,
          draftCommands: [],
        },
      ],
    });
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-05");
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

  it("maps planner kernel validation errors to typed 400 responses", async () => {
    mocks.runPlannerKernel.mockImplementation(() => {
      throw new PlannerError(
        "validation_failed",
        400,
        "Planner policy failed validation."
      );
    });

    const response = await POST(
      new Request("http://localhost/api/planner/save", {
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      message: "Planner policy failed validation.",
      correlationId: expect.any(String),
    });
    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveExistingAssignments: true,
      })
    );
  });

  it("recomputes assignments when save includes a policy override", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      expectedDigest:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      scopes: [
        {
          scopeMonth: "2026-08",
          previewHash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          confirmationHash: null,
          draftCommands: [],
          policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
        },
      ],
    });
    mocks.runPlannerKernel.mockImplementation(() => {
      throw new PlannerError(
        "validation_failed",
        400,
        "Planner policy failed validation."
      );
    });

    await POST(
      new Request("http://localhost/api/planner/save", {
        method: "POST",
      })
    );

    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveExistingAssignments: false,
      })
    );
  });

  it("publishes multiple scope payloads in one batch RPC call", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      expectedDigest:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      scopes: [
        {
          scopeMonth: "2026-08",
          previewHash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          confirmationHash: null,
          draftCommands: [],
        },
        {
          scopeMonth: "2026-09",
          previewHash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          confirmationHash: null,
          draftCommands: [],
        },
      ],
    });
    mocks.runPlannerKernel.mockReturnValue({
      generationInputHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      solver: {
        publishable: true,
        confirmationRequired: false,
        issueCodes: [],
      },
      workUnits: [],
      diff: [],
    });

    const response = await POST(
      new Request("http://localhost/api/planner/save", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.runPlannerKernel).toHaveBeenCalledTimes(2);
    expect(mocks.routeRpc).toHaveBeenCalledWith(
      "set_planner_schedule_batch",
      expect.objectContaining({
        p_expected_digest:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        p_batches: expect.any(Array),
      })
    );
    const rpcPayload = mocks.routeRpc.mock.calls.at(-1)?.[1] as {
      p_batches: Array<{ start_date: string; end_date: string; items: unknown[] }>;
    };
    expect(rpcPayload.p_batches).toHaveLength(2);
    expect(rpcPayload.p_batches[0]).toMatchObject({
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
    expect(rpcPayload.p_batches[1]).toMatchObject({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
    });
  });

  it("returns schedule conflict diagnostics when publish hits unique violation guardrails", async () => {
    const goalId = "22222222-2222-4222-8222-222222222222";
    mocks.loadPlannerCanonicalSnapshot.mockResolvedValueOnce({
      goals: [
        {
          id: goalId,
          title: "Focus goal",
          category: "test",
          color: null,
          status: "active",
          owner_id: "11111111-1111-4111-8111-111111111111",
          start_date: "2026-08-01",
          end_date: null,
          requirement_type: "total",
          target_count: 1,
          period: "week",
          period_anchor: "2026-08-01",
          duration_minutes: null,
          min_per_day: null,
          max_per_day: null,
          allowed_weekdays: null,
          preferred_time_ranges: null,
          default_local_time: null,
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
    mocks.runPlannerKernel.mockReturnValueOnce({
      generationInputHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      solver: {
        publishable: true,
        confirmationRequired: false,
        issueCodes: [],
      },
      workUnits: [
        {
          originalGoalId: goalId,
          unitKey: "total:1",
          scheduledDate: "2026-08-12",
          locked: false,
        },
      ],
      diff: [],
    });
    mocks.routeRpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "P0001",
        message: "schedule_conflict",
      },
    });
    mocks.adminIn.mockResolvedValueOnce({
      data: [
        {
          owner_id: "33333333-3333-4333-8333-333333333333",
          goal_id: goalId,
          unit_key: "total:1",
          scheduled_date: "2026-08-12",
        },
      ],
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/planner/save", {
        method: "POST",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "schedule_conflict",
      message:
        "Planner publish hit an internal schedule conflict. Regenerate and try again.",
      details: {
        cause: "schedule_conflict",
        databaseErrorCode: "P0001",
        databaseErrorMessage: "schedule_conflict",
        databaseErrorDetails: null,
        databaseErrorHint: null,
        submittedItemCount: 1,
        ownerMismatchConflictCount: 1,
        ownerMismatchConflictSample: [
          {
            goalId,
            unitKey: "total:1",
            scheduledDate: "2026-08-12",
          },
        ],
      },
      correlationId: expect.any(String),
    });
  });

  it("maps cross-scope duplicate unit validation to typed 400 responses", async () => {
    mocks.runPlannerKernel.mockReturnValue({
      generationInputHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      solver: {
        publishable: true,
        confirmationRequired: false,
        issueCodes: [],
      },
      workUnits: [],
      diff: [],
    });
    mocks.routeRpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "22023",
        message: "duplicate_goal_unit_across_scopes",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/planner/save", {
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      message: "Planner publish payload failed validation.",
      correlationId: expect.any(String),
    });
  });
});
