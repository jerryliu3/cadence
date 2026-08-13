-- One quadratic drives every level: min_total_xp(L) = 50 * L * (L - 1).
-- xp_levels keeps only editorial content (level + title) for levels 1-10.
--
-- This changes the shipped curve. Level 3+ thresholds all move upward
-- (level 10 goes from 3200 to 4500), so stored current_level values are
-- backfilled below.
--
-- Keep private.xp_min_total_for_level / private.xp_level_for_total in lockstep
-- with src/lib/xp/progression.ts. Award grant/revoke in
-- private.refresh_xp_profile reads the SQL side; /api/xp/profile reads the TS
-- side. supabase/tests/database/xp_formula_progression.test.sql and
-- src/lib/xp/progression.test.ts assert the same vectors so a one-sided edit
-- fails.

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

-- Monotonicity is now a property of the formula, not an invariant to police.
drop trigger if exists xp_levels_assert_monotonic on public.xp_levels;
drop function if exists private.assert_xp_levels_monotonic();

-- Drop the FK before deleting level rows: a profile sitting above level 10
-- would otherwise block the delete.
alter table public.xp_profiles
  drop constraint if exists xp_profiles_current_level_fkey;

alter table public.xp_profiles
  drop constraint if exists xp_profiles_current_level_range;

alter table public.xp_profiles
  add constraint xp_profiles_current_level_range
  check (current_level between 1 and 1000);

delete from public.xp_levels
where level > 10;

-- min_total_xp would be a third copy of the curve. Nothing reads it now that
-- xp_level_for_total is formula-driven and /api/xp/profile derives thresholds.
alter table public.xp_levels
  drop column if exists min_total_xp;

-- The curve changed, so stored levels are stale until each row's next XP event.
update public.xp_profiles
set
  current_level = private.xp_level_for_total(total_xp),
  updated_at = pg_catalog.now()
where current_level <> private.xp_level_for_total(total_xp);

revoke all on function private.xp_min_total_for_level(integer) from public, anon, authenticated;
revoke all on function private.xp_level_for_total(integer) from public, anon, authenticated;
grant execute on function private.xp_min_total_for_level(integer) to service_role;
grant execute on function private.xp_level_for_total(integer) to service_role;
