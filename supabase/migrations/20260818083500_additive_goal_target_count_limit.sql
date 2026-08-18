-- Enforce planner-safe target bounds for new and updated goals without
-- failing migration on legacy oversized rows.
alter table public.goals
  add constraint goals_target_count_max_1000
  check (target_count is null or target_count <= 1000)
  not valid;
