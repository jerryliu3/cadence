begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(3);

select is(
  (
    select p.provolatile
    from pg_proc p
    where p.oid = 'private.goal_anchored_period_start(date, public.recurrence_interval, integer)'::regprocedure
  ),
  's',
  'goal_anchored_period_start remains STABLE'
);

select is(
  (
    select p.provolatile
    from pg_proc p
    where p.oid = 'private.goal_period_key(date, public.recurrence_interval, date)'::regprocedure
  ),
  's',
  'goal_period_key remains STABLE'
);

select is(
  (
    select p.provolatile
    from pg_proc p
    where p.oid = 'private.goal_xp_credited_units(uuid, uuid)'::regprocedure
  ),
  'v',
  'goal_xp_credited_units remains VOLATILE'
);

select * from finish();
rollback;
