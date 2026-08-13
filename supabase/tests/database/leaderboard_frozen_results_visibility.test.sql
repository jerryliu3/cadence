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

update public.profiles profile
set social_activity_visible = true
where profile.id in (
  'ad111111-1111-4111-8111-111111111111',
  'ad222222-2222-4222-8222-222222222222'
);

delete from public.leaderboard_season_results result
where result.season_id = 'ad400000-0000-4000-8000-000000000001'::uuid;

delete from public.leaderboard_standings standing
where standing.season_id = 'ad400000-0000-4000-8000-000000000001'::uuid;

delete from public.leaderboard_seasons season
where season.id = 'ad400000-0000-4000-8000-000000000001'::uuid;

update public.profiles profile
set social_activity_visible = true
where profile.id in (
  'ad111111-1111-4111-8111-111111111111',
  'ad222222-2222-4222-8222-222222222222'
);

delete from public.leaderboard_season_results result
where result.season_id = 'ad400000-0000-4000-8000-000000000001'::uuid;

delete from public.leaderboard_standings standing
where standing.season_id = 'ad400000-0000-4000-8000-000000000001'::uuid;

delete from public.leaderboard_seasons season
where season.id = 'ad400000-0000-4000-8000-000000000001'::uuid;

update public.profiles profile
set social_activity_visible = true
where profile.id in (
  'ad111111-1111-4111-8111-111111111111',
  'ad222222-2222-4222-8222-222222222222'
);

delete from public.leaderboard_season_results result
where result.season_id = 'ad400000-0000-4000-8000-000000000001'::uuid;

delete from public.leaderboard_standings standing
where standing.season_id = 'ad400000-0000-4000-8000-000000000001'::uuid;

delete from public.leaderboard_seasons season
where season.id = 'ad400000-0000-4000-8000-000000000001'::uuid;

update public.profiles profile
set social_activity_visible = true
where profile.id in (
  'ad111111-1111-4111-8111-111111111111',
  'ad222222-2222-4222-8222-222222222222'
);

delete from public.leaderboard_season_results result
where result.season_id = 'ad400000-0000-4000-8000-000000000001'::uuid;

delete from public.leaderboard_standings standing
where standing.season_id = 'ad400000-0000-4000-8000-000000000001'::uuid;

delete from public.leaderboard_seasons season
where season.id = 'ad400000-0000-4000-8000-000000000001'::uuid;

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
  'closed',
  'none',
  'global',
  'ad111111-1111-4111-8111-111111111111'
)
on conflict (id) do nothing;

insert into public.leaderboard_season_results (
  season_id,
  subject_kind,
  subject_id,
  score,
  tie_break_at,
  rank,
  display_name
)
values
  (
    'ad400000-0000-4000-8000-000000000001',
    'user',
    'ad111111-1111-4111-8111-111111111111',
    40,
    pg_catalog.now() - interval '2 hours',
    1,
    'frozen_visible_a'
  ),
  (
    'ad400000-0000-4000-8000-000000000001',
    'user',
    'ad222222-2222-4222-8222-222222222222',
    30,
    pg_catalog.now() - interval '1 hour',
    2,
    'frozen_visible_b'
  )
on conflict (season_id, subject_kind, subject_id) do update
set
  score = excluded.score,
  tie_break_at = excluded.tie_break_at,
  rank = excluded.rank,
  display_name = excluded.display_name;

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
