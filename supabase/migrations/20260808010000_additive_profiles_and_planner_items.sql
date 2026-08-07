-- Additive Phase 1 (part A):
-- Introduce profile preference columns and planner_items without deleting legacy planner tables.

alter table public.profiles
add column if not exists timezone text;

alter table public.profiles
add column if not exists timezone_confirmed_at timestamptz;

alter table public.profiles
add column if not exists week_starts_on smallint;

alter table public.profiles
add column if not exists rest_weekdays smallint[];

alter table public.profiles
add column if not exists blackout_ranges jsonb;

update public.profiles
set timezone = 'UTC'
where timezone is null;

update public.profiles
set week_starts_on = 1
where week_starts_on is null;

update public.profiles
set rest_weekdays = '{}'::smallint[]
where rest_weekdays is null;

update public.profiles
set blackout_ranges = '[]'::jsonb
where blackout_ranges is null;

alter table public.profiles
alter column timezone set default 'UTC';

alter table public.profiles
alter column week_starts_on set default 1;

alter table public.profiles
alter column rest_weekdays set default '{}'::smallint[];

alter table public.profiles
alter column blackout_ranges set default '[]'::jsonb;

alter table public.profiles
alter column timezone set not null;

alter table public.profiles
alter column week_starts_on set not null;

alter table public.profiles
alter column rest_weekdays set not null;

alter table public.profiles
alter column blackout_ranges set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_week_starts_on_range'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_week_starts_on_range
    check (week_starts_on between 0 and 6);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_rest_weekdays_range'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_rest_weekdays_range
    check (rest_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_blackout_ranges_array'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_blackout_ranges_array
    check (jsonb_typeof(blackout_ranges) = 'array');
  end if;
end;
$$;

create table if not exists public.planner_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  unit_key text not null,
  scheduled_date date not null,
  scheduled_time text,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planner_items_owner_date_idx
on public.planner_items (owner_id, scheduled_date);

create index if not exists planner_items_goal_idx
on public.planner_items (goal_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_items_goal_unit_unique'
      and conrelid = 'public.planner_items'::regclass
  ) then
    alter table public.planner_items
    add constraint planner_items_goal_unit_unique
    unique (goal_id, unit_key);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_items_goal_date_unique'
      and conrelid = 'public.planner_items'::regclass
  ) then
    alter table public.planner_items
    add constraint planner_items_goal_date_unique
    unique (goal_id, scheduled_date);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_items_unit_key_length'
      and conrelid = 'public.planner_items'::regclass
  ) then
    alter table public.planner_items
    add constraint planner_items_unit_key_length
    check (char_length(unit_key) between 1 and 120);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_items_scheduled_time_format'
      and conrelid = 'public.planner_items'::regclass
  ) then
    alter table public.planner_items
    add constraint planner_items_scheduled_time_format
    check (
      scheduled_time is null
      or scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    );
  end if;
end;
$$;

drop trigger if exists set_planner_items_updated_at on public.planner_items;
create trigger set_planner_items_updated_at
before update on public.planner_items
for each row execute function public.set_updated_at();

alter table public.planner_items enable row level security;

drop policy if exists planner_items_owner_select on public.planner_items;
create policy planner_items_owner_select
on public.planner_items
for select
to authenticated
using (owner_id = (select auth.uid()));

revoke insert, update, delete on table public.planner_items from anon;
revoke insert, update, delete on table public.planner_items from authenticated;
grant select on table public.planner_items to authenticated;

create or replace function public.can_administer_goal(p_goal_id uuid, p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.goals g
    where g.id = p_goal_id
      and g.is_deleted = false
      and g.owner_id = p_uid
  );
$$;

grant execute on function public.can_administer_goal(uuid, uuid) to authenticated;
