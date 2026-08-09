// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  applyPlannerItemDateFact: vi.fn(),
  applyPlannerGoalDateFact: vi.fn(),
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

vi.mock("@/lib/planner/exact-date-dispatch", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/planner/exact-date-dispatch")
  >("@/lib/planner/exact-date-dispatch");
  return {
    ...actual,
    applyPlannerItemDateFact: mocks.applyPlannerItemDateFact,
    applyPlannerGoalDateFact: mocks.applyPlannerGoalDateFact,
  };
});

import { POST } from "./route";

const goalId = "10000000-0000-4000-8000-000000000011";

function request(
  date: string,
  desiredFactState: "present" | "absent",
  timezone = "UTC",
  extra: Record<string, unknown> = {}
) {
  return new Request("http://localhost/api/completions", {
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

describe("completions route", () => {
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
    mocks.applyPlannerItemDateFact.mockReset();
    mocks.applyPlannerGoalDateFact.mockReset();
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

  it("returns legacy validation message without raw zod issues", async () => {
    const response = await POST(
      new Request("http://localhost/api/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goalId,
          desiredFactState: "present",
          timezone: "UTC",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      code: string;
      message: string;
      details?: unknown;
    };
    expect(body).toEqual(
      expect.objectContaining({
        code: "validation_failed",
        message: "Provide a goal, date, desired state, and valid timezone.",
      })
    );
    expect(body.details).toBeUndefined();
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

  it("routes planner item expectation payloads through planner item dispatch", async () => {
    mocks.applyPlannerItemDateFact.mockResolvedValue({
      ok: true,
      payload: {
        goalId,
        date: "2026-08-05",
        factState: "present",
      },
    });

    const response = await POST(
      request("2026-08-05", "present", "UTC", {
        plannerItemExpectation: {
          itemId: "22000000-0000-4000-8000-000000000001",
          expectedDigest:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.applyPlannerItemDateFact).toHaveBeenCalledWith(
      expect.objectContaining({
        goalId,
        desiredFactState: "present",
        timezone: "UTC",
        expectation: {
          itemId: "22000000-0000-4000-8000-000000000001",
          expectedDigest:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      })
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("routes planner goal expectation payloads through planner goal dispatch", async () => {
    mocks.applyPlannerGoalDateFact.mockResolvedValue({
      ok: true,
      payload: {
        goalId,
        date: "2026-08-05",
        factState: "absent",
      },
    });

    const response = await POST(
      request("2026-08-05", "absent", "UTC", {
        plannerGoalExpectation: {
          expectedDigest:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.applyPlannerGoalDateFact).toHaveBeenCalledWith(
      expect.objectContaining({
        goalId,
        desiredFactState: "absent",
        timezone: "UTC",
        expectation: {
          expectedDigest:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      })
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
