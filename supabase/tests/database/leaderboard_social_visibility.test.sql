begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(3);

insert into auth.users (id, email)
values
  ('ac111111-1111-4111-8111-111111111111', 'leaderboard-visible@example.com'),
  ('ac222222-2222-4222-8222-222222222222', 'leaderboard-hidden@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('ac111111-1111-4111-8111-111111111111', 'leaderboard_visible'),
  ('ac222222-2222-4222-8222-222222222222', 'leaderboard_hidden')
on conflict (id) do nothing;

set local role service_role;

update public.profiles profile
set social_activity_visible = false
where profile.id = 'ac222222-2222-4222-8222-222222222222';

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
    'ac500000-0000-4000-8000-000000000001',
    'ac111111-1111-4111-8111-111111111111',
    'Visible leaderboard goal',
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
    'ac500000-0000-4000-8000-000000000002',
    'ac222222-2222-4222-8222-222222222222',
    'Hidden leaderboard goal',
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
  'ac400000-0000-4000-8000-000000000001',
  'social-visibility-leaderboard',
  'Social visibility leaderboard',
  'user',
  'total_xp',
  pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '1 day',
  'open',
  'none',
  'global',
  'ac111111-1111-4111-8111-111111111111'
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
    'ac111111-1111-4111-8111-111111111111',
    'ac500000-0000-4000-8000-000000000001',
    null,
    'health',
    'completion_credit',
    'award',
    'social-visibility-visible',
    30,
    current_date,
    'manual'
  ),
  (
    'ac222222-2222-4222-8222-222222222222',
    'ac500000-0000-4000-8000-000000000002',
    null,
    'health',
    'completion_credit',
    'award',
    'social-visibility-hidden',
    50,
    current_date,
    'manual'
  )
on conflict do nothing;

select public.refresh_leaderboard_standings_service();

select is(
  (
    select count(*)::integer
    from public.leaderboard_standings standing
    where standing.season_id = 'ac400000-0000-4000-8000-000000000001'
  ),
  1,
  'standings refresh excludes users who disabled social activity visibility'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ac111111-1111-4111-8111-111111111111', true);

select is(
  (
    select count(*)::integer
    from public.get_leaderboard_standings('ac400000-0000-4000-8000-000000000001')
  ),
  1,
  'leaderboard standings RPC excludes users who disabled social activity visibility'
);

select is(
  (
    select subject_id
    from public.get_leaderboard_standings('ac400000-0000-4000-8000-000000000001')
    limit 1
  ),
  'ac111111-1111-4111-8111-111111111111'::uuid,
  'visible user remains on leaderboard standings'
);

select * from finish();
rollback;
