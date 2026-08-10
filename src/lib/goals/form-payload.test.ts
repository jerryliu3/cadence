import { describe, expect, it } from "vitest";
import { buildGoalRowPayload } from "./form-payload";

const baseFields = {
  title: "  Read books  ",
  description: "  Twenty books this year  ",
  category_selection: "personal" as const,
  custom_category: "",
  color: "#123456",
  frequency_type: "recurring" as const,
  recurrence_interval: "weekly" as const,
  target_count: "20",
  milestone_names: [],
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  default_local_time: " 08:30 ",
  is_group: false,
};

describe("buildGoalRowPayload", () => {
  it("builds recurring goal payloads with optional total target", () => {
    expect(
      buildGoalRowPayload(baseFields, {
        ownerId: "user-1",
        goalId: "goal-1",
      })
    ).toMatchObject({
      id: "goal-1",
      owner_id: "user-1",
      title: "Read books",
      description: "Twenty books this year",
      recurrence_interval: "weekly",
      target_count: 20,
      default_local_time: "08:30",
    });
  });

  it("builds fixed milestone payloads with normalized milestone names", () => {
    const payload = buildGoalRowPayload(
      {
        ...baseFields,
        frequency_type: "fixed_milestones",
        target_count: "3",
        milestone_names: ["", "Middle", ""],
      },
      {
        ownerId: "user-1",
        includeDeletedFlag: true,
      }
    );

    expect(payload.recurrence_interval).toBeNull();
    expect(payload.target_count).toBe(3);
    expect(payload.milestone_names).toEqual([
      "Milestone 1",
      "Middle",
      "Milestone 3",
    ]);
    expect(payload.is_deleted).toBe(false);
  });

  it("falls back to category color when enabled and color is invalid", () => {
    const payload = buildGoalRowPayload(
      {
        ...baseFields,
        color: "invalid",
      },
      {
        ownerId: "user-1",
        fallbackInvalidHexColor: true,
      }
    );

    expect(payload.color).toBe("#6366f1");
  });
});
