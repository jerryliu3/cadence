import { describe, expect, it, vi } from "vitest";
import {
  buildBulkGoalDraftFromRow,
  buildBulkGoalDraftsFromLlmGoals,
  prepareBulkGoalRows,
  summarizeBulkGoalDraftSchedule,
} from "@/features/goals/bulk-goal-drafts";

describe("bulk goal drafts", () => {
  it("normalizes parser goals through the canonical draft model", () => {
    const [draft] = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Easy run",
        category: "Health",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        target_count: 4,
        start_date: "2026-08-17",
        end_date: "2026-09-13",
        default_local_time: "07:30",
      },
    ]);

    expect(draft).toMatchObject({
      include: true,
      title: "Easy run",
      category_selection: "health",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: "4",
      start_date: "2026-08-17",
      end_date: "2026-09-13",
      default_local_time: "07:30",
      errors: [],
    });
  });

  it("supplies canonical milestone defaults for fixed goals", () => {
    const draft = buildBulkGoalDraftFromRow(
      {
        title: "Ship launch plan",
        frequency_type: "fixed",
        target_count: "2",
        start_date: "2026-08-17",
        end_date: "2026-09-13",
      },
      0
    );

    expect(draft.milestone_names).toEqual(["", ""]);
    expect(draft.errors).toEqual([]);
  });

  it("formats the schedule summary used by both review surfaces", () => {
    const [draft] = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Easy run",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
        end_date: "2026-09-13",
      },
    ]);

    expect(summarizeBulkGoalDraftSchedule(draft)).toBe(
      "Weekly · Aug 17 – Sep 13"
    );
  });

  it("prepares the existing create_goals row shape", () => {
    const [draft] = buildBulkGoalDraftsFromLlmGoals([
      {
        title: " Easy run ",
        description: " Base building ",
        category: "Health",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        target_count: 4,
        start_date: "2026-08-17",
        end_date: "2026-09-13",
      },
    ]);

    const [prepared] = prepareBulkGoalRows([draft], {
      createId: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
    });

    expect(prepared).toEqual({
      draft,
      goalId: "11111111-1111-4111-8111-111111111111",
      row: {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Easy run",
        description: "Base building",
        category_key: "health",
        category: "Health",
        color: "#10b981",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        target_count: 4,
        milestone_names: null,
        start_date: "2026-08-17",
        end_date: "2026-09-13",
        default_local_time: null,
      },
    });
  });
});
