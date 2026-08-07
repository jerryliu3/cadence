alter table public.goals
add column if not exists default_local_time text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_default_local_time_format'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
    add constraint goals_default_local_time_format check (
      default_local_time is null
      or default_local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    );
  end if;
end;
$$;
