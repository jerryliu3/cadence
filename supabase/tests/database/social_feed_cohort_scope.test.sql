begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(3);

insert into auth.users (id, email)
values
  ('ac111111-1111-4111-8111-111111111111', 'cohort-feed-a@example.com'),
  ('ac222222-2222-4222-8222-222222222222', 'cohort-feed-b@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, social_activity_visible)
values
  ('ac111111-1111-4111-8111-111111111111', 'cohort_feed_a', true),
  ('ac222222-2222-4222-8222-222222222222', 'cohort_feed_b', true)
on conflict (id) do update
set social_activity_visible = true;

set local role service_role;

insert into public.cohorts (id, slug, title, join_code, created_by)
values (
  'ac300000-0000-4000-8000-000000000001',
  'cohort-feed-test',
  'Feed Cohort',
  'FDSC01',
  'ac111111-1111-4111-8111-111111111111'
)
on conflict (id) do nothing;

insert into public.cohort_members (cohort_id, user_id)
values (
  'ac300000-0000-4000-8000-000000000001',
  'ac111111-1111-4111-8111-111111111111'
)
on conflict (cohort_id, user_id) do nothing;

insert into public.feed_events (
  id,
  event_type,
  actor_id,
  subject_key,
  bucket_date,
  track_key,
  xp_delta,
  occurrence_count,
  created_at
)
values
  (
    'ac400000-0000-4000-8000-000000000001',
    'xp_earned',
    'ac111111-1111-4111-8111-111111111111',
    'cohort-feed-member',
    current_date,
    'health',
    10,
    1,
    pg_catalog.now() - interval '2 minutes'
  ),
  (
    'ac400000-0000-4000-8000-000000000002',
    'xp_earned',
    'ac222222-2222-4222-8222-222222222222',
    'cohort-feed-outsider',
    current_date,
    'health',
    12,
    1,
    pg_catalog.now() - interval '1 minute'
  )
on conflict (id) do nothing;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ac111111-1111-4111-8111-111111111111', true);

select is(
  (
    select count(*)::integer
    from public.get_social_feed(
      'cohort',
      'ac300000-0000-4000-8000-000000000001',
      null,
      null,
      50
    ) feed
  ),
  1,
  'cohort scope includes only actors in the cohort'
);

select is(
  (
    select actor_id
    from public.get_social_feed(
      'cohort',
      'ac300000-0000-4000-8000-000000000001',
      null,
      null,
      50
    ) feed
    limit 1
  ),
  'ac111111-1111-4111-8111-111111111111'::uuid,
  'cohort scope returns the cohort member actor'
);

select is(
  (
    select count(*)::integer
    from public.get_social_feed(
      'group',
      'ac300000-0000-4000-8000-000000000001',
      null,
      null,
      50
    ) feed
  ),
  1,
  'group scope alias includes only actors in the group'
);

select * from finish();
rollback;
