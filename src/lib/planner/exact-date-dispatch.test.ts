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

  it("rejects planner goal dispatch when a linked source still covers the date", async () => {
    const targetGoalLinksQuery = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
    };
    targetGoalLinksQuery.select.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.in.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.eq
      .mockResolvedValueOnce({
      data: [
        {
          source_goal_id: "22000000-0000-4000-8000-000000000099",
          target_goal_id: goalId,
          source: {
            id: "22000000-0000-4000-8000-000000000099",
            owner_id: "owner-a",
            start_date: "2026-01-01",
            end_date: "2026-12-31",
            frequency_type: "recurring",
            target_count: null,
            is_deleted: false,
            archived_at: null,
          },
        },
      ],
      error: null,
      })
      .mockResolvedValueOnce({
      data: [],
      error: null,
      });
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        error: null,
      }),
      from: vi.fn((table: string) => {
        if (table !== "goal_links") {
          throw new Error(`unexpected table: ${table}`);
        }
        return targetGoalLinksQuery;
      }),
    } as unknown as Parameters<typeof applyPlannerGoalDateFact>[0]["supabase"];

    const result = await applyPlannerGoalDateFact({
      supabase,
      ownerId: "owner-a",
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
      message:
        "Linked target goals cannot be completed through plan-goal date facts.",
    });
  });

  it("rejects planner goal dispatch when suppression comes from an ancestor behind a deleted intermediate", async () => {
    const intermediateId = "22000000-0000-4000-8000-000000000090";
    const ancestorId = "22000000-0000-4000-8000-000000000091";
    const targetGoalLinksQuery = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
    };
    targetGoalLinksQuery.select.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.in.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.eq
      .mockResolvedValueOnce({
        data: [
          {
            source_goal_id: intermediateId,
            target_goal_id: goalId,
            source: {
              id: intermediateId,
              owner_id: "owner-a",
              start_date: "2026-01-01",
              end_date: "2026-12-31",
              frequency_type: "recurring",
              target_count: null,
              is_deleted: true,
              archived_at: null,
            },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            source_goal_id: ancestorId,
            target_goal_id: intermediateId,
            source: {
              id: ancestorId,
              owner_id: "owner-a",
              start_date: "2026-01-01",
              end_date: "2026-12-31",
              frequency_type: "recurring",
              target_count: null,
              is_deleted: false,
              archived_at: null,
            },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [],
        error: null,
      });
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        error: null,
      }),
      from: vi.fn((table: string) => {
        if (table !== "goal_links") {
          throw new Error(`unexpected table: ${table}`);
        }
        return targetGoalLinksQuery;
      }),
    } as unknown as Parameters<typeof applyPlannerGoalDateFact>[0]["supabase"];

    const result = await applyPlannerGoalDateFact({
      supabase,
      ownerId: "owner-a",
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
      message:
        "Linked target goals cannot be completed through plan-goal date facts.",
    });
  });

  it("allows planner goal dispatch when the linked source already ended", async () => {
    const targetGoalLinksQuery = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
    };
    targetGoalLinksQuery.select.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.in.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.eq
      .mockResolvedValueOnce({
      data: [
        {
          source_goal_id: "22000000-0000-4000-8000-000000000098",
          target_goal_id: goalId,
          source: {
            id: "22000000-0000-4000-8000-000000000098",
            owner_id: "owner-a",
            start_date: "2026-01-01",
            end_date: "2026-07-31",
            frequency_type: "recurring",
            target_count: null,
            is_deleted: false,
            archived_at: null,
          },
        },
      ],
      error: null,
      })
      .mockResolvedValueOnce({
      data: [],
      error: null,
      });

    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table !== "goal_links") {
          throw new Error(`unexpected table: ${table}`);
        }
        return targetGoalLinksQuery;
      }),
    } as unknown as Parameters<typeof applyPlannerGoalDateFact>[0]["supabase"];

    const result = await applyPlannerGoalDateFact({
      supabase,
      ownerId: "owner-a",
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
      ok: true,
      payload: {
        goalId,
        date: "2026-08-05",
        factState: "present",
      },
    });
    expect(rpc).toHaveBeenLastCalledWith("mark_goal_complete", {
      p_goal_id: goalId,
      p_date: "2026-08-05",
    });
  });

  it("allows planner goal dispatch when source is soft-deleted or archived", async () => {
    const targetGoalLinksQuery = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
    };
    targetGoalLinksQuery.select.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.in.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.eq
      .mockResolvedValueOnce({
      data: [
        {
          source_goal_id: "22000000-0000-4000-8000-000000000097",
          target_goal_id: goalId,
          source: {
            id: "22000000-0000-4000-8000-000000000097",
            owner_id: "owner-a",
            start_date: "2026-01-01",
            end_date: "2026-12-31",
            frequency_type: "recurring",
            target_count: null,
            is_deleted: true,
            archived_at: null,
          },
        },
        {
          source_goal_id: "22000000-0000-4000-8000-000000000096",
          target_goal_id: goalId,
          source: {
            id: "22000000-0000-4000-8000-000000000096",
            owner_id: "owner-a",
            start_date: "2026-01-01",
            end_date: "2026-12-31",
            frequency_type: "recurring",
            target_count: null,
            is_deleted: false,
            archived_at: "2026-01-02T00:00:00Z",
          },
        },
      ],
      error: null,
      })
      .mockResolvedValueOnce({
      data: [],
      error: null,
      });
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table !== "goal_links") {
          throw new Error(`unexpected table: ${table}`);
        }
        return targetGoalLinksQuery;
      }),
    } as unknown as Parameters<typeof applyPlannerGoalDateFact>[0]["supabase"];

    const result = await applyPlannerGoalDateFact({
      supabase,
      ownerId: "owner-a",
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
      ok: true,
      payload: {
        goalId,
        date: "2026-08-05",
        factState: "present",
      },
    });
  });

  it("returns lookup failure when goal link embed read fails", async () => {
    const targetGoalLinksQuery = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
    };
    targetGoalLinksQuery.select.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.in.mockReturnValue(targetGoalLinksQuery);
    targetGoalLinksQuery.eq
      .mockResolvedValueOnce({
      data: null,
      error: { message: "db fail" },
      });
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        error: null,
      }),
      from: vi.fn((table: string) => {
        if (table !== "goal_links") {
          throw new Error(`unexpected table: ${table}`);
        }
        return targetGoalLinksQuery;
      }),
    } as unknown as Parameters<typeof applyPlannerGoalDateFact>[0]["supabase"];

    const result = await applyPlannerGoalDateFact({
      supabase,
      ownerId: "owner-a",
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
      status: 503,
      code: "planner_goal_lookup_failed",
      message: "Planner goal state could not be loaded.",
    });
  });
});
