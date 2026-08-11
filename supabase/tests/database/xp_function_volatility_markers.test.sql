begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(5);

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

-- Completion RPCs are the only remaining XP accrual entry point now that the
-- completions trigger is gone. They have been redefined by four separate
-- migrations, and two of those silently dropped the recompute call, which
-- surfaced only as unrelated XP totals reading zero. Assert the call directly
-- so the next redefinition fails here instead.

select ok(
  pg_catalog.pg_get_functiondef(
    'public.mark_goal_complete(uuid, date)'::regprocedure
  ) like '%recompute_goal_xp_service%',
  'mark_goal_complete still drives XP recompute'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.unmark_goal_complete(uuid, date)'::regprocedure
  ) like '%recompute_goal_xp_service%',
  'unmark_goal_complete still drives XP recompute'
);

select * from finish();
rollback;
