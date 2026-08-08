-- Additive Phase 11:
-- Remove legacy planner_preferences compatibility surface after profile-backed cutover.

drop function if exists public.upsert_planner_preferences_service(
  uuid,
  text,
  jsonb,
  text,
  text,
  timestamptz
);

drop table if exists public.planner_preferences;

drop function if exists private.prepare_planner_preferences();
