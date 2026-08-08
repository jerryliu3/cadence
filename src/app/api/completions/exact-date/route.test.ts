// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  callAdminRpc: vi.fn(),
  requirePlannerAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: mocks.maybeSingle,
    };
    return {
      auth: { getUser: mocks.getUser },
      from: vi.fn(() => query),
      rpc: mocks.rpc,
    };
  },
}));

vi.mock("@/lib/planner/api", () => ({
  requirePlannerAdminClient: mocks.requirePlannerAdminClient,
}));

vi.mock("@/lib/supabase/admin-rpc", () => ({
  callAdminRpc: mocks.callAdminRpc,
}));

import { POST } from "./route";

const goalId = "10000000-0000-4000-8000-000000000011";

function request(
  date: string,
  desiredFactState: "present" | "absent",
  timezone = "UTC",
  extra: Record<string, unknown> = {}
) {
  return new Request("http://localhost/api/completions/exact-date", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      goalId,
      date,
      desiredFactState,
      timezone,
      ...extra,
    }),
  });
}

describe("exact-date completion route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T13:00:00.000Z"));
    vi.stubEnv("CALENDAR_ENABLED", "true");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: goalId,
        frequency_type: "recurring",
        target_count: 12,
        start_date: "2026-08-01",
        end_date: "2026-08-31",
      },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.requirePlannerAdminClient.mockReturnValue({});
    mocks.callAdminRpc.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("rejects future creation in the requested timezone", async () => {
    const response = await POST(request("2026-08-06", "present"));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "future_completion_not_allowed",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses a timezone-ahead local date for creation bounds", async () => {
    const response = await POST(
      request("2026-08-06", "present", "Pacific/Auckland")
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("mark_goal_complete", {
      p_goal_id: goalId,
      p_date: "2026-08-06",
    });
  });

  it("rejects creation outside the goal lifetime", async () => {
    const response = await POST(request("2026-07-31", "present"));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "completion_outside_goal_lifetime",
    });
  });

  it("allows exact deletion of a future repair fact", async () => {
    const response = await POST(request("2026-08-31", "absent"));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("unmark_goal_complete", {
      p_goal_id: goalId,
      p_date: "2026-08-31",
    });
  });

  it("supports exact-date completion for non-targeted goals", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: goalId,
        start_date: "2026-08-01",
        end_date: "2026-08-31",
      },
      error: null,
    });

    const response = await POST(request("2026-08-05", "present"));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("mark_goal_complete", {
      p_goal_id: goalId,
      p_date: "2026-08-05",
    });
  });

  it("routes planner item expectation payloads through the item date-fact RPC", async () => {
    mocks.callAdminRpc.mockResolvedValue({
      data: [
        {
          item_id: "22000000-0000-4000-8000-000000000001",
          goal_id: goalId,
          date: "2026-08-05",
          fact_state: "present",
        },
      ],
      error: null,
    });

    const response = await POST(
      request("2026-08-05", "present", "UTC", {
        plannerItemExpectation: {
          itemId: "22000000-0000-4000-8000-000000000001",
          expectedCreditedUnit: null,
          expectedItemRevision: 4,
          expectedCanonicalRevision: 10,
          expectedExecutionRevision: 11,
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.callAdminRpc).toHaveBeenCalledWith(
      {},
      "set_execution_plan_item_date_fact_service",
      expect.objectContaining({
        p_owner: "11111111-1111-4111-8111-111111111111",
        p_item_id: "22000000-0000-4000-8000-000000000001",
        p_desired_fact_state: "present",
        p_expected_item_revision: 4,
      })
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("routes planner goal expectation payloads through the plan-goal date-fact RPC", async () => {
    mocks.callAdminRpc.mockResolvedValue({
      data: [
        {
          goal_id: goalId,
          date: "2026-08-05",
          fact_state: "absent",
        },
      ],
      error: null,
    });

    const response = await POST(
      request("2026-08-05", "absent", "UTC", {
        plannerGoalExpectation: {
          planGoalId: "33000000-0000-4000-8000-000000000001",
          expectedCanonicalRevision: 5,
          expectedExecutionRevision: 6,
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.callAdminRpc).toHaveBeenCalledWith(
      {},
      "set_execution_plan_goal_date_fact_service",
      expect.objectContaining({
        p_owner: "11111111-1111-4111-8111-111111111111",
        p_plan_goal_id: "33000000-0000-4000-8000-000000000001",
        p_desired_fact_state: "absent",
      })
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
