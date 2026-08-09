begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(8);

insert into auth.users (id, email)
values
  ('89111111-1111-4111-8111-111111111111', 'feed-viewer@example.com'),
  ('89222222-2222-4222-8222-222222222222', 'feed-actor-visible@example.com'),
  ('89333333-3333-4333-8333-333333333333', 'feed-actor-hidden@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('89111111-1111-4111-8111-111111111111', 'feed_viewer_user'),
  ('89222222-2222-4222-8222-222222222222', 'feed_actor_user'),
  ('89333333-3333-4333-8333-333333333333', 'feed_hidden_actor_user')
on conflict (id) do nothing;

update public.profiles
set social_activity_visible = false
where id = '89333333-3333-4333-8333-333333333333';

insert into public.goals (
  id,
  owner_id,
  title,
  category,
  category_key,
  feed_visibility,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date,
  is_group,
  is_deleted
)
values
  (
    '89444444-4444-4444-8444-444444444444',
    '89222222-2222-4222-8222-222222222222',
    'Public feed title goal',
    'Health',
    'health',
    'title_public',
    'recurring',
    'weekly',
    3,
    current_date - 10,
    current_date + 20,
    false,
    false
  ),
  (
    '89555555-5555-4555-8555-555555555555',
    '89222222-2222-4222-8222-222222222222',
    'Private feed title goal',
    'Health',
    'health',
    'private',
    'recurring',
    'weekly',
    3,
    current_date - 10,
    current_date + 20,
    false,
    false
  ),
  (
    '89666666-6666-4666-8666-666666666666',
    '89222222-2222-4222-8222-222222222222',
    'Archived feed title goal',
    'Health',
    'health',
    'title_public',
    'recurring',
    'weekly',
    3,
    current_date - 10,
    current_date + 20,
    false,
    false
  ),
  (
    '89777777-7777-4777-8777-777777777777',
    '89222222-2222-4222-8222-222222222222',
    'Deleted feed title goal',
    'Health',
    'health',
    'title_public',
    'recurring',
    'weekly',
    3,
    current_date - 10,
    current_date + 20,
    false,
    true
  )
on conflict (id) do nothing;

update public.goals
set archived_at = pg_catalog.now()
where id = '89666666-6666-4666-8666-666666666666';

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
  payload,
  created_at,
  hidden_at,
  hidden_by,
  hidden_reason
)
values
  (
    '89800000-0000-4000-8000-000000000001',
    '89222222-2222-4222-8222-222222222222',
    'xp_earned',
    'health-public',
    current_date,
    'health',
    '89444444-4444-4444-8444-444444444444',
    10,
    1,
    '{}'::jsonb,
    pg_catalog.now() - interval '4 minutes',
    null,
    null,
    null
  ),
  (
    '89800000-0000-4000-8000-000000000002',
    '89222222-2222-4222-8222-222222222222',
    'xp_earned',
    'health-private',
    current_date,
    'health',
    '89555555-5555-4555-8555-555555555555',
    6,
    1,
    '{}'::jsonb,
    pg_catalog.now() - interval '3 minutes',
    null,
    null,
    null
  ),
  (
    '89800000-0000-4000-8000-000000000003',
    '89222222-2222-4222-8222-222222222222',
    'xp_earned',
    'health-archived',
    current_date,
    'health',
    '89666666-6666-4666-8666-666666666666',
    7,
    1,
    '{}'::jsonb,
    pg_catalog.now() - interval '2 minutes',
    null,
    null,
    null
  ),
  (
    '89800000-0000-4000-8000-000000000004',
    '89222222-2222-4222-8222-222222222222',
    'xp_earned',
    'health-deleted',
    current_date,
    'health',
    '89777777-7777-4777-8777-777777777777',
    8,
    1,
    '{}'::jsonb,
    pg_catalog.now() - interval '1 minute',
    null,
    null,
    null
  ),
  (
    '89800000-0000-4000-8000-000000000005',
    '89222222-2222-4222-8222-222222222222',
    'xp_earned',
    'health-hidden',
    current_date,
    'health',
    null,
    5,
    1,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now(),
    '89222222-2222-4222-8222-222222222222',
    'moderated'
  ),
  (
    '89800000-0000-4000-8000-000000000006',
    '89333333-3333-4333-8333-333333333333',
    'xp_earned',
    'health-hidden-actor',
    current_date,
    'health',
    null,
    9,
    1,
    '{}'::jsonb,
    pg_catalog.now() - interval '30 seconds',
    null,
    null,
    null
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '89111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table _feed_page as
select *
from public.get_social_feed(
  'actor',
  '89222222-2222-4222-8222-222222222222',
  null,
  null,
  10
);

select is((select count(*)::integer from _feed_page), 4, 'feed omits hidden rows and hidden actors');

select is(
  (
    select goal_title
    from _feed_page
    where id = '89800000-0000-4000-8000-000000000001'
  ),
  'Public feed title goal',
  'title is shown for title_public goals'
);

select is(
  (
    select goal_title
    from _feed_page
    where id = '89800000-0000-4000-8000-000000000002'
  ),
  null,
  'title is hidden for private goals'
);

select is(
  (
    select goal_title
    from _feed_page
    where id = '89800000-0000-4000-8000-000000000003'
  ),
  null,
  'title is hidden for archived goals'
);

select is(
  (
    select goal_title
    from _feed_page
    where id = '89800000-0000-4000-8000-000000000004'
  ),
  null,
  'title is hidden for deleted goals'
);

create temporary table _feed_first_page as
select *
from public.get_social_feed(
  'actor',
  '89222222-2222-4222-8222-222222222222',
  null,
  null,
  2
);

create temporary table _feed_second_page as
select *
from public.get_social_feed(
  'actor',
  '89222222-2222-4222-8222-222222222222',
  (select created_at from _feed_first_page order by created_at asc, id asc limit 1),
  (select id from _feed_first_page order by created_at asc, id asc limit 1),
  2
);

select is((select count(*)::integer from _feed_first_page), 2, 'first keyset page returns requested size');
select is((select count(*)::integer from _feed_second_page), 2, 'second keyset page returns requested size');
select is(
  (
    select count(*)::integer
    from _feed_first_page first_page
    join _feed_second_page second_page
      on first_page.id = second_page.id
  ),
  0,
  'keyset pages do not overlap'
);

select * from finish();
rollback;
