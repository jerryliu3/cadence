begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(8);

insert into auth.users (id, email)
values
  ('9b111111-1111-4111-8111-111111111111', 'social-react-viewer@example.com'),
  ('9b222222-2222-4222-8222-222222222222', 'social-react-actor@example.com'),
  ('9b333333-3333-4333-8333-333333333333', 'social-nudge-sender@example.com'),
  ('9b444444-4444-4444-8444-444444444444', 'social-nudge-receiver@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('9b111111-1111-4111-8111-111111111111', 'social_react_viewer'),
  ('9b222222-2222-4222-8222-222222222222', 'social_react_actor'),
  ('9b333333-3333-4333-8333-333333333333', 'social_nudge_sender'),
  ('9b444444-4444-4444-8444-444444444444', 'social_nudge_receiver')
on conflict (id) do nothing;

set local role service_role;

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
  '9b500000-0000-4000-8000-000000000001',
  '9b333333-3333-4333-8333-333333333333',
  'Nudge test goal',
  'Health',
  'health',
  'recurring',
  'weekly',
  3,
  current_date - 5,
  current_date + 5,
  false
)
on conflict (id) do nothing;

insert into public.feed_events (
  id,
  actor_id,
  event_type,
  subject_key,
  bucket_date,
  track_key,
  goal_id,
  xp_delta,
  occurrence_count,
  payload
)
values (
  '9b600000-0000-4000-8000-000000000001',
  '9b222222-2222-4222-8222-222222222222',
  'xp_earned',
  'react-test',
  current_date,
  'health',
  null,
  8,
  1,
  '{}'::jsonb
)
on conflict (id) do nothing;

insert into public.duos (
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
  '9b700000-0000-4000-8000-000000000001',
  '9b333333-3333-4333-8333-333333333333',
  '9b444444-4444-4444-8444-444444444444',
  '9b333333-3333-4333-8333-333333333333',
  'active',
  pg_catalog.now() - interval '1 day',
  pg_catalog.now() - interval '1 day',
  pg_catalog.now() - interval '1 day'
)
on conflict (id) do nothing;

insert into public.duo_preferences (duo_id, user_id, allow_nudges, notify_partner_activity)
values
  ('9b700000-0000-4000-8000-000000000001', '9b333333-3333-4333-8333-333333333333', true, true),
  ('9b700000-0000-4000-8000-000000000001', '9b444444-4444-4444-8444-444444444444', true, true)
on conflict (duo_id, user_id) do update
set allow_nudges = excluded.allow_nudges,
    notify_partner_activity = excluded.notify_partner_activity;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9b111111-1111-4111-8111-111111111111', true);

select ok(
  public.add_feed_reaction_service(
    '9b600000-0000-4000-8000-000000000001',
    'cheer'::public.reaction_kind
  ),
  'viewer can react to visible feed event'
);

select is(
  (
    select reaction_count
    from public.get_social_feed(
      'actor',
      '9b222222-2222-4222-8222-222222222222',
      null,
      null,
      20
    ) feed
    where feed.id = '9b600000-0000-4000-8000-000000000001'
  ),
  1,
  'reaction_count increments via feed_reactions trigger'
);

select ok(
  (
    select viewer_reacted
    from public.get_social_feed(
      'actor',
      '9b222222-2222-4222-8222-222222222222',
      null,
      null,
      20
    ) feed
    where feed.id = '9b600000-0000-4000-8000-000000000001'
  ),
  'viewer_reacted reflects reaction membership'
);

select ok(
  public.remove_feed_reaction_service(
    '9b600000-0000-4000-8000-000000000001',
    'cheer'::public.reaction_kind
  ),
  'viewer can remove own feed reaction'
);

select is(
  (
    select reaction_count
    from public.get_social_feed(
      'actor',
      '9b222222-2222-4222-8222-222222222222',
      null,
      null,
      20
    ) feed
    where feed.id = '9b600000-0000-4000-8000-000000000001'
  ),
  0,
  'reaction_count decrements when reaction is removed'
);

select set_config('request.jwt.claim.sub', '9b333333-3333-4333-8333-333333333333', true);

select ok(
  public.send_nudge_service(
    '9b444444-4444-4444-8444-444444444444',
    'cheer'::public.nudge_kind,
    '9b500000-0000-4000-8000-000000000001',
    null
  ) is not null,
  'active duo member can send nudge'
);

select throws_ok(
  $$select public.send_nudge_service(
      '9b444444-4444-4444-8444-444444444444',
      'cheer'::public.nudge_kind,
      '9b500000-0000-4000-8000-000000000001',
      null
    )$$,
  '42900',
  'nudge_rate_limited_goal_daily',
  'same sender/recipient/goal is limited to once per day'
);

reset role;
set local role service_role;
update public.duo_preferences
set allow_nudges = false
where duo_id = '9b700000-0000-4000-8000-000000000001'
  and user_id = '9b444444-4444-4444-8444-444444444444';

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9b333333-3333-4333-8333-333333333333', true);

select throws_ok(
  $$select public.send_nudge_service(
      '9b444444-4444-4444-8444-444444444444',
      'remind'::public.nudge_kind,
      null,
      null
    )$$,
  '42501',
  'nudges_not_allowed',
  'recipient preferences can block nudges'
);

select * from finish();
rollback;
