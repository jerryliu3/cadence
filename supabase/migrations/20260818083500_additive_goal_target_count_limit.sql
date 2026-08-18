-- Clamp any oversized legacy targets before enforcing the cap globally.
update public.goals
set target_count = 1000
where target_count > 1000;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_target_count_max_1000'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
      add constraint goals_target_count_max_1000
      check (target_count is null or target_count <= 1000);
  end if;
end $$;
