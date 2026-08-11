begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(6);

insert into auth.users (id, email)
values ('8e111111-1111-4111-8111-111111111111', 'leaderboard-rollover-user@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values ('8e111111-1111-4111-8111-111111111111', 'leaderboard_rollover_user')
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
values (
  '8e300000-0000-4000-8000-000000000001',
  '8e111111-1111-4111-8111-111111111111',
  'Rollover goal',
  'Health',
  'health',
  'recurring',
  'weekly',
  3,
  current_date - 40,
  current_date + 40,
  false
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
values (
  '8e111111-1111-4111-8111-111111111111',
  '8e300000-0000-4000-8000-000000000001',
  null,
  'health',
  'completion_credit',
  'award',
  'leaderboard-rollover-a',
  20,
  current_date - 2,
  'manual'
)
on conflict (user_id, event_type, source_key) where goal_id is null do nothing;

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
values
  (
    '8e400000-0000-4000-8000-000000000001',
    'rollover-closed-candidate',
    'Rollover candidate',
    'user',
    'total_xp',
    pg_catalog.now() - interval '10 days',
    pg_catalog.now() - interval '1 hour',
    'open',
    'monthly'
  ),
  (
    '8e400000-0000-4000-8000-000000000002',
    'rollover-indefinite',
    'Indefinite board',
    'user',
    'completions_count',
    pg_catalog.now() - interval '10 days',
    null,
    'open',
    'none'
  )
on conflict (id) do nothing;

select public.refresh_leaderboard_standings_service();
select public.rollover_leaderboard_seasons_service();

select is(
  (
    select status
    from public.leaderboard_seasons season
    where season.id = '8e400000-0000-4000-8000-000000000001'
  ),
  'closed'::public.leaderboard_season_status,
  'season ending in the past transitions to closed'
);

select ok(
  exists (
    select 1
    from public.leaderboard_season_results result
    where result.season_id = '8e400000-0000-4000-8000-000000000001'
      and result.subject_id = '8e111111-1111-4111-8111-111111111111'
  ),
  'rollover snapshots frozen season results for scored participant'
);

select ok(
  exists (
    select 1
    from public.leaderboard_seasons season
    where season.previous_season_id = '8e400000-0000-4000-8000-000000000001'
  ),
  'monthly rollover creates next season pointing at previous'
);

select is(
  (
    select status
    from public.leaderboard_seasons season
    where season.id = '8e400000-0000-4000-8000-000000000002'
  ),
  'open'::public.leaderboard_season_status,
  'indefinite season stays open after rollover pass'
);

select throws_ok(
  $$
    insert into public.leaderboard_seasons (
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
      'rollover-duplicate-open',
      'Duplicate Open',
      'user',
      'total_xp',
      pg_catalog.now() - interval '1 day',
      pg_catalog.now() + interval '1 day',
      'open',
      'none'
    );
  $$,
  '23505',
  null,
  'partial unique index blocks second open season with same board identity'
);

select ok(
  exists (
    select 1
    from public.feed_events event
    where event.event_type = 'season_result'
      and event.subject_key = '8e400000-0000-4000-8000-000000000001'
  ),
  'rollover emits season_result feed event for top standings'
);

select * from finish();
rollback;
