begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(6);

-- Vectors mirrored from PROGRESSION_VECTORS in src/lib/xp/progression.ts.
-- Award grant/revoke reads these SQL functions while /api/xp/profile reads the
-- TS module, so the two curves must stay identical. Editing one side without
-- the other fails here or in src/lib/xp/progression.test.ts.
select is(
  (
    select array_agg(
      private.xp_min_total_for_level(level) order by level
    )
    from unnest(array[1, 2, 3, 10, 11, 12, 1000]) as level
  ),
  array[0, 100, 300, 4500, 5500, 6600, 49950000],
  'min_total_xp matches the shared level vectors'
);

select is(
  (
    select array_agg(
      private.xp_level_for_total(total_xp) order by total_xp
    )
    from unnest(
      array[
        0, 99, 100, 299, 300, 1000, 4500, 5500,
        49850100, 49949999, 49950000, 99999999
      ]
    ) as total_xp
  ),
  array[1, 1, 2, 2, 3, 5, 10, 11, 999, 999, 1000, 1000],
  'xp_level_for_total matches the shared total-XP vectors'
);

-- Every threshold resolves exactly, and one XP below it drops a level. This is
-- what the +/-1 walk around the sqrt seed exists to guarantee.
select is(
  (
    select count(*)::integer
    from generate_series(2, 1000) as level
    where private.xp_level_for_total(private.xp_min_total_for_level(level)) <> level
      or private.xp_level_for_total(private.xp_min_total_for_level(level) - 1) <> level - 1
  ),
  0,
  'every level boundary resolves exactly in both directions'
);

select is(
  (
    select count(*)::integer
    from pg_trigger
    where tgname = 'xp_levels_assert_monotonic'
  ),
  0,
  'monotonicity trigger is gone'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where conname = 'xp_profiles_current_level_fkey'
  ),
  0,
  'xp_profiles.current_level no longer FKs into xp_levels'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'xp_levels'
      and column_name = 'min_total_xp'
  ),
  0,
  'xp_levels no longer stores a second copy of the curve'
);

select * from finish();
rollback;
