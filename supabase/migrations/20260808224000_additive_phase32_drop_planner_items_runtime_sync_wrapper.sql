-- Additive Phase 32:
-- Remove the planner_items runtime sync compatibility wrapper now that planner
-- APIs read/write planner_items directly.

drop function if exists public.sync_planner_items_from_active_execution_plan_service(
  uuid
);
