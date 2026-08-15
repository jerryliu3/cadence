import { describe, expect, it } from "vitest";
import {
  buildMobileGoalUpdateArgs,
  type MobileGoalEditSnapshot,
} from "./goal-form-model";

describe("mobile goal form model", () => {
  it("changes only the title when updating a complete goal snapshot", () => {
    const existingGoal = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Old title",
      description: "Keep the full description",
      reward_text: "Weekend hike",
      category: "Health",
      category_key: "health",
      color: "#123456",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 3,
      milestone_names: ["First", "Second"],
      start_date: "2026-08-01",
      end_date: "2026-12-31",
      default_local_time: "07:30:00",
      team_id: "22222222-2222-4222-8222-222222222222",
      is_private: false,
    } satisfies MobileGoalEditSnapshot;

    expect(buildMobileGoalUpdateArgs(existingGoal, "New title")).toEqual({
      p_id: existingGoal.id,
      p_title: "New title",
      p_description: existingGoal.description,
      p_reward_text: existingGoal.reward_text,
      p_category: existingGoal.category,
      p_category_key: existingGoal.category_key,
      p_color: existingGoal.color,
      p_frequency_type: existingGoal.frequency_type,
      p_recurrence_interval: existingGoal.recurrence_interval,
      p_target_count: existingGoal.target_count,
      p_milestone_names: existingGoal.milestone_names,
      p_start_date: existingGoal.start_date,
      p_end_date: existingGoal.end_date,
      p_default_local_time: existingGoal.default_local_time,
      p_team_id: existingGoal.team_id,
      p_is_private: existingGoal.is_private,
    });
  });
});
