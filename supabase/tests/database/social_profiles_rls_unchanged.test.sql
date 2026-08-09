begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(1);

insert into auth.users (id, email)
values
  ('8a111111-1111-4111-8111-111111111111', 'feed-rls-viewer@example.com'),
  ('8a222222-2222-4222-8222-222222222222', 'feed-rls-actor@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('8a111111-1111-4111-8111-111111111111', 'feed_rls_viewer'),
  ('8a222222-2222-4222-8222-222222222222', 'feed_rls_actor')
on conflict (id) do nothing;

update public.profiles
set social_activity_visible = true
where id = '8a222222-2222-4222-8222-222222222222';

insert into public.feed_events (
  id,
  actor_id,
  event_type,
  subject_key,
  bucket_date,
  track_key,
  xp_delta,
  occurrence_count,
  payload,
  created_at
)
values (
  '8a300000-0000-4000-8000-000000000001',
  '8a222222-2222-4222-8222-222222222222',
  'xp_earned',
  'health',
  current_date,
  'health',
  5,
  1,
  '{}'::jsonb,
  pg_catalog.now()
)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '8a111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '8a222222-2222-4222-8222-222222222222'
  ),
  0,
  'strangers cannot directly select another profile row'
);

select * from finish();
rollback;
