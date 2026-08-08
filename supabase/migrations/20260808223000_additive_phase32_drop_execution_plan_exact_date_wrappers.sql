-- Additive Phase 32:
-- Drop legacy execution-plan exact-date wrappers now that runtime dispatches
-- use planner_items digest checks plus direct completion writes.

drop function if exists public.set_execution_plan_goal_date_fact_service(
  uuid,
  uuid,
  date,
  text,
  bigint,
  bigint
);

drop function if exists public.set_execution_plan_item_date_fact_service(
  uuid,
  uuid,
  text,
  jsonb,
  bigint,
  bigint,
  bigint
);
