import { describe, expect, it, vi } from "vitest";
import {
  applyPlannerGoalDateFact,
  applyPlannerItemDateFact,
  targetedExactDateRequestSchema,
} from "./exact-date-dispatch";

const goalId = "10000000-0000-4000-8000-000000000011";

describe("exact-date dispatch schema", () => {
  it("rejects payloads that provide both planner expectations", () => {
    const parsed = targetedExactDateRequestSchema.safeParse({
      goalId,
      date: "2026-08-05",
      desiredFactState: "present",
      timezone: "UTC",
      plannerItemExpectation: {
        itemId: "22000000-0000-4000-8000-000000000001",
        expectedDigest:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      plannerGoalExpectation: {
        expectedDigest:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });

    expect(parsed.success).toBe(false);
  });
});

describe("exact-date dispatch helpers", () => {
  it("maps stale digest mismatch to stale revision for item dispatch", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        error: null,
      }),
      from: vi.fn(),
    } as unknown as Parameters<typeof applyPlannerItemDateFact>[0]["supabase"];

    const result = await applyPlannerItemDateFact({
      supabase,
      goalId,
      desiredFactState: "present",
      timezone: "UTC",
      goalLifetime: { startDate: "2026-08-01", endDate: "2026-08-31" },
      expectation: {
        itemId: "22000000-0000-4000-8000-000000000001",
        expectedDigest:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      code: "stale_revision",
      message: "Planner completion state is stale. Refresh and try again.",
    });
  });

  it("uses planner item scheduled date for completion RPC writes", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const plannerItemQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    plannerItemQuery.select.mockReturnValue(plannerItemQuery);
    plannerItemQuery.eq.mockReturnValue(plannerItemQuery);
    plannerItemQuery.maybeSingle.mockResolvedValue({
      data: {
        id: "22000000-0000-4000-8000-000000000001",
        goal_id: goalId,
        scheduled_date: "2026-08-03",
      },
      error: null,
    });
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "planner_items") {
          return plannerItemQuery;
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as unknown as Parameters<typeof applyPlannerItemDateFact>[0]["supabase"];

    const result = await applyPlannerItemDateFact({
      supabase,
      goalId,
      desiredFactState: "present",
      timezone: "UTC",
      goalLifetime: { startDate: "2026-08-01", endDate: "2026-08-31" },
      expectation: {
        itemId: "22000000-0000-4000-8000-000000000001",
        expectedDigest:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        goalId,
        date: "2026-08-03",
        factState: "present",
      },
    });
    expect(rpc).toHaveBeenLastCalledWith("mark_goal_complete", {
      p_goal_id: goalId,
      p_date: "2026-08-03",
    });
  });

  it("rejects planner goal dispatch for linked goals", async () => {
    const sourceGoalLinksQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn(),
    };
    sourceGoalLinksQuery.select.mockReturnValue(sourceGoalLinksQuery);
    sourceGoalLinksQuery.eq.mockReturnValue(sourceGoalLinksQuery);
    sourceGoalLinksQuery.limit.mockResolvedValue({
      data: [{ id: "link-1" }],
      error: null,
    });
    const targetGoalLinksQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn(),
    };
    targetGoalLinksQuery.select.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.eq.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.limit.mockResolvedValue({
      data: [],
      error: null,
    });

    let goalLinksCall = 0;
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        error: null,
      }),
      from: vi.fn((table: string) => {
        if (table !== "goal_links") {
          throw new Error(`unexpected table: ${table}`);
        }
        goalLinksCall += 1;
        return goalLinksCall === 1 ? sourceGoalLinksQuery : targetGoalLinksQuery;
      }),
    } as unknown as Parameters<typeof applyPlannerGoalDateFact>[0]["supabase"];

    const result = await applyPlannerGoalDateFact({
      supabase,
      goalId,
      date: "2026-08-05",
      desiredFactState: "present",
      timezone: "UTC",
      goalLifetime: { startDate: "2026-08-01", endDate: "2026-08-31" },
      expectation: {
        expectedDigest:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 422,
      code: "linked_goal_disallowed",
      message: "Linked goals cannot be completed through plan-goal date facts.",
    });
  });
});
