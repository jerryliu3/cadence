begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(5);

insert into auth.users (id, email)
values
  ('9e111111-1111-4111-8111-111111111111', 'team-board-a1@example.com'),
  ('9e222222-2222-4222-8222-222222222222', 'team-board-a2@example.com'),
  ('9e333333-3333-4333-8333-333333333333', 'team-board-b1@example.com'),
  ('9e444444-4444-4444-8444-444444444444', 'team-board-b2@example.com')
on conflict (id) do nothing;

insert into public.profiles (
  id,
  username,
  display_name
)
values
  ('9e111111-1111-4111-8111-111111111111', 'team_board_a1', 'Team A1'),
  ('9e222222-2222-4222-8222-222222222222', 'team_board_a2', 'Team A2'),
  ('9e333333-3333-4333-8333-333333333333', 'team_board_b1', 'Team B1'),
  ('9e444444-4444-4444-8444-444444444444', 'team_board_b2', 'Team B2')
on conflict (id) do nothing;

set local role service_role;

insert into public.teams (
  id,
  user_a_id,
  user_b_id,
  initiator_id,
  status,
  invited_at,
  accepted_at,
  visibility_acknowledged_at
)
values
  (
    '9e500000-0000-4000-8000-000000000001',
    '9e111111-1111-4111-8111-111111111111',
    '9e222222-2222-4222-8222-222222222222',
    '9e111111-1111-4111-8111-111111111111',
    'active',
    pg_catalog.now() - interval '3 days',
    pg_catalog.now() - interval '3 days',
    pg_catalog.now() - interval '3 days'
  ),
  (
    '9e500000-0000-4000-8000-000000000002',
    '9e333333-3333-4333-8333-333333333333',
    '9e444444-4444-4444-8444-444444444444',
    '9e333333-3333-4333-8333-333333333333',
    'active',
    pg_catalog.now() - interval '3 days',
    pg_catalog.now() - interval '3 days',
    pg_catalog.now() - interval '3 days'
  )
on conflict (id) do nothing;

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
    '9e600000-0000-4000-8000-000000000001',
    '9e111111-1111-4111-8111-111111111111',
    'Team leaderboard goal A1',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 20,
    current_date + 20,
    false
  ),
  (
    '9e600000-0000-4000-8000-000000000002',
    '9e333333-3333-4333-8333-333333333333',
    'Team leaderboard goal B1',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 20,
    current_date + 20,
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
  rollover
)
values (
  '9e700000-0000-4000-8000-000000000001',
  'team-season-test',
  'Team season test',
  'team',
  'total_xp',
  pg_catalog.now() - interval '10 days',
  pg_catalog.now() + interval '10 days',
  'open',
  'none'
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
    '9e111111-1111-4111-8111-111111111111',
    '9e600000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'team-lb-a1',
    20,
    current_date,
    'manual'
  ),
  (
    '9e222222-2222-4222-8222-222222222222',
    '9e600000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'team-lb-a2',
    16,
    current_date,
    'manual'
  ),
  (
    '9e333333-3333-4333-8333-333333333333',
    '9e600000-0000-4000-8000-000000000002',
    null,
    'health',
    'completion_credit',
    'award',
    'team-lb-b1',
    8,
    current_date,
    'manual'
  ),
  (
    '9e444444-4444-4444-8444-444444444444',
    '9e600000-0000-4000-8000-000000000002',
    null,
    'health',
    'completion_credit',
    'award',
    'team-lb-b2',
    6,
    current_date,
    'manual'
  );

select public.refresh_leaderboard_standings_service();

select is(
  (
    select count(*)::integer
    from public.leaderboard_standings standing
    where standing.season_id = '9e700000-0000-4000-8000-000000000001'
      and standing.subject_kind = 'team'
  ),
  2,
  'team season standings include each active eligible team'
);

select is(
  (
    select standing.subject_id
    from public.leaderboard_standings standing
    where standing.season_id = '9e700000-0000-4000-8000-000000000001'
      and standing.rank = 1
  ),
  '9e500000-0000-4000-8000-000000000001'::uuid,
  'team with higher combined score ranks first'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9e333333-3333-4333-8333-333333333333', true);

select is(
  (
    select viewer_rank
    from public.get_leaderboard_standings('9e700000-0000-4000-8000-000000000001', 10, 0)
    order by rank asc
    limit 1
  ),
  2,
  'viewer_rank resolves to the viewer''s active team standing'
);

select ok(
  (
    select exists(
      select 1
      from public.get_leaderboard_standings('9e700000-0000-4000-8000-000000000001', 10, 0)
      where display_name like '%+%'
    )
  ),
  'team leaderboard rows expose combined team display names'
);

select ok(
  (
    select exists(
      select 1
      from public.get_leaderboard_standings('9e700000-0000-4000-8000-000000000001', 10, 0)
      where subject_id = '9e500000-0000-4000-8000-000000000002'
    )
  ),
  'viewer standings query includes the viewer''s team row'
);

select * from finish();
rollback;
