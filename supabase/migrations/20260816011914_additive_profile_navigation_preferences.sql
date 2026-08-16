alter table public.profiles
  add column if not exists default_main_page text,
  add column if not exists planner_primary_tab text;

update public.profiles
set
  default_main_page = coalesce(default_main_page, 'calendar'),
  planner_primary_tab = coalesce(planner_primary_tab, 'checklist')
where default_main_page is null
   or planner_primary_tab is null;

alter table public.profiles
  alter column default_main_page set default 'calendar',
  alter column default_main_page set not null,
  alter column planner_primary_tab set default 'checklist',
  alter column planner_primary_tab set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_default_main_page_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_default_main_page_check
      check (default_main_page in ('calendar', 'checklist', 'insights'));
  end if;

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
