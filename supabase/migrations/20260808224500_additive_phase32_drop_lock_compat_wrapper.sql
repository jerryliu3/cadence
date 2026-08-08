-- Additive Phase 32:
-- Drop the 2-argument lock helper now that all callers provide expected_digest.

drop function if exists public.set_planner_item_lock(uuid, boolean);
