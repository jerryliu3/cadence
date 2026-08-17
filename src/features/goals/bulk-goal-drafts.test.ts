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

  it("maps milestone arrays from parser output without delimiter loss", () => {
    const [draft] = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "5k training block",
        frequency_type: "fixed_milestones",
        target_count: 3,
        start_date: "2026-08-17",
        end_date: "2026-09-13",
        milestone_names: [
          "Easy run 3 mi",
          "Tempo 4x800 | controlled",
          "Long run 6 mi",
        ],
      },
    ]);

    expect(draft.milestone_names).toEqual([
      "Easy run 3 mi",
      "Tempo 4x800 | controlled",
      "Long run 6 mi",
    ]);
    expect(draft.errors).toEqual([]);
  });

  it("normalizes milestone arrays to target count by trimming or padding", () => {
    const [trimmedDraft] = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Trimmed milestones",
        frequency_type: "fixed_milestones",
        target_count: 2,
        start_date: "2026-08-17",
        end_date: "2026-09-13",
        milestone_names: ["One", "Two", "Three"],
      },
    ]);
    const [paddedDraft] = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Padded milestones",
        frequency_type: "fixed_milestones",
        target_count: 3,
        start_date: "2026-08-17",
        end_date: "2026-09-13",
        milestone_names: ["One", "Two"],
      },
    ]);

    expect(trimmedDraft.milestone_names).toEqual(["One", "Two"]);
    expect(paddedDraft.milestone_names).toEqual(["One", "Two", ""]);
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

  it("keeps schedule summaries renderable while dates are being edited", () => {
    const [draft] = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Easy run",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      },
    ]);

    expect(
      summarizeBulkGoalDraftSchedule({ ...draft, start_date: "" })
    ).toBe("Weekly · Start date required");
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
