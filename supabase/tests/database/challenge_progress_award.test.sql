begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(5);

insert into auth.users (id, email)
values ('8c111111-1111-4111-8111-111111111111', 'challenge-progress-user@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values ('8c111111-1111-4111-8111-111111111111', 'challenge_progress_user')
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
  end_date,
  is_group
)
values (
  '8c300000-0000-4000-8000-000000000001',
  '8c111111-1111-4111-8111-111111111111',
  'Challenge progress goal',
  'Health',
  'health',
  'recurring',
  'weekly',
  3,
  current_date - 10,
  current_date + 10,
  false
)
on conflict (id) do nothing;

insert into public.challenges (
  id,
  slug,
  title,
  status,
  enrollment,
  subject_kind,
  metric,
  metric_track_key,
  target_value,
  starts_at,
  ends_at,
  reward_xp
)
values (
  '8c200000-0000-4000-8000-000000000001',
  'progress-award-test',
  'Progress award test',
  'active',
  'opt_in',
  'user',
  'total_xp',
  null,
  20,
  pg_catalog.now() - interval '3 days',
  pg_catalog.now() + interval '10 days',
  25
)
on conflict (id) do nothing;

insert into public.challenge_participants (
  challenge_id,
  subject_kind,
  subject_id
)
values (
  '8c200000-0000-4000-8000-000000000001',
  'user',
  '8c111111-1111-4111-8111-111111111111'
)
on conflict (challenge_id, subject_kind, subject_id) do nothing;

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
    '8c111111-1111-4111-8111-111111111111',
    '8c300000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'challenge-progress-a1',
    10,
    current_date - 1,
    'manual'
  ),
  (
    '8c111111-1111-4111-8111-111111111111',
    '8c300000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'challenge-progress-a2',
    15,
    current_date,
    'manual'
  );

select public.refresh_challenge_progress_service();

select ok(
  (
    select completed_at is not null
    from public.challenge_participants participant
    where participant.challenge_id = '8c200000-0000-4000-8000-000000000001'
      and participant.subject_id = '8c111111-1111-4111-8111-111111111111'
  ),
  'refresh marks participant completed after crossing target'
);

select is(
  (
    select count(*)::integer
    from public.xp_ledger ledger
    where ledger.user_id = '8c111111-1111-4111-8111-111111111111'
      and ledger.event_type = 'challenge_award'
      and ledger.source_key = 'challenge:8c200000-0000-4000-8000-000000000001:user:8c111111-1111-4111-8111-111111111111'
  ),
  1,
  'challenge completion writes exactly one challenge_award ledger row'
);

select public.refresh_challenge_progress_service();

select is(
  (
    select count(*)::integer
    from public.xp_ledger ledger
    where ledger.user_id = '8c111111-1111-4111-8111-111111111111'
      and ledger.event_type = 'challenge_award'
      and ledger.source_key = 'challenge:8c200000-0000-4000-8000-000000000001:user:8c111111-1111-4111-8111-111111111111'
  ),
  1,
  'challenge refresh remains idempotent after completion'
);

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
values (
  '8c111111-1111-4111-8111-111111111111',
  '8c300000-0000-4000-8000-000000000001',
  null,
  'health',
  'completion_credit',
  'reversal',
  'challenge-progress-reversal',
  -20,
  current_date,
  'manual'
);

select public.refresh_challenge_progress_service();

select ok(
  (
    select progress_value < 20
    from public.challenge_participants participant
    where participant.challenge_id = '8c200000-0000-4000-8000-000000000001'
      and participant.subject_id = '8c111111-1111-4111-8111-111111111111'
  ),
  'reversal drops recomputed progress below target'
);

select ok(
  (
    select completed_at is not null
    from public.challenge_participants participant
    where participant.challenge_id = '8c200000-0000-4000-8000-000000000001'
      and participant.subject_id = '8c111111-1111-4111-8111-111111111111'
  ),
  'completion timestamp remains set after reversal'
);

select * from finish();
rollback;
