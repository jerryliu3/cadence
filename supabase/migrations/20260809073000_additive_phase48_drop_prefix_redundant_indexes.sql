-- Additive Phase 48:
-- Drop non-unique indexes that are fully covered by the leading column order
-- of existing unique indexes on the same tables.

drop index if exists public.completions_goal_idx;
drop index if exists public.goal_links_source_idx;
drop index if exists public.goal_participants_goal_idx;
drop index if exists public.goal_shares_goal_idx;
drop index if exists public.planner_items_goal_idx;
