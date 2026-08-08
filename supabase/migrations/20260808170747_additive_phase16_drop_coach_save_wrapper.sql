-- Additive Phase 16:
-- Remove legacy service wrappers whose runtime callsites are gone.
-- Coach save now writes public coach tables directly.
-- Planner item move route is deleted in favor of schedule-based flows.

drop function if exists public.save_planner_coach_conversation_service(
  uuid,
  text,
  text,
  jsonb,
  text
);

drop function if exists public.move_execution_plan_item_service(
  uuid,
  uuid,
  date,
  bigint,
  bigint,
  bigint
);
