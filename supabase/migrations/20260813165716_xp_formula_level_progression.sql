-- Keep editorial xp_levels rows 1-10. One quadratic drives every level.

create or replace function private.xp_min_total_for_level(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select 50 * v_level * (v_level - 1)
  from (
    select greatest(1, least(1000, coalesce(p_level, 1))) as v_level
  ) as clamped;
$$;

create or replace function private.xp_level_for_total(p_total_xp integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_xp integer := greatest(coalesce(p_total_xp, 0), 0);
  v_disc numeric;
  v_level integer;
begin
  v_disc := 1::numeric + (2::numeric * v_xp) / 25;
  v_level := floor((1 + sqrt(greatest(v_disc, 0))) / 2)::integer;
  v_level := greatest(1, least(1000, v_level));

  while v_level > 1 and private.xp_min_total_for_level(v_level) > v_xp loop
    v_level := v_level - 1;
  end loop;

  while v_level < 1000 and private.xp_min_total_for_level(v_level + 1) <= v_xp loop
    v_level := v_level + 1;
  end loop;

  return v_level;
end;
$$;

drop trigger if exists xp_levels_assert_monotonic on public.xp_levels;
drop function if exists private.assert_xp_levels_monotonic();

-- Unique min_total_xp cannot be rewritten in place; shift, then apply the formula.
update public.xp_levels
set min_total_xp = min_total_xp + 100000000;

update public.xp_levels
set min_total_xp = private.xp_min_total_for_level(level);

delete from public.xp_levels
where level > 10;

alter table public.xp_profiles
  drop constraint if exists xp_profiles_current_level_fkey;

alter table public.xp_profiles
  drop constraint if exists xp_profiles_current_level_range;

alter table public.xp_profiles
  add constraint xp_profiles_current_level_range
  check (current_level between 1 and 1000);

revoke all on function private.xp_min_total_for_level(integer) from public, anon, authenticated;
revoke all on function private.xp_level_for_total(integer) from public, anon, authenticated;
grant execute on function private.xp_min_total_for_level(integer) to service_role;
grant execute on function private.xp_level_for_total(integer) to service_role;
