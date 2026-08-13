begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(12);

select is(private.xp_min_total_for_level(1), 0, 'level 1 starts at 0 XP');
select is(private.xp_min_total_for_level(2), 100, 'level 2 starts at 100 XP');
select is(private.xp_min_total_for_level(3), 300, 'level 3 follows 50·L·(L-1)');
select is(private.xp_min_total_for_level(11), 5500, 'level 11 starts at 5500 XP');
select is(private.xp_min_total_for_level(12), 6600, 'level 12 starts at 6600 XP');

select is(private.xp_level_for_total(99), 1, '99 XP stays at level 1');
select is(private.xp_level_for_total(100), 2, '100 XP reaches level 2');
select is(private.xp_level_for_total(299), 2, '299 XP stays at level 2');
select is(private.xp_level_for_total(300), 3, '300 XP reaches level 3 exactly');
select is(private.xp_level_for_total(99999999), 1000, 'very high XP caps at level 1000');

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

select * from finish();
rollback;
