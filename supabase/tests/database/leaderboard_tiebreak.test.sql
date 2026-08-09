begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(4);

insert into auth.users (id, email)
values
  ('8d111111-1111-4111-8111-111111111111', 'leaderboard-tie-a@example.com'),
  ('8d222222-2222-4222-8222-222222222222', 'leaderboard-tie-b@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('8d111111-1111-4111-8111-111111111111', 'leaderboard_tie_a'),
  ('8d222222-2222-4222-8222-222222222222', 'leaderboard_tie_b')
on conflict (id) do nothing;

update public.profiles
set social_leaderboard_eligible = false
where id not in (
  '8d111111-1111-4111-8111-111111111111',
  '8d222222-2222-4222-8222-222222222222'
);

update public.profiles
set social_leaderboard_eligible = true
where id in (
  '8d111111-1111-4111-8111-111111111111',
  '8d222222-2222-4222-8222-222222222222'
);

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
    '8d300000-0000-4000-8000-000000000001',
    '8d111111-1111-4111-8111-111111111111',
    'Tie goal A',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 15,
    current_date + 15,
    false
  ),
  (
    '8d300000-0000-4000-8000-000000000002',
    '8d222222-2222-4222-8222-222222222222',
    'Tie goal B',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 15,
    current_date + 15,
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
  '8d400000-0000-4000-8000-000000000001',
  'tie-break-test',
  'Tie break test',
  'user',
  'total_xp',
  pg_catalog.now() - interval '5 days',
  pg_catalog.now() + interval '5 days',
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
  completion_source,
  created_at
)
values
  (
    '8d111111-1111-4111-8111-111111111111',
    '8d300000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'leaderboard-tie-a',
    15,
    current_date - 1,
    'manual',
    pg_catalog.now() - interval '2 hours'
  ),
  (
    '8d222222-2222-4222-8222-222222222222',
    '8d300000-0000-4000-8000-000000000002',
    null,
    'health',
    'completion_credit',
    'award',
    'leaderboard-tie-b',
    15,
    current_date - 1,
    'manual',
    pg_catalog.now() - interval '1 hour'
  );

select public.refresh_leaderboard_standings_service();

select is(
  (
    select rank
    from public.leaderboard_standings standing
    where standing.season_id = '8d400000-0000-4000-8000-000000000001'
      and standing.subject_id = '8d111111-1111-4111-8111-111111111111'
  ),
  1,
  'earlier tie_break_at wins ties at equal score'
);

select is(
  (
    select rank
    from public.leaderboard_standings standing
    where standing.season_id = '8d400000-0000-4000-8000-000000000001'
      and standing.subject_id = '8d222222-2222-4222-8222-222222222222'
  ),
  2,
  'later tie_break_at receives lower rank'
);

select public.refresh_leaderboard_standings_service();

select is(
  (
    select count(*)::integer
    from public.leaderboard_standings standing
    where standing.season_id = '8d400000-0000-4000-8000-000000000001'
  ),
  2,
  'refresh keeps stable row cardinality for season standings'
);

select is(
  (
    select max(rank)::integer
    from public.leaderboard_standings standing
    where standing.season_id = '8d400000-0000-4000-8000-000000000001'
  ),
  2,
  'dense rank remains stable across consecutive refreshes'
);

select * from finish();
rollback;
