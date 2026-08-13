begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(4);

select is(
  private.xp_manual_completion_points(),
  20,
  'manual completion points read from xp_point_rules'
);

select is(
  private.xp_cascade_multiplier(),
  0.25::numeric,
  'cascade multiplier reads from xp_point_rules'
);

select is(
  private.xp_goal_achievement_points(),
  100,
  'goal achievement points read from xp_point_rules'
);

update public.xp_point_rules
set int_value = 30
where key = 'manual_completion_points';

select is(
  private.xp_manual_completion_points(),
  30,
  'point rule updates are visible without a function migration'
);

select * from finish();
rollback;
