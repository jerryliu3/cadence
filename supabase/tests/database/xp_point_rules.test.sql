begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(6);

select is(
  private.xp_rule('manual_completion_points')::integer,
  20,
  'manual completion points read from xp_point_rules'
);

select is(
  private.xp_rule('cascade_multiplier'),
  0.25::numeric,
  'cascade multiplier reads from xp_point_rules'
);

select is(
  private.xp_rule('goal_achievement_points')::integer,
  100,
  'goal achievement points read from xp_point_rules'
);

select is(
  private.xp_points_for_completion_source('linked_cascade'::public.completion_source),
  5,
  'cascade source floors 20 * 0.25 to 5'
);

update public.xp_point_rules
set value = 30
where key = 'manual_completion_points';

select is(
  private.xp_rule('manual_completion_points')::integer,
  30,
  'point rule updates are visible without a function migration'
);

select is(
  private.xp_points_for_completion_source('linked_cascade'::public.completion_source),
  7,
  'cascade source floors 30 * 0.25 to 7 after a rule update'
);

select * from finish();
rollback;
