-- Move XP level math off the xp_levels lookup table.
-- The application owns the curve; this function stays as a matching
-- formula so ledger/profile refresh/feed can keep writing current_level.

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
    when v_level = 5 then 700
    when v_level = 6 then 1000
    when v_level = 7 then 1400
    when v_level = 8 then 1900
    when v_level = 9 then 2500
    when v_level = 10 then 3200
    when v_level = 11 then 4000
    else 4000 + 100 * ((((v_level - 3) * (v_level - 2)) / 2) - 36)
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
  v_level integer;
begin
  v_level := 1000;
  while v_level > 1 loop
    if private.xp_min_total_for_level(v_level) <= v_xp then
      return v_level;
    end if;
    v_level := v_level - 1;
  end loop;
  return 1;
end;
$$;

revoke all on function private.xp_min_total_for_level(integer) from public, anon, authenticated;
revoke all on function private.xp_level_for_total(integer) from public, anon, authenticated;
grant execute on function private.xp_min_total_for_level(integer) to service_role;
grant execute on function private.xp_level_for_total(integer) to service_role;
