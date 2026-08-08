import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callAdminRpc: vi.fn(),
  requirePlannerAdminClient: vi.fn(),
}));

vi.mock("@/lib/planner/api", () => ({
  requirePlannerAdminClient: mocks.requirePlannerAdminClient,
}));

vi.mock("@/lib/supabase/admin-rpc", () => ({
  callAdminRpc: mocks.callAdminRpc,
}));

import {
  applyPlannerGoalDateFact,
  applyPlannerItemDateFact,
  targetedExactDateRequestSchema,
} from "./exact-date-dispatch";

describe("exact-date dispatch schema", () => {
  it("rejects payloads that provide both planner expectations", () => {
    const parsed = targetedExactDateRequestSchema.safeParse({
      goalId: "10000000-0000-4000-8000-000000000011",
      date: "2026-08-05",
      desiredFactState: "present",
      timezone: "UTC",
      plannerItemExpectation: {
        itemId: "22000000-0000-4000-8000-000000000001",
        expectedCreditedUnit: null,
        expectedCanonicalRevision: 1,
        expectedExecutionRevision: 1,
        expectedItemRevision: 1,
      },
      plannerGoalExpectation: {
        planGoalId: "33000000-0000-4000-8000-000000000001",
        expectedCanonicalRevision: 1,
        expectedExecutionRevision: 1,
      },
    });

    expect(parsed.success).toBe(false);
  });
});

describe("exact-date dispatch helpers", () => {
  beforeEach(() => {
    mocks.requirePlannerAdminClient.mockReturnValue({});
    mocks.callAdminRpc.mockReset();
  });

  it("maps planner item revision failures to stale revision response", async () => {
    mocks.callAdminRpc.mockResolvedValue({
      data: null,
      error: { message: "planner item revision mismatch" },
    });

    const result = await applyPlannerItemDateFact({
      ownerId: "11111111-1111-4111-8111-111111111111",
      fallbackGoalId: "10000000-0000-4000-8000-000000000011",
      fallbackDate: "2026-08-05",
      desiredFactState: "present",
      expectation: {
        itemId: "22000000-0000-4000-8000-000000000001",
        expectedCreditedUnit: null,
        expectedCanonicalRevision: 4,
        expectedExecutionRevision: 5,
        expectedItemRevision: 6,
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      code: "stale_revision",
      message: "Planner completion state is stale. Refresh and try again.",
    });
  });

  it("maps planner goal linked-goal failures to semantic response", async () => {
    mocks.callAdminRpc.mockResolvedValue({
      data: null,
      error: {
        message: "linked goals cannot use planner plan-goal date facts",
      },
    });

    const result = await applyPlannerGoalDateFact({
      ownerId: "11111111-1111-4111-8111-111111111111",
      fallbackGoalId: "10000000-0000-4000-8000-000000000011",
      fallbackDate: "2026-08-05",
      desiredFactState: "present",
      expectation: {
        planGoalId: "33000000-0000-4000-8000-000000000001",
        expectedCanonicalRevision: 4,
        expectedExecutionRevision: 5,
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 422,
      code: "linked_goal_disallowed",
      message: "Linked goals cannot be completed through plan-goal date facts.",
    });
  });

  it("returns normalized planner goal success payload", async () => {
    mocks.callAdminRpc.mockResolvedValue({
      data: [
        {
          goal_id: "10000000-0000-4000-8000-000000000011",
          date: "2026-08-05",
          fact_state: "absent",
        },
      ],
      error: null,
    });

    const result = await applyPlannerGoalDateFact({
      ownerId: "11111111-1111-4111-8111-111111111111",
      fallbackGoalId: "fallback-goal",
      fallbackDate: "2026-08-01",
      desiredFactState: "absent",
      expectation: {
        planGoalId: "33000000-0000-4000-8000-000000000001",
        expectedCanonicalRevision: 4,
        expectedExecutionRevision: 5,
      },
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        goalId: "10000000-0000-4000-8000-000000000011",
        date: "2026-08-05",
        factState: "absent",
      },
    });
  });
});
