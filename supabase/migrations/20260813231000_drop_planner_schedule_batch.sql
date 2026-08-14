-- Save now publishes one contiguous window through set_planner_schedule.
-- Reset-all deletes through clear_planner_schedule_windows. Drop the leftover
-- multi-scope write path so empty-item batch publishes cannot come back.

drop function if exists public.set_planner_schedule_batch(jsonb, text);
