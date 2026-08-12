begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(5);

insert into auth.users (id, email)
values
  ('88111111-1111-4111-8111-111111111111', 'feed-visible@example.com'),
  ('88222222-2222-4222-8222-222222222222', 'feed-hidden@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('88111111-1111-4111-8111-111111111111', 'feed_visible_user'),
  ('88222222-2222-4222-8222-222222222222', 'feed_hidden_user')
on conflict (id) do nothing;

update public.profiles
set social_activity_visible = false
where id = '88222222-2222-4222-8222-222222222222';

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
    '88333333-3333-4333-8333-333333333333',
    '88111111-1111-4111-8111-111111111111',
    'Feed emission goal 1',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 5,
    current_date + 20,
    false
  ),
  (
    '88444444-4444-4444-8444-444444444444',
    '88111111-1111-4111-8111-111111111111',
    'Feed emission goal 2',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 5,
    current_date + 20,
    false
  ),
  (
    '88555555-5555-4555-8555-555555555555',
    '88222222-2222-4222-8222-222222222222',
    'Feed hidden actor goal',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 5,
    current_date + 20,
    false
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
    '88111111-1111-4111-8111-111111111111',
    '88333333-3333-4333-8333-333333333333',
    null,
    'health',
    'completion_credit',
    'award',
    'social-feed-emit-a1',
    10,
    current_date,
    'manual'
  ),
  (
    '88111111-1111-4111-8111-111111111111',
    '88444444-4444-4444-8444-444444444444',
    null,
    'health',
    'completion_credit',
    'award',
    'social-feed-emit-a2',
    5,
    current_date,
    'manual'
  ),
  (
    '88111111-1111-4111-8111-111111111111',
    '88333333-3333-4333-8333-333333333333',
    null,
    'health',
    'completion_credit',
    'reversal',
    'social-feed-emit-r1',
    -10,
    current_date,
    'manual'
  ),
  (
    '88111111-1111-4111-8111-111111111111',
    '88333333-3333-4333-8333-333333333333',
    null,
    'health',
    'goal_achievement',
    'award',
    'social-feed-emit-ga1',
    100,
    current_date,
    'manual'
  ),
  (
    '88111111-1111-4111-8111-111111111111',
    '88333333-3333-4333-8333-333333333333',
    null,
    'health',
    'goal_achievement',
    'reversal',
    'social-feed-emit-gr1',
    -100,
    current_date,
    'manual'
  ),
  (
    '88222222-2222-4222-8222-222222222222',
    '88555555-5555-4555-8555-555555555555',
    null,
    'health',
    'completion_credit',
    'award',
    'social-feed-hidden',
    11,
    current_date,
    'manual'
  );

-- Approach A: emission is explicit from XP RPC helpers (not ledger triggers).
select private.emit_feed_for_xp_ledger_row(
  '88111111-1111-4111-8111-111111111111',
  'completion_credit',
  'health',
  '88333333-3333-4333-8333-333333333333',
  10,
  current_date,
  'social-feed-emit-a1'
);
select private.emit_feed_for_xp_ledger_row(
  '88111111-1111-4111-8111-111111111111',
  'completion_credit',
  'health',
  '88444444-4444-4444-8444-444444444444',
  5,
  current_date,
  'social-feed-emit-a2'
);
select private.emit_feed_for_xp_ledger_row(
  '88111111-1111-4111-8111-111111111111',
  'completion_credit',
  'health',
  '88333333-3333-4333-8333-333333333333',
  -10,
  current_date,
  'social-feed-emit-r1'
);
select private.emit_feed_for_xp_ledger_row(
  '88111111-1111-4111-8111-111111111111',
  'goal_achievement',
  'health',
  '88333333-3333-4333-8333-333333333333',
  100,
  current_date,
  'social-feed-emit-ga1'
);
select private.emit_feed_for_xp_ledger_row(
  '88111111-1111-4111-8111-111111111111',
  'goal_achievement',
  'health',
  '88333333-3333-4333-8333-333333333333',
  -100,
  current_date,
  'social-feed-emit-gr1'
);
select private.emit_feed_for_xp_ledger_row(
  '88222222-2222-4222-8222-222222222222',
  'completion_credit',
  'health',
  '88555555-5555-4555-8555-555555555555',
  11,
  current_date,
  'social-feed-hidden'
);

select is(
  (
    select count(*)::integer
    from public.feed_events
    where actor_id = '88111111-1111-4111-8111-111111111111'
      and event_type = 'xp_earned'
  ),
  1,
  'completion credit rows coalesce by actor track and day'
);

select is(
  (
    select xp_delta
    from public.feed_events
    where actor_id = '88111111-1111-4111-8111-111111111111'
      and event_type = 'xp_earned'
      and subject_key = 'health'
  ),
  5,
  'negative ledger rows decrement coalesced xp delta'
);

select is(
  (
    select occurrence_count
    from public.feed_events
    where actor_id = '88111111-1111-4111-8111-111111111111'
      and event_type = 'xp_earned'
      and subject_key = 'health'
  ),
  1,
  'negative ledger rows decrement occurrence count'
);

select ok(
  (
    select goal_id is null
    from public.feed_events
    where actor_id = '88111111-1111-4111-8111-111111111111'
      and event_type = 'xp_earned'
      and subject_key = 'health'
  ),
  'coalesced rows clear goal_id when multiple goals contribute'
);

select is(
  (
    select count(*)::integer
    from public.feed_events
    where actor_id = '88222222-2222-4222-8222-222222222222'
  ),
  0,
  'feed helper does not emit rows for actors opted out of social activity'
);

select * from finish();
rollback;
