-- Move XP point economics from hardcoded SQL constants onto a config table.

create table if not exists public.xp_point_rules (
  key text primary key,
  int_value integer,
  numeric_value numeric,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint xp_point_rules_value_present check (
    int_value is not null or numeric_value is not null
  )
);

insert into public.xp_point_rules (key, int_value, numeric_value)
values
  ('manual_completion_points', 20, null),
  ('cascade_multiplier', null, 0.25),
  ('goal_achievement_points', 100, null)
on conflict (key) do nothing;

alter table public.xp_point_rules enable row level security;
revoke all on table public.xp_point_rules from public, anon, authenticated;
grant select, insert, update, delete on table public.xp_point_rules to service_role;

create or replace function private.xp_manual_completion_points()
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select rule.int_value
      from public.xp_point_rules rule
      where rule.key = 'manual_completion_points'
    ),
    20
  );
$$;

create or replace function private.xp_cascade_multiplier()
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select rule.numeric_value
      from public.xp_point_rules rule
      where rule.key = 'cascade_multiplier'
    ),
    0.25::numeric
  );
$$;

create or replace function private.xp_goal_achievement_points()
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select rule.int_value
      from public.xp_point_rules rule
      where rule.key = 'goal_achievement_points'
    ),
    100
  );
$$;

create or replace function private.xp_points_for_completion_source(
  p_source public.completion_source
)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when p_source = 'linked_cascade'::public.completion_source
      then greatest(
        1,
        pg_catalog.floor(
          private.xp_manual_completion_points() * private.xp_cascade_multiplier()
        )::integer
      )
    else private.xp_manual_completion_points()
  end;
$$;

revoke all on function private.xp_manual_completion_points() from public, anon, authenticated;
revoke all on function private.xp_cascade_multiplier() from public, anon, authenticated;
revoke all on function private.xp_goal_achievement_points() from public, anon, authenticated;
revoke all on function private.xp_points_for_completion_source(public.completion_source)
  from public, anon, authenticated;
