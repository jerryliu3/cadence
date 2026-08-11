begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(6);

insert into auth.users (id, email)
values
  ('9d111111-1111-4111-8111-111111111111', 'team-challenge-a@example.com'),
  ('9d222222-2222-4222-8222-222222222222', 'team-challenge-b@example.com')
on conflict (id) do nothing;

insert into public.profiles (
  id,
  username
)
values
  ('9d111111-1111-4111-8111-111111111111', 'team_challenge_a'),
  ('9d222222-2222-4222-8222-222222222222', 'team_challenge_b')
on conflict (id) do nothing;

set local role service_role;

insert into public.teams (
  id,
  user_a_id,
  user_b_id,
  initiator_id,
  status,
  invited_at,
  accepted_at,
  visibility_acknowledged_at
)
values (
  '9d300000-0000-4000-8000-000000000001',
  '9d111111-1111-4111-8111-111111111111',
  '9d222222-2222-4222-8222-222222222222',
  '9d111111-1111-4111-8111-111111111111',
  'active',
  pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '2 days'
)
on conflict (id) do nothing;

insert into public.team_preferences (team_id, user_id)
values
  ('9d300000-0000-4000-8000-000000000001', '9d111111-1111-4111-8111-111111111111'),
  ('9d300000-0000-4000-8000-000000000001', '9d222222-2222-4222-8222-222222222222')
on conflict (team_id, user_id) do nothing;

insert into public.challenges (
  id,
  slug,
  title,
  status,
  enrollment,
  subject_kind,
  metric,
  target_value,
  starts_at,
  ends_at,
  reward_xp
)
values (
  '9d400000-0000-4000-8000-000000000001',
  'team-subject-test',
  'Team subject challenge',
  'active',
  'opt_in',
  'team',
  'total_xp',
  20,
  pg_catalog.now() - interval '2 days',
  pg_catalog.now() + interval '2 days',
  12
)
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
values
  (
    '9d500000-0000-4000-8000-000000000001',
    '9d111111-1111-4111-8111-111111111111',
    'Team XP goal A',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 10,
    current_date + 10,
    false
  ),
  (
    '9d500000-0000-4000-8000-000000000002',
    '9d222222-2222-4222-8222-222222222222',
    'Team XP goal B',
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

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9d111111-1111-4111-8111-111111111111', true);

select ok(
  public.join_challenge_service('9d400000-0000-4000-8000-000000000001'),
  'team member can join team-scoped challenge'
);

reset role;
set local role service_role;

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
    '9d111111-1111-4111-8111-111111111111',
    '9d500000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'team-ca-1',
    15,
    current_date,
    'manual'
  ),
  (
    '9d222222-2222-4222-8222-222222222222',
    '9d500000-0000-4000-8000-000000000002',
    null,
    'health',
    'completion_credit',
    'award',
    'team-ca-2',
    12,
    current_date,
    'manual'
  );

select public.refresh_challenge_progress_service();

select is(
  (
    select progress_value::integer
    from public.challenge_participants participant
    where participant.challenge_id = '9d400000-0000-4000-8000-000000000001'
      and participant.subject_kind = 'team'
      and participant.subject_id = '9d300000-0000-4000-8000-000000000001'
  ),
  27,
  'team challenge progress is computed from both members'
);

select ok(
  (
    select completed_at is not null
    from public.challenge_participants participant
    where participant.challenge_id = '9d400000-0000-4000-8000-000000000001'
      and participant.subject_id = '9d300000-0000-4000-8000-000000000001'
  ),
  'team challenge completion sets completed_at once target reached'
);

select is(
  (
    select count(*)::integer
    from public.xp_ledger ledger
    where ledger.event_type = 'challenge_award'
      and ledger.source_key like 'challenge:%:team:%'
      and ledger.user_id in (
        '9d111111-1111-4111-8111-111111111111',
        '9d222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'team challenge awards each member exactly once'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9d222222-2222-4222-8222-222222222222', true);

select ok(
  (
    select viewer_joined
    from public.get_challenge_detail('9d400000-0000-4000-8000-000000000001')
  ),
  'partner sees team challenge joined state from shared team subject'
);

select ok(
  (
    select exists(
      select 1
      from public.get_social_challenges() challenge
      where challenge.id = '9d400000-0000-4000-8000-000000000001'
        and challenge.viewer_joined = true
    )
  ),
  'team challenge appears joined in challenge list for both members'
);

select * from finish();
rollback;
