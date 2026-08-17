import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBulkGoalDraftsFromLlmGoals } from "@/features/goals/bulk-goal-drafts";
import {
  createCoachGoalDrafts,
  parseCoachGoalDrafts,
} from "@/features/planner/coach/coach-goal-draft-service";

const postJsonMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client"
  );
  return { ...actual, postJson: postJsonMock };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

describe("coach goal draft service", () => {
  beforeEach(() => {
    postJsonMock.mockReset();
    rpcMock.mockReset();
  });

  it("uses the confirmed planner timezone when parsing", async () => {
    postJsonMock.mockResolvedValue({
      goals: [
        {
          title: "Easy run",
          frequency_type: "recurring",
          recurrence_interval: "weekly",
          start_date: "2026-08-17",
        },
      ],
      warnings: [],
    });

    const result = await parseCoachGoalDrafts({
      parserPrompt: "Easy run weekly.",
      timezone: "America/Los_Angeles",
    });

    expect(postJsonMock).toHaveBeenCalledWith("/api/bulk-goals/parse", {
      prompt: "Easy run weekly.",
      timezone: "America/Los_Angeles",
    }, {
      timeoutMs: 45_000,
    });
    expect(result.drafts[0]?.title).toBe("Easy run");
  });

  it("rejects parser responses over the five-goal coach cap", async () => {
    postJsonMock.mockResolvedValue({
      goals: Array.from({ length: 6 }, (_, index) => ({
        title: `Goal ${index + 1}`,
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      })),
    });

    await expect(
      parseCoachGoalDrafts({
        parserPrompt: "Build a plan.",
        timezone: "UTC",
      })
    ).rejects.toMatchObject({ code: "too_many_goals" });
  });

  it("persists only selected validated drafts through create_goals", async () => {
    const drafts = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Easy run",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      },
      {
        title: "Mobility",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      },
    ]);
    drafts[1] = { ...drafts[1]!, include: false };
    rpcMock.mockResolvedValue({ error: null });

    await expect(createCoachGoalDrafts({ drafts })).resolves.toEqual({
      createdCount: 1,
    });
    expect(rpcMock).toHaveBeenCalledWith("create_goals", {
      p_goals: [
        expect.objectContaining({
          title: "Easy run",
          recurrence_interval: "weekly",
        }),
      ],
    });
  });
});
