begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(14);

select is(private.xp_min_total_for_level(2), 100, 'level 2 starts at 100 XP');
select is(private.xp_min_total_for_level(4), 450, 'level 4 is the last bespoke threshold');
select is(private.xp_min_total_for_level(5), 700, 'level 5 starts the closed form');
select is(private.xp_min_total_for_level(11), 4000, 'level 11 starts at 4000 XP');
select is(private.xp_min_total_for_level(12), 4900, 'level 12 starts at 4900 XP');

select is(private.xp_level_for_total(99), 1, '99 XP stays at level 1');
select is(private.xp_level_for_total(100), 2, '100 XP reaches level 2');
select is(private.xp_level_for_total(699), 4, '699 XP stays at level 4');
select is(private.xp_level_for_total(700), 5, '700 XP reaches level 5 exactly');
select is(private.xp_level_for_total(3200), 10, '3200 XP reaches level 10 exactly');
select is(private.xp_level_for_total(4000), 11, '4000 XP reaches level 11 exactly');
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
