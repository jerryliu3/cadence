begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(8);

select ok(
  not exists (
    select 1
    from public.goals
    where feed_visibility <> 'private'::public.goal_feed_visibility
  ),
  'existing goals are backfilled to private feed visibility'
);

select ok(
  not exists (
    select 1
    from public.goals
    where partner_visibility <> 'shared'::public.goal_partner_visibility
  ),
  'existing goals are backfilled to shared partner visibility'
);

select ok(
  not exists (
    select 1
    from public.profiles
    where social_discoverable <> true
       or social_activity_visible <> true
       or social_leaderboard_eligible <> true
       or social_challenge_eligible <> true
       or social_visibility_updated_at is null
  ),
  'existing profiles are backfilled to social defaults'
);

insert into auth.users (id, email)
values
  ('66111111-1111-4111-8111-111111111111', 'social-hidden@example.com'),
  ('66222222-2222-4222-8222-222222222222', 'social-searcher@example.com'),
  ('66333333-3333-4333-8333-333333333333', 'social-public@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('66111111-1111-4111-8111-111111111111', 's1_hidden_user'),
  ('66222222-2222-4222-8222-222222222222', 's1_searcher_user'),
  ('66333333-3333-4333-8333-333333333333', 's1_public_user')
on conflict (id) do nothing;

update public.profiles
set social_discoverable = false
where id = '66111111-1111-4111-8111-111111111111';

select ok(
  (
    select social_discoverable
      and social_activity_visible
      and social_leaderboard_eligible
      and social_challenge_eligible
      and social_visibility_updated_at is not null
    from public.profiles
    where id = '66222222-2222-4222-8222-222222222222'
  ),
  'newly inserted profiles default social participation flags to true'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '66222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::integer
    from public.find_profile_by_username('s1_hidden', 8)
  ),
  0,
  'find_profile_by_username omits undiscoverable profiles'
);

select is(
  (
    select social_discoverable::text
    from public.profiles
    where id = '66222222-2222-4222-8222-222222222222'
  ),
  'true',
  'self profile keeps discoverability true by default'
);

reset role;
insert into public.goals (
  id,
  owner_id,
  title,
  category,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date,
  is_group
)
values (
  '66444444-4444-4444-8444-444444444444',
  '66222222-2222-4222-8222-222222222222',
  'Social visibility defaults goal',
  'Personal',
  'recurring',
  'weekly',
  3,
  current_date - 1,
  current_date + 30,
  false
)
on conflict (id) do nothing;

select is(
  (
    select feed_visibility::text
    from public.goals
    where id = '66444444-4444-4444-8444-444444444444'
  ),
  'private',
  'new goals default to private feed visibility'
);

select is(
  (
    select partner_visibility::text
    from public.goals
    where id = '66444444-4444-4444-8444-444444444444'
  ),
  'shared',
  'new goals default to shared partner visibility'
);

reset role;
select * from finish();
rollback;
