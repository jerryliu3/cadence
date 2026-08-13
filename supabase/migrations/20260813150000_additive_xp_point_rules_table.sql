-- Move XP point economics from hardcoded SQL constants onto a config table.

create table if not exists public.xp_point_rules (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint xp_point_rules_known_key check (
    key in (
      'manual_completion_points',
      'cascade_multiplier',
      'goal_achievement_points'
    )
  )
);

insert into public.xp_point_rules (key, value)
values
  ('manual_completion_points', 20),
  ('cascade_multiplier', 0.25),
  ('goal_achievement_points', 100)
on conflict (key) do nothing;

drop trigger if exists set_xp_point_rules_updated_at on public.xp_point_rules;
create trigger set_xp_point_rules_updated_at
before update on public.xp_point_rules
for each row execute function public.set_updated_at();

alter table public.xp_point_rules enable row level security;
revoke all on table public.xp_point_rules from public, anon, authenticated;
grant select, insert, update, delete on table public.xp_point_rules to service_role;

create or replace function private.xp_rule(p_key text)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_value numeric;
begin
  select rule.value
  into v_value
  from public.xp_point_rules rule
  where rule.key = p_key;
  if v_value is null then
    raise exception using
      errcode = 'P0001',
      message = 'xp_point_rule_missing:' || p_key;
  end if;
  return v_value;
end;
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
          private.xp_rule('manual_completion_points')
          * private.xp_rule('cascade_multiplier')
        )::integer
      )
    else private.xp_rule('manual_completion_points')::integer
  end;
$$;

-- One-line wrappers so already-shipped credit SQL can keep its call sites.
create or replace function private.xp_manual_completion_points()
returns integer
language sql
stable
set search_path = ''
as $$
  select private.xp_rule('manual_completion_points')::integer;
$$;

create or replace function private.xp_cascade_multiplier()
returns numeric
language sql
stable
set search_path = ''
as $$
  select private.xp_rule('cascade_multiplier');
$$;

create or replace function private.xp_goal_achievement_points()
returns integer
language sql
stable
set search_path = ''
as $$
  select private.xp_rule('goal_achievement_points')::integer;
$$;

revoke all on function private.xp_rule(text) from public, anon, authenticated;
revoke all on function private.xp_manual_completion_points() from public, anon, authenticated;
revoke all on function private.xp_cascade_multiplier() from public, anon, authenticated;
revoke all on function private.xp_goal_achievement_points() from public, anon, authenticated;
revoke all on function private.xp_points_for_completion_source(public.completion_source)
  from public, anon, authenticated;
