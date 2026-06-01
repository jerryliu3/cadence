update public.goals
set frequency_type = 'fixed_milestones',
    target_count = coalesce(target_count, 1)
where frequency_type = 'one_time';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_no_one_time_frequency'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
    add constraint goals_no_one_time_frequency
    check (frequency_type <> 'one_time');
  end if;
end $$;
