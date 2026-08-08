import type { Database } from "@/lib/supabase/database.types";

type PublicPlannerTables = Pick<
  Database["public"]["Tables"],
  | "execution_plans"
  | "execution_plan_goals"
  | "execution_plan_days"
  | "execution_plan_items"
  | "execution_plan_issues"
>;

type PlannerPersistenceRow<Table extends keyof PublicPlannerTables> =
  PublicPlannerTables[Table]["Row"];

export type ExecutionPlanRow =
  PlannerPersistenceRow<"execution_plans">;
export type ExecutionPlanGoalRow =
  PlannerPersistenceRow<"execution_plan_goals">;
export type ExecutionPlanDayRow =
  PlannerPersistenceRow<"execution_plan_days">;
export type ExecutionPlanItemRow =
  PlannerPersistenceRow<"execution_plan_items">;
export type ExecutionPlanIssueRow =
  PlannerPersistenceRow<"execution_plan_issues">;
