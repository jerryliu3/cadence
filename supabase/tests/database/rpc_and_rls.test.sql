begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(7);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'rpc-rls-alice@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'rpc-rls-bob@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values
  ('11111111-1111-4111-8111-111111111111', 'rpc_rls_alice', 'UTC'),
  ('22222222-2222-4222-8222-222222222222', 'rpc_rls_bob', 'UTC')
on conflict (id) do update
set timezone = excluded.timezone;

set local role service_role;

insert into public.goals (
  id,
  owner_id,
  title,
  description,
  category,
  color,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date,
  is_private
)
values
  (
    '10000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    'RPC RLS root goal',
    null,
    'health',
    '#10b981',
    'recurring',
    'weekly',
    3,
    current_date - 14,
    current_date + 14,
    false
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '11111111-1111-4111-8111-111111111111',
    'RPC RLS linked goal',
    null,
    'health',
    '#10b981',
    'recurring',
    'weekly',
    3,
    current_date - 14,
    current_date + 14,
    false
  ),
  -- Bob and Alice are an active duo in supabase/seed.sql, so a non-private
  -- goal here is visible to Alice by design. This row must actually be private
  -- for the assertion below to test privacy rather than the absence of a path.
  (
    '10000000-0000-4000-8000-000000000009',
    '22222222-2222-4222-8222-222222222222',
    'RPC RLS Bob private goal',
    null,
    'health',
    '#10b981',
    'recurring',
    'weekly',
    3,
    current_date - 14,
    current_date + 14,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000011',
    '11111111-1111-4111-8111-111111111111',
    'RPC RLS target-total goal',
    null,
    'health',
    '#10b981',
    'fixed_milestones',
    'weekly',
    5,
    current_date - 14,
    current_date + 14,
    false
  )
on conflict (id) do update
set
  owner_id = excluded.owner_id,
  frequency_type = excluded.frequency_type,
  recurrence_interval = excluded.recurrence_interval,
  target_count = excluded.target_count,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  is_private = excluded.is_private;

insert into public.goal_links (id, owner_id, source_goal_id, target_goal_id)
values (
  '10000000-0000-4000-8000-000000000404',
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004'
)
on conflict (source_goal_id, target_goal_id) do update
set
  id = excluded.id,
  owner_id = excluded.owner_id,
  source_goal_id = excluded.source_goal_id,
  target_goal_id = excluded.target_goal_id;

reset role;
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

-- Social Duo 1: Alice and Bob are a seeded active team pair, and a team pair is
-- total mutual visibility, so is_private no longer hides Bob's personal goal
-- from Alice. The "private goal stays hidden from a non-partner" case is
-- asserted in team_visibility.test.sql ("outsider cannot read owner goals").
select is(
  (
    select count(*)
    from public.goals
    where id = '10000000-0000-4000-8000-000000000009'
  ),
  1::bigint,
  'team partner Alice can read Bob private goal'
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
