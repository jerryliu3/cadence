begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(4);

insert into auth.users (id, email)
values
  ('ab111111-1111-4111-8111-111111111111', 'cohort-leaderboard-a@example.com'),
  ('ab222222-2222-4222-8222-222222222222', 'cohort-leaderboard-b@example.com')
on conflict (id) do nothing;

insert into public.profiles (
  id,
  username
)
values
  ('ab111111-1111-4111-8111-111111111111', 'cohort_leaderboard_a'),
  ('ab222222-2222-4222-8222-222222222222', 'cohort_leaderboard_b')
on conflict (id) do nothing;

set local role service_role;

insert into public.cohorts (id, slug, title, join_code, created_by)
values (
  'ab300000-0000-4000-8000-000000000001',
  'cohort-leaderboard-test',
  'Leaderboard Cohort',
  'LBSC01',
  'ab111111-1111-4111-8111-111111111111'
)
on conflict (id) do nothing;

insert into public.cohort_members (cohort_id, user_id)
values (
  'ab300000-0000-4000-8000-000000000001',
  'ab111111-1111-4111-8111-111111111111'
)
on conflict (cohort_id, user_id) do nothing;

insert into public.goals (
  id,
  owner_id,
  title,
  category,
  category_key,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date,
  is_group
)
values
  (
    'ab500000-0000-4000-8000-000000000001',
    'ab111111-1111-4111-8111-111111111111',
    'Cohort leaderboard goal A',
    'Health',
    'health',
    'recurring',
    'weekly',
    2,
    current_date - 7,
    current_date + 7,
    false
  ),
  (
    'ab500000-0000-4000-8000-000000000002',
    'ab222222-2222-4222-8222-222222222222',
    'Cohort leaderboard goal B',
    'Health',
    'health',
    'recurring',
    'weekly',
    2,
    current_date - 7,
    current_date + 7,
    false
  )
on conflict (id) do nothing;

insert into public.leaderboard_seasons (
  id,
  slug,
  title,
  subject_kind,
  metric,
  starts_at,
  ends_at,
  status,
  scope,
  cohort_id,
  created_by
)
values (
  'ab400000-0000-4000-8000-000000000001',
  'cohort-leaderboard',
  'Cohort leaderboard',
  'user',
  'total_xp',
  pg_catalog.now() - interval '2 days',
  pg_catalog.now() + interval '2 days',
  'open',
  'cohort',
  'ab300000-0000-4000-8000-000000000001',
  'ab111111-1111-4111-8111-111111111111'
)
on conflict (id) do nothing;

insert into public.xp_ledger (
  user_id,
  goal_id,
  completion_id,
  track_key,
  event_type,
  entry_kind,
  source_key,
  xp_delta,
  earned_on,
  completion_source
)
values
  (
    'ab111111-1111-4111-8111-111111111111',
    'ab500000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'cohort-lb-a',
    40,
    current_date,
    'manual'
  ),
  (
    'ab222222-2222-4222-8222-222222222222',
    'ab500000-0000-4000-8000-000000000002',
    null,
    'health',
    'completion_credit',
    'award',
    'cohort-lb-b',
    90,
    current_date,
    'manual'
  )
on conflict do nothing;

select public.refresh_leaderboard_standings_service();

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ab222222-2222-4222-8222-222222222222', true);

select is(
  (
    select count(*)::integer
    from public.get_social_leaderboards() season
    where season.id = 'ab400000-0000-4000-8000-000000000001'
  ),
  0,
  'non-member cannot see cohort leaderboard season'
);

select set_config('request.jwt.claim.sub', 'ab111111-1111-4111-8111-111111111111', true);

select is(
  (
    select count(*)::integer
    from public.get_social_leaderboards() season
    where season.id = 'ab400000-0000-4000-8000-000000000001'
  ),
  1,
  'cohort member can see cohort leaderboard season'
);

select is(
  (
    select count(*)::integer
    from public.get_leaderboard_standings('ab400000-0000-4000-8000-000000000001')
  ),
  1,
  'cohort leaderboard standings include only cohort members'
);

select is(
  (
    select subject_id
    from public.get_leaderboard_standings('ab400000-0000-4000-8000-000000000001')
    limit 1
  ),
  'ab111111-1111-4111-8111-111111111111'::uuid,
  'member appears as the cohort leaderboard subject'
);

select * from finish();
rollback;
