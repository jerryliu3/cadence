begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(3);

insert into auth.users (id, email)
values
  ('ad111111-1111-4111-8111-111111111111', 'frozen-visible-a@example.com'),
  ('ad222222-2222-4222-8222-222222222222', 'frozen-visible-b@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('ad111111-1111-4111-8111-111111111111', 'frozen_visible_a'),
  ('ad222222-2222-4222-8222-222222222222', 'frozen_visible_b')
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
values
  (
    'ad500000-0000-4000-8000-000000000001',
    'ad111111-1111-4111-8111-111111111111',
    'Frozen visibility goal A',
    'Health',
    'health',
    'recurring',
    'weekly',
    2,
    current_date - 7,
    current_date + 7,
    false
  ),
  (
    'ad500000-0000-4000-8000-000000000002',
    'ad222222-2222-4222-8222-222222222222',
    'Frozen visibility goal B',
    'Health',
    'health',
    'recurring',
    'weekly',
    2,
    current_date - 7,
    current_date + 7,
    false
  )
on conflict (id) do nothing;

insert into public.leaderboard_seasons (
  id,
  slug,
  title,
  subject_kind,
  metric,
  starts_at,
  ends_at,
  status,
  rollover,
  scope,
  created_by
)
values (
  'ad400000-0000-4000-8000-000000000001',
  'frozen-results-visibility',
  'Frozen results visibility',
  'user',
  'total_xp',
  pg_catalog.now() - interval '10 days',
  pg_catalog.now() - interval '1 hour',
  'open',
  'none',
  'global',
  'ad111111-1111-4111-8111-111111111111'
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
    'ad111111-1111-4111-8111-111111111111',
    'ad500000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'frozen-results-visible-a',
    40,
    current_date,
    'manual'
  ),
  (
    'ad222222-2222-4222-8222-222222222222',
    'ad500000-0000-4000-8000-000000000002',
    null,
    'health',
    'completion_credit',
    'award',
    'frozen-results-visible-b',
    30,
    current_date,
    'manual'
  )
on conflict do nothing;

select public.refresh_leaderboard_standings_service();
select public.rollover_leaderboard_seasons_service();

update public.profiles profile
set social_activity_visible = false
where profile.id = 'ad222222-2222-4222-8222-222222222222';

select is(
  (
    select status
    from public.leaderboard_seasons season
    where season.id = 'ad400000-0000-4000-8000-000000000001'
  ),
  'closed'::public.leaderboard_season_status,
  'rollover closes the season before frozen standings are read'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ad111111-1111-4111-8111-111111111111', true);

select is(
  (
    select count(*)::integer
    from public.get_leaderboard_standings('ad400000-0000-4000-8000-000000000001')
  ),
  2,
  'closed season standings return all frozen rows after later visibility changes'
);

select ok(
  exists (
    select 1
    from public.get_leaderboard_standings('ad400000-0000-4000-8000-000000000001') row
    where row.subject_id = 'ad222222-2222-4222-8222-222222222222'::uuid
  ),
  'hidden-after-close user still appears in frozen results'
);

select * from finish();
rollback;
