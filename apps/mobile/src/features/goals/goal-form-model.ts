import { format } from "date-fns";
import type { Database } from "@cadence/shared/supabase/database.types";

type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
type CreateGoalArgs = Database["public"]["Functions"]["create_goal"]["Args"];
type UpdateGoalArgs = Database["public"]["Functions"]["update_goal"]["Args"];

type JoinedColumns<TColumns extends readonly string[]> =
  TColumns extends readonly [
    infer TFirst extends string,
    ...infer TRest extends readonly string[],
  ]
    ? TRest["length"] extends 0
      ? TFirst
      : `${TFirst},${JoinedColumns<TRest>}`
    : "";

function joinColumns<const TColumns extends readonly string[]>(
  columns: TColumns
): JoinedColumns<TColumns> {
  return columns.join(",") as JoinedColumns<TColumns>;
}

const MOBILE_GOAL_EDIT_COLUMNS = [
  "id",
  "title",
  "description",
  "reward_text",
  "category",
  "category_key",
  "color",
  "frequency_type",
  "recurrence_interval",
  "target_count",
  "milestone_names",
  "start_date",
  "end_date",
  "default_local_time",
  "team_id",
  "is_private",
] as const satisfies readonly (keyof GoalRow)[];

export type MobileGoalEditSnapshot = Pick<
  GoalRow,
  (typeof MOBILE_GOAL_EDIT_COLUMNS)[number]
>;

export const MOBILE_GOAL_EDIT_SELECT = joinColumns(MOBILE_GOAL_EDIT_COLUMNS);

export function buildMobileGoalCreateArgs(
  title: string,
  id: string
): CreateGoalArgs {
  return {
    p_id: id,
    p_title: title.trim(),
    p_category: "General",
    p_frequency_type: "recurring",
    p_recurrence_interval: "daily",
    p_start_date: format(new Date(), "yyyy-MM-dd"),
    p_is_private: false,
  };
}

export function buildMobileGoalUpdateArgs(
  existingGoal: MobileGoalEditSnapshot,
  title: string
): UpdateGoalArgs {
  return {
    p_id: existingGoal.id,
    p_title: title.trim(),
    p_description: existingGoal.description ?? undefined,
    p_reward_text: existingGoal.reward_text ?? undefined,
    p_category: existingGoal.category,
    p_category_key: existingGoal.category_key ?? undefined,
    p_color: existingGoal.color ?? undefined,
    p_frequency_type: existingGoal.frequency_type,
    p_recurrence_interval: existingGoal.recurrence_interval ?? undefined,
    p_target_count: existingGoal.target_count ?? undefined,
    p_milestone_names: existingGoal.milestone_names ?? undefined,
    p_start_date: existingGoal.start_date,
    p_end_date: existingGoal.end_date ?? undefined,
    p_default_local_time: existingGoal.default_local_time ?? undefined,
    p_team_id: existingGoal.team_id ?? undefined,
    p_is_private: existingGoal.is_private,
  };
}
