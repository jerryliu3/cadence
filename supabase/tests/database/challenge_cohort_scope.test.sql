begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(3);

insert into auth.users (id, email)
values
  ('aa111111-1111-4111-8111-111111111111', 'cohort-challenge-a@example.com'),
  ('aa222222-2222-4222-8222-222222222222', 'cohort-challenge-b@example.com')
on conflict (id) do nothing;

insert into public.profiles (
  id,
  username,
  social_challenge_eligible,
  social_leaderboard_eligible
)
values
  ('aa111111-1111-4111-8111-111111111111', 'cohort_challenge_a', true, true),
  ('aa222222-2222-4222-8222-222222222222', 'cohort_challenge_b', true, true)
on conflict (id) do update
set social_challenge_eligible = true,
    social_leaderboard_eligible = true;

set local role service_role;

insert into public.cohorts (id, slug, title, join_code, created_by)
values (
  'aa300000-0000-4000-8000-000000000001',
  'cohort-challenge-test',
  'Challenge Cohort',
  'CHCO01',
  'aa111111-1111-4111-8111-111111111111'
)
on conflict (id) do nothing;

insert into public.cohort_members (cohort_id, user_id)
values (
  'aa300000-0000-4000-8000-000000000001',
  'aa111111-1111-4111-8111-111111111111'
)
on conflict (cohort_id, user_id) do nothing;

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
  reward_xp,
  audience_kind,
  cohort_id
)
values (
  'aa400000-0000-4000-8000-000000000001',
  'cohort-challenge',
  'Cohort challenge',
  'active',
  'opt_in',
  'user',
  'total_xp',
  10,
  pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '7 days',
  5,
  'cohort',
  'aa300000-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'aa222222-2222-4222-8222-222222222222', true);

select is(
  (
    select count(*)::integer
    from public.get_social_challenges() challenge
    where challenge.id = 'aa400000-0000-4000-8000-000000000001'
  ),
  0,
  'non-member cannot see cohort challenge in challenge list'
);

select set_config('request.jwt.claim.sub', 'aa111111-1111-4111-8111-111111111111', true);

select is(
  (
    select count(*)::integer
    from public.get_social_challenges() challenge
    where challenge.id = 'aa400000-0000-4000-8000-000000000001'
  ),
  1,
  'cohort member can see cohort challenge in challenge list'
);

select ok(
  public.join_challenge_service('aa400000-0000-4000-8000-000000000001'),
  'cohort member can join cohort challenge'
);

select * from finish();
rollback;
