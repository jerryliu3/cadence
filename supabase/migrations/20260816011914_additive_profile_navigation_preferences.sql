alter table public.profiles
  add column if not exists planner_primary_tab text;

update public.profiles
set planner_primary_tab = coalesce(planner_primary_tab, 'checklist')
where planner_primary_tab is null;

alter table public.profiles
  alter column planner_primary_tab set default 'checklist',
  alter column planner_primary_tab set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_planner_primary_tab_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_planner_primary_tab_check
      check (planner_primary_tab in ('calendar', 'checklist'));
  end if;
end;
$$;
