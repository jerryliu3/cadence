-- Additive Phase 20:
-- Drop orphan legacy database surfaces that are no longer reachable
-- after planner preference and completion backfill cutovers.

drop function if exists private.bump_canonical_for_preferences();

drop table if exists public.completion_backfill_log;
