do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_deadline_required_by_requirement'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
      add constraint goals_deadline_required_by_requirement
      check (
        end_date is not null
        or (
          frequency_type = 'recurring'
          and (target_count is null or target_count <= 0)
        )
      )
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_deadline_horizon_max_24_months'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
      add constraint goals_deadline_horizon_max_24_months
      check (
        end_date is null
        or (
          (
            (extract(year from end_date)::int * 12 + extract(month from end_date)::int)
            - (extract(year from start_date)::int * 12 + extract(month from start_date)::int)
            + 1
          ) <= 24
        )
      )
      not valid;
  end if;
end $$;
