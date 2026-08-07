do $$
begin
  -- Open-ended definitions are allowed only for recurring cadence goals.
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
      -- Not validating historical rows keeps legacy over-limit definitions non-fatal
      -- until users edit them, while still enforcing all new writes.
      not valid;
  end if;
end $$;

do $$
begin
  -- Keep the 24-month cap aligned with src/lib/planner/contracts/bounds.ts MAX_HORIZON_MONTHS.
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
      -- Not validating historical rows keeps legacy over-limit definitions non-fatal
      -- until users edit them, while still enforcing all new writes.
      not valid;
  end if;
end $$;
