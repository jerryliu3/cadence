-- Clamp any oversized legacy targets before enforcing the cap globally.
update public.goals
set target_count = 1000
where target_count > 1000;

alter table public.goals
  add constraint goals_target_count_max_1000
  check (target_count is null or target_count <= 1000);
