begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(6);

insert into auth.users (id, email)
values
  ('8b111111-1111-4111-8111-111111111111', 'challenge-metric-user-a@example.com'),
  ('8b222222-2222-4222-8222-222222222222', 'challenge-metric-user-b@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('8b111111-1111-4111-8111-111111111111', 'challenge_metric_user_a'),
  ('8b222222-2222-4222-8222-222222222222', 'challenge_metric_user_b')
on conflict (id) do nothing;

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
  end_date
)
values
  (
    '8b300000-0000-4000-8000-000000000001',
    '8b111111-1111-4111-8111-111111111111',
    'Metric A health',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 10,
    current_date + 10
  ),
  (
    '8b300000-0000-4000-8000-000000000002',
    '8b111111-1111-4111-8111-111111111111',
    'Metric A work',
    'Career',
    'career',
    'recurring',
    'weekly',
    3,
    current_date - 10,
    current_date + 10
  ),
  (
    '8b300000-0000-4000-8000-000000000003',
    '8b222222-2222-4222-8222-222222222222',
    'Metric B health',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 10,
    current_date + 10
  ),
  (
    '8b300000-0000-4000-8000-000000000004',
    '8b222222-2222-4222-8222-222222222222',
    'Metric B work',
    'Career',
    'career',
    'recurring',
    'weekly',
    3,
    current_date - 10,
    current_date + 10
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
    '8b111111-1111-4111-8111-111111111111',
    '8b300000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'challenge-metric-a-1',
    10,
    date '2026-08-01',
    'manual'
  ),
  (
    '8b111111-1111-4111-8111-111111111111',
    '8b300000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'challenge-metric-a-2',
    20,
    date '2026-08-02',
    'manual'
  ),
  (
    '8b111111-1111-4111-8111-111111111111',
    '8b300000-0000-4000-8000-000000000002',
    null,
    'career',
    'completion_credit',
    'award',
    'challenge-metric-a-3',
    5,
    date '2026-08-04',
    'manual'
  ),
  (
    '8b111111-1111-4111-8111-111111111111',
    '8b300000-0000-4000-8000-000000000002',
    null,
    'career',
    'goal_achievement',
    'award',
    'challenge-metric-a-4',
    50,
    date '2026-08-04',
    'manual'
  ),
  (
    '8b222222-2222-4222-8222-222222222222',
    '8b300000-0000-4000-8000-000000000003',
    null,
    'health',
    'completion_credit',
    'award',
    'challenge-metric-b-1',
    30,
    date '2026-08-02',
    'manual'
  ),
  (
    '8b222222-2222-4222-8222-222222222222',
    '8b300000-0000-4000-8000-000000000004',
    null,
    'career',
    'completion_credit',
    'award',
    'challenge-metric-b-2',
    40,
    date '2026-08-03',
    'manual'
  );

select is(
  (
    select private.challenge_progress_value(
      'total_xp',
      null,
      array['8b111111-1111-4111-8111-111111111111']::uuid[],
      date '2026-08-01',
      date '2026-08-05'
    )::integer
  ),
  85,
  'total_xp sums completion and achievement ledger rows in window'
);

select is(
  (
    select private.challenge_progress_value(
      'category_xp',
      'health',
      array['8b111111-1111-4111-8111-111111111111']::uuid[],
      date '2026-08-01',
      date '2026-08-05'
    )::integer
  ),
  30,
  'category_xp filters on metric_track_key'
);

select is(
  (
    select private.challenge_progress_value(
      'completions_count',
      null,
      array[
        '8b111111-1111-4111-8111-111111111111',
        '8b222222-2222-4222-8222-222222222222'
      ]::uuid[],
      date '2026-08-01',
      date '2026-08-05'
    )::integer
  ),
  5,
  'completions_count handles multi-user subject arrays'
);

select is(
  (
    select private.challenge_progress_value(
      'distinct_active_days',
      null,
      array[
        '8b111111-1111-4111-8111-111111111111',
        '8b222222-2222-4222-8222-222222222222'
      ]::uuid[],
      date '2026-08-01',
      date '2026-08-05'
    )::integer
  ),
  4,
  'distinct_active_days counts unique earned_on days across members'
);

select is(
  (
    select private.challenge_progress_value(
      'max_streak_days',
      null,
      array['8b111111-1111-4111-8111-111111111111']::uuid[],
      date '2026-08-01',
      date '2026-08-05'
    )::integer
  ),
  2,
  'max_streak_days stops at date gaps'
);

select is(
  (
    select private.challenge_progress_value(
      'max_streak_days',
      null,
      array[
        '8b111111-1111-4111-8111-111111111111',
        '8b222222-2222-4222-8222-222222222222'
      ]::uuid[],
      date '2026-08-01',
      date '2026-08-05'
    )::integer
  ),
  4,
  'max_streak_days supports team-style two-user scoring'
);

select * from finish();
rollback;
