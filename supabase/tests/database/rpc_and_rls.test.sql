begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(7);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.mark_goal_complete(
  '10000000-0000-4000-8000-000000000003',
  current_date
);
select public.mark_goal_complete(
  '10000000-0000-4000-8000-000000000003',
  current_date
);

select is(
  (
    select count(*)
    from public.completions
    where goal_id = '10000000-0000-4000-8000-000000000003'
      and user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = current_date
  ),
  1::bigint,
  'mark_goal_complete is idempotent for a direct completion'
);

select is(
  (
    select count(*)
    from public.completions
    where goal_id = '10000000-0000-4000-8000-000000000004'
      and user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = current_date
  ),
  1::bigint,
  'linked completion cascade creates the expected fact exactly once'
);

select public.unmark_goal_complete(
  '10000000-0000-4000-8000-000000000003',
  current_date
);

select is(
  (
    select count(*)
    from public.completions
    where goal_id = '10000000-0000-4000-8000-000000000003'
      and user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = current_date
  ),
  0::bigint,
  'unmark_goal_complete clears the direct completion'
);

select is(
  (
    select count(*)
    from public.completions
    where goal_id = '10000000-0000-4000-8000-000000000004'
      and user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = current_date
  ),
  0::bigint,
  'unmark_goal_complete clears the linked completion'
);

select is(
  (
    select count(*)
    from public.goals
    where id = '10000000-0000-4000-8000-000000000009'
  ),
  0::bigint,
  'RLS hides Bob private goal from Alice'
);

select public.mark_goal_complete(
  '10000000-0000-4000-8000-000000000011',
  current_date - 2
);
select public.mark_goal_complete(
  '10000000-0000-4000-8000-000000000011',
  current_date - 1
);
select public.unmark_goal_complete(
  '10000000-0000-4000-8000-000000000011',
  current_date - 1
);

select is(
  (
    select count(*)
    from public.completions
    where goal_id = '10000000-0000-4000-8000-000000000011'
      and user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = current_date - 2
  ),
  1::bigint,
  'target-total exact-date unmark preserves a different date'
);

select is(
  (
    select count(*)
    from public.completions
    where goal_id = '10000000-0000-4000-8000-000000000011'
      and user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = current_date - 1
  ),
  0::bigint,
  'target-total exact-date unmark removes only the requested date'
);

reset role;
select * from finish();
rollback;
