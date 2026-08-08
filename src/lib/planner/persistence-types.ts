import type { Database } from "@/lib/supabase/database.types";

type PublicPlannerTables = Pick<
  Database["public"]["Tables"],
  | "execution_plans"
  | "execution_plan_goals"
  | "execution_plan_days"
  | "execution_plan_items"
  | "execution_plan_issues"
>;

export type PlannerPersistenceTableName = keyof PublicPlannerTables;

export type PlannerPersistenceRow<
  Table extends PlannerPersistenceTableName,
> = PublicPlannerTables[Table]["Row"];

type GeneratedPlannerPersistenceInsert<
  Table extends PlannerPersistenceTableName,
> = PublicPlannerTables[Table]["Insert"];

export type PlannerPersistenceInsert<
  Table extends PlannerPersistenceTableName,
> = Table extends "execution_plan_goals"
  ? Omit<
      GeneratedPlannerPersistenceInsert<Table>,
      "original_goal_id"
    > & { original_goal_id?: never }
  : GeneratedPlannerPersistenceInsert<Table>;

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

export type ExecutionPlanInsert =
  PlannerPersistenceInsert<"execution_plans">;
export type ExecutionPlanGoalInsert =
  PlannerPersistenceInsert<"execution_plan_goals">;
export type ExecutionPlanDayInsert =
  PlannerPersistenceInsert<"execution_plan_days">;
export type ExecutionPlanItemInsert =
  PlannerPersistenceInsert<"execution_plan_items">;
export type ExecutionPlanIssueInsert =
  PlannerPersistenceInsert<"execution_plan_issues">;
