begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(4);

-- Team standings require every member to keep social activity visible.
-- The partially hidden team below earns more XP than the visible team, so a
-- missing visibility predicate would rank it first instead of dropping it.

insert into auth.users (id, email)
values
  ('ae111111-1111-4111-8111-111111111111', 'team-visible-a@example.com'),
  ('ae222222-2222-4222-8222-222222222222', 'team-visible-b@example.com'),
  ('ae333333-3333-4333-8333-333333333333', 'team-mixed-a@example.com'),
  ('ae444444-4444-4444-8444-444444444444', 'team-mixed-hidden-b@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('ae111111-1111-4111-8111-111111111111', 'team_visible_a'),
  ('ae222222-2222-4222-8222-222222222222', 'team_visible_b'),
  ('ae333333-3333-4333-8333-333333333333', 'team_mixed_a'),
  ('ae444444-4444-4444-8444-444444444444', 'team_mixed_hidden_b')
on conflict (id) do nothing;

set local role service_role;

update public.profiles profile
set social_activity_visible = false
where profile.id = 'ae444444-4444-4444-8444-444444444444';

insert into public.teams (
  id,
  initiator_id,
  status,
  visibility_acknowledged_at,
  accepted_at
)
values
  (
    'ae600000-0000-4000-8000-000000000001',
    'ae111111-1111-4111-8111-111111111111',
    'active',
    pg_catalog.now(),
    pg_catalog.now()
  ),
  (
    'ae600000-0000-4000-8000-000000000002',
    'ae333333-3333-4333-8333-333333333333',
    'active',
    pg_catalog.now(),
    pg_catalog.now()
  )
on conflict (id) do nothing;

insert into public.team_members (team_id, user_id, role)
values
  ('ae600000-0000-4000-8000-000000000001', 'ae111111-1111-4111-8111-111111111111', 'initiator'),
  ('ae600000-0000-4000-8000-000000000001', 'ae222222-2222-4222-8222-222222222222', 'member'),
  ('ae600000-0000-4000-8000-000000000002', 'ae333333-3333-4333-8333-333333333333', 'initiator'),
  ('ae600000-0000-4000-8000-000000000002', 'ae444444-4444-4444-8444-444444444444', 'member')
on conflict (team_id, user_id) do nothing;

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
  end_date
)
values
  (
    'ae500000-0000-4000-8000-000000000001',
    'ae111111-1111-4111-8111-111111111111',
    'Visible team goal A',
    'Health',
    'health',
    'recurring',
    'weekly',
    2,
    current_date - 7,
    current_date + 7
  ),
  (
    'ae500000-0000-4000-8000-000000000002',
    'ae222222-2222-4222-8222-222222222222',
    'Visible team goal B',
    'Health',
    'health',
    'recurring',
    'weekly',
    2,
    current_date - 7,
    current_date + 7
  ),
  (
    'ae500000-0000-4000-8000-000000000003',
    'ae333333-3333-4333-8333-333333333333',
    'Mixed team goal A',
    'Health',
    'health',
    'recurring',
    'weekly',
    2,
    current_date - 7,
    current_date + 7
  ),
  (
    'ae500000-0000-4000-8000-000000000004',
    'ae444444-4444-4444-8444-444444444444',
    'Mixed team goal B',
    'Health',
    'health',
    'recurring',
    'weekly',
    2,
    current_date - 7,
    current_date + 7
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
  'ae400000-0000-4000-8000-000000000001',
  'team-social-visibility-leaderboard',
  'Team social visibility leaderboard',
  'team',
  'total_xp',
  pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '1 day',
  'open',
  'none',
  'global',
  'ae111111-1111-4111-8111-111111111111'
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
    'ae111111-1111-4111-8111-111111111111',
    'ae500000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'team-visibility-visible-a',
    20,
    current_date,
    'manual'
  ),
  (
    'ae222222-2222-4222-8222-222222222222',
    'ae500000-0000-4000-8000-000000000002',
    null,
    'health',
    'completion_credit',
    'award',
    'team-visibility-visible-b',
    20,
    current_date,
    'manual'
  ),
  (
    'ae333333-3333-4333-8333-333333333333',
    'ae500000-0000-4000-8000-000000000003',
    null,
    'health',
    'completion_credit',
    'award',
    'team-visibility-mixed-a',
    60,
    current_date,
    'manual'
  ),
  (
    'ae444444-4444-4444-8444-444444444444',
    'ae500000-0000-4000-8000-000000000004',
    null,
    'health',
    'completion_credit',
    'award',
    'team-visibility-mixed-hidden-b',
    60,
    current_date,
    'manual'
  )
on conflict do nothing;

select public.refresh_leaderboard_standings_service();

select is(
  (
    select count(*)::integer
    from public.leaderboard_standings standing
    where standing.season_id = 'ae400000-0000-4000-8000-000000000001'
  ),
  1,
  'team standings refresh drops teams whose member disabled social activity visibility'
);

select is(
  (
    select count(*)::integer
    from public.leaderboard_standings standing
    where standing.season_id = 'ae400000-0000-4000-8000-000000000001'
      and standing.subject_id = 'ae600000-0000-4000-8000-000000000002'
  ),
  0,
  'higher scoring team with one hidden member is excluded from standings'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ae111111-1111-4111-8111-111111111111', true);

select is(
  (
    select subject_id
    from public.get_leaderboard_standings('ae400000-0000-4000-8000-000000000001')
    limit 1
  ),
  'ae600000-0000-4000-8000-000000000001'::uuid,
  'team standings RPC returns only the fully visible team'
);

-- Control: re-enabling visibility restores the excluded team, proving the
-- assertions above fail because of the visibility predicate rather than an
-- inactive team or a missing ledger fixture.
reset role;
set local role service_role;

update public.profiles profile
set social_activity_visible = true
where profile.id = 'ae444444-4444-4444-8444-444444444444';

select public.refresh_leaderboard_standings_service();

select is(
  (
    select count(*)::integer
    from public.leaderboard_standings standing
    where standing.season_id = 'ae400000-0000-4000-8000-000000000001'
  ),
  2,
  'both teams rank once every member is visible'
);

select * from finish();
rollback;
