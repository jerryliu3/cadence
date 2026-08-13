-- Keep editorial xp_levels rows 1-10. Compute the rest of the curve.
-- Safety: prove the formula against the still-populated table, then delete 11-1000.

create or replace function private.xp_min_total_for_level(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when v_level <= 1 then 0
    when v_level = 2 then 100
    when v_level = 3 then 250
    when v_level = 4 then 450
    else 400 + 50 * (v_level - 2) * (v_level - 3)
  end
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
  if v_xp < 700 then
    if v_xp >= 450 then
      return 4;
    elsif v_xp >= 250 then
      return 3;
    elsif v_xp >= 100 then
      return 2;
    else
      return 1;
    end if;
  end if;

  v_disc := 1::numeric + ((2::numeric * v_xp) - 800) / 25;
  v_level := floor((5 + sqrt(greatest(v_disc, 0))) / 2)::integer;
  v_level := greatest(5, least(1000, v_level));

  while v_level > 5 and private.xp_min_total_for_level(v_level) > v_xp loop
    v_level := v_level - 1;
  end loop;

  while v_level < 1000 and private.xp_min_total_for_level(v_level + 1) <= v_xp loop
    v_level := v_level + 1;
  end loop;

  return v_level;
end;
$$;

do $$
declare
  v_mismatch integer;
begin
  select count(*)::integer
  into v_mismatch
  from public.xp_levels lvl
  where lvl.min_total_xp is distinct from private.xp_min_total_for_level(lvl.level);

  if v_mismatch <> 0 then
    raise exception using
      errcode = '23514',
      message = 'xp_min_total_for_level mismatched existing xp_levels rows';
  end if;
end;
$$;

drop trigger if exists xp_levels_assert_monotonic on public.xp_levels;
drop function if exists private.assert_xp_levels_monotonic();

alter table public.xp_profiles
  drop constraint if exists xp_profiles_current_level_fkey;

alter table public.xp_profiles
  drop constraint if exists xp_profiles_current_level_range;

alter table public.xp_profiles
  add constraint xp_profiles_current_level_range
  check (current_level between 1 and 1000);

delete from public.xp_levels
where level > 10;

revoke all on function private.xp_min_total_for_level(integer) from public, anon, authenticated;
revoke all on function private.xp_level_for_total(integer) from public, anon, authenticated;
grant execute on function private.xp_min_total_for_level(integer) to service_role;
grant execute on function private.xp_level_for_total(integer) to service_role;
