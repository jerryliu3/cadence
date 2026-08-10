begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(5);

select ok(
  position(
    $$SET SEARCH_PATH TO ''$$
    in upper(pg_get_functiondef('public.can_view_goal(uuid, uuid)'::regprocedure))
  ) > 0,
  'can_view_goal executes with an empty search_path'
);

select ok(
  position(
    $$SET SEARCH_PATH TO ''$$
    in upper(pg_get_functiondef('public.can_complete_goal(uuid, uuid)'::regprocedure))
  ) > 0,
  'can_complete_goal executes with an empty search_path'
);

select ok(
  position(
    $$SET SEARCH_PATH TO ''$$
    in upper(pg_get_functiondef('public.mark_goal_complete(uuid, date)'::regprocedure))
  ) > 0,
  'mark_goal_complete executes with an empty search_path'
);

select ok(
  position(
    $$SET SEARCH_PATH TO ''$$
    in upper(pg_get_functiondef('public.unmark_goal_complete(uuid, date)'::regprocedure))
  ) > 0,
  'unmark_goal_complete executes with an empty search_path'
);

select ok(
  position(
    $$SET SEARCH_PATH TO ''$$
    in upper(pg_get_functiondef('public.can_administer_goal(uuid, uuid)'::regprocedure))
  ) > 0,
  'can_administer_goal executes with an empty search_path'
);

select * from finish();
rollback;
