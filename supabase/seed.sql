-- Cadence local seed data
-- Demo credentials:
-- alice@example.com / password123
-- bob@example.com / password123
-- carla@example.com / password123

truncate table
  public.feed_reactions,
  public.nudges,
  public.notification_outbox,
  public.challenge_participants,
  public.challenges,
  public.team_preferences,
  public.teams,
  public.leaderboard_standings,
  public.leaderboard_season_results,
  public.leaderboard_seasons,
  public.cohort_members,
  public.cohorts,
  public.feed_events,
  public.planner_items,
  public.goal_shares,
  public.goal_links,
  public.completions,
  public.goals
restart identity cascade;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  reauthentication_token,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'alice@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"username":"alice","display_name":"Alice"}',
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bob@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"username":"bob","display_name":"Bob"}',
    now(),
    now()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'carla@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"username":"carla","display_name":"Carla"}',
    now(),
    now()
  )
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  confirmation_token = excluded.confirmation_token,
  recovery_token = excluded.recovery_token,
  email_change_token_new = excluded.email_change_token_new,
  email_change_token_current = excluded.email_change_token_current,
  reauthentication_token = excluded.reauthentication_token,
  email_change = excluded.email_change,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = excluded.updated_at;

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    '{"sub":"11111111-1111-4111-8111-111111111111","email":"alice@example.com"}',
    'email',
    'alice@example.com',
    now(),
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    '{"sub":"22222222-2222-4222-8222-222222222222","email":"bob@example.com"}',
    'email',
    'bob@example.com',
    now(),
    now(),
    now()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    '{"sub":"33333333-3333-4333-8333-333333333333","email":"carla@example.com"}',
    'email',
    'carla@example.com',
    now(),
    now(),
    now()
  )
on conflict (id) do update
set
  identity_data = excluded.identity_data,
  provider_id = excluded.provider_id,
  last_sign_in_at = excluded.last_sign_in_at,
  updated_at = excluded.updated_at;

-- `timezone_confirmed_at` gates the planner preferences snapshot: while it is
-- null, `resolvePlannerPreferencesSnapshot` returns null, so planner publish
-- routes reject with `timezone_confirmation_required` and the context route
-- falls back to synthesizing a policy from `new Date()` on every request --
-- which makes `generationInputHash` unstable between two identical reads.
-- Seed a fixed confirmation timestamp so seeded accounts are publish-ready and
-- previews are deterministic across resets.
insert into public.profiles (
  id,
  username,
  display_name,
  avatar_url,
  timezone,
  timezone_confirmed_at
)
values
  ('11111111-1111-4111-8111-111111111111', 'alice', 'Alice Park', null, 'UTC', '2026-01-01T00:00:00Z'),
  ('22222222-2222-4222-8222-222222222222', 'bob', 'Bob Chen', null, 'UTC', '2026-01-01T00:00:00Z'),
  ('33333333-3333-4333-8333-333333333333', 'carla', 'Carla Diaz', null, 'UTC', '2026-01-01T00:00:00Z')
on conflict (id) do update
set
  username = excluded.username,
  display_name = excluded.display_name,
  avatar_url = excluded.avatar_url,
  timezone = excluded.timezone,
  timezone_confirmed_at = excluded.timezone_confirmed_at;

insert into public.goals (
  id,
  owner_id,
  title,
  description,
  category,
  color,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date,
  archived_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Submit conference proposal',
    'One-time personal goal with a due date.',
    'career',
    '#6366f1',
    'fixed_milestones',
    null,
    1,
    current_date - 20,
    current_date + 10,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'Run 20 times by end of quarter',
    'Fixed target used in Insights.',
    'fitness',
    '#10b981',
    'fixed_milestones',
    null,
    20,
    current_date - 56,
    current_date + 45,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    'Read 20 pages',
    'Daily recurring habit that links to weekly strength sessions.',
    'learning',
    '#3b82f6',
    'recurring',
    'daily',
    null,
    current_date - 56,
    null,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '11111111-1111-4111-8111-111111111111',
    'Strength training',
    'Weekly recurring habit linked from daily reading for demo cascade.',
    'fitness',
    '#f59e0b',
    'recurring',
    'weekly',
    null,
    current_date - 56,
    null,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    '11111111-1111-4111-8111-111111111111',
    'Monthly budget review',
    'Monthly recurring admin habit.',
    'finance',
    '#ec4899',
    'recurring',
    'monthly',
    null,
    current_date - 140,
    null,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    '22222222-2222-4222-8222-222222222222',
    'Write 10 blog posts',
    'Bob fixed goal.',
    'career',
    '#8b5cf6',
    'fixed_milestones',
    null,
    10,
    current_date - 56,
    current_date + 30,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000007',
    '33333333-3333-4333-8333-333333333333',
    'Sunday planning',
    'Carla weekly recurring planning ritual.',
    'planning',
    '#06b6d4',
    'recurring',
    'weekly',
    null,
    current_date - 56,
    null,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000008',
    '11111111-1111-4111-8111-111111111111',
    'Neighborhood cleanup crew',
    'Collaborative group goal with independent participant progress.',
    'community',
    '#14b8a6',
    'recurring',
    'weekly',
    null,
    current_date - 56,
    null,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000009',
    '22222222-2222-4222-8222-222222222222',
    'Daily sketching',
    'Bob daily creative habit.',
    'creativity',
    '#f97316',
    'recurring',
    'daily',
    null,
    current_date - 56,
    null,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000010',
    '11111111-1111-4111-8111-111111111111',
    'File annual taxes',
    'Completed one-time goal to populate archived state.',
    'finance',
    '#ef4444',
    'fixed_milestones',
    null,
    1,
    current_date - 80,
    current_date - 20,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000011',
    '11111111-1111-4111-8111-111111111111',
    'Practice presentations 12 times',
    'Target-total recurring goal for exact-date completion semantics.',
    'career',
    '#0ea5e9',
    'recurring',
    'weekly',
    12,
    current_date - 20,
    current_date + 20,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000012',
    '11111111-1111-4111-8111-111111111111',
    'Morning mobility flow',
    'Weekly mobility session.',
    'wellness',
    '#f59e0b',
    'recurring',
    'weekly',
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000013',
    '11111111-1111-4111-8111-111111111111',
    'Evening walk loop',
    'Weekly walk loop to stay active.',
    'fitness',
    '#10b981',
    'recurring',
    'weekly',
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000014',
    '11111111-1111-4111-8111-111111111111',
    'Spanish vocabulary drills',
    'Weekly focused vocabulary session.',
    'learning',
    '#3b82f6',
    'recurring',
    'weekly',
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000015',
    '11111111-1111-4111-8111-111111111111',
    'Hydration check-in',
    'Weekly hydration review and reset.',
    'health',
    '#06b6d4',
    'recurring',
    'weekly',
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000016',
    '11111111-1111-4111-8111-111111111111',
    'Meal prep block',
    'Batch meals once per week.',
    'nutrition',
    '#84cc16',
    'recurring',
    'weekly',
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000017',
    '11111111-1111-4111-8111-111111111111',
    'Inbox zero sweep',
    'Weekly admin reset for email and tasks.',
    'productivity',
    '#6366f1',
    'recurring',
    'weekly',
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000018',
    '11111111-1111-4111-8111-111111111111',
    'Networking outreach',
    'Monthly networking sprint.',
    'career',
    '#8b5cf6',
    'recurring',
    'monthly',
    null,
    (date_trunc('month', current_date)::date + 6),
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000019',
    '11111111-1111-4111-8111-111111111111',
    'Product learning deep dive',
    'Monthly long-form product study session.',
    'learning',
    '#0ea5e9',
    'recurring',
    'monthly',
    null,
    (date_trunc('month', current_date)::date + 13),
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000020',
    '11111111-1111-4111-8111-111111111111',
    'Home reset sprint',
    'Monthly home reset sprint.',
    'home',
    '#ef4444',
    'recurring',
    'monthly',
    null,
    (date_trunc('month', current_date)::date + 20),
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000021',
    '11111111-1111-4111-8111-111111111111',
    'Guitar practice session',
    'Monthly guitar check-in session.',
    'creativity',
    '#f97316',
    'recurring',
    'monthly',
    null,
    (date_trunc('month', current_date)::date + 27),
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    null
  ),
  (
    '10000000-0000-4000-8000-000000000022',
    '11111111-1111-4111-8111-111111111111',
    'E2E drag fixture session',
    'Dedicated movable planner fixture goal for deterministic drag-and-save rails.',
    'testing',
    '#22c55e',
    'recurring',
    'weekly',
    null,
    current_date - 1,
    current_date + 180,
    null
  )
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  color = excluded.color,
  frequency_type = excluded.frequency_type,
  recurrence_interval = excluded.recurrence_interval,
  target_count = excluded.target_count,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  archived_at = excluded.archived_at,
  updated_at = now();

insert into public.goal_links (owner_id, source_goal_id, target_goal_id)
values
  ('11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004'),
  ('11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005')
on conflict (source_goal_id, target_goal_id) do nothing;

insert into public.goal_shares (goal_id, shared_with)
values
  ('10000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222'),
  ('10000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333')
on conflict (goal_id, shared_with) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
select '10000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', d::date, 'manual'
from generate_series(current_date - interval '56 day', current_date - interval '2 day', interval '3 day') d
on conflict (goal_id, user_id, completed_on) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
select '10000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', d::date, 'manual'
from generate_series(current_date - interval '56 day', current_date, interval '2 day') d
on conflict (goal_id, user_id, completed_on) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
select '10000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', d::date, 'manual'
from generate_series(current_date - interval '56 day', current_date, interval '7 day') d
on conflict (goal_id, user_id, completed_on) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
values
  ('10000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', date_trunc('month', current_date - interval '2 month')::date + 3, 'manual'),
  ('10000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', date_trunc('month', current_date - interval '1 month')::date + 4, 'manual'),
  ('10000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', date_trunc('month', current_date)::date + 4, 'manual')
on conflict (goal_id, user_id, completed_on) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
values
  ('10000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', current_date - 1, 'manual'),
  ('10000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', current_date - 1, 'linked_cascade'),
  ('10000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', current_date - 1, 'linked_cascade')
on conflict (goal_id, user_id, completed_on) do update
set source = excluded.source;

insert into public.completions (goal_id, user_id, completed_on, source)
values
  ('10000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', current_date - 25, 'manual')
on conflict (goal_id, user_id, completed_on) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
select '10000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', d::date, 'manual'
from generate_series(current_date - interval '56 day', current_date - interval '1 day', interval '4 day') d
on conflict (goal_id, user_id, completed_on) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
select '10000000-0000-4000-8000-000000000007', '33333333-3333-4333-8333-333333333333', d::date, 'manual'
from generate_series(current_date - interval '56 day', current_date, interval '7 day') d
on conflict (goal_id, user_id, completed_on) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
select '10000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', d::date, 'manual'
from generate_series(current_date - interval '56 day', current_date, interval '3 day') d
on conflict (goal_id, user_id, completed_on) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
select '10000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', d::date, 'manual'
from generate_series(current_date - interval '56 day', current_date, interval '7 day') d
on conflict (goal_id, user_id, completed_on) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
select '10000000-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', d::date, 'manual'
from generate_series(current_date - interval '42 day', current_date, interval '14 day') d
on conflict (goal_id, user_id, completed_on) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
select '10000000-0000-4000-8000-000000000008', '33333333-3333-4333-8333-333333333333', d::date, 'manual'
from generate_series(current_date - interval '35 day', current_date, interval '7 day') d
on conflict (goal_id, user_id, completed_on) do nothing;

-- Social seed coverage
-- Includes: cohorts, teams, mixed challenge states/types, leaderboard states,
-- feed/reactions, nudges, and notification outbox samples.
update public.profiles profile
set social_activity_visible = true
where profile.id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

insert into public.cohorts (
  id,
  slug,
  title,
  description,
  join_code,
  is_active,
  created_by
)
values (
  '70000000-0000-4000-8000-000000000001',
  'seed-alpha-cohort',
  'Alpha Cohort',
  'Seeded cohort for social scope demos.',
  'ALPHA1',
  true,
  '11111111-1111-4111-8111-111111111111'
);

insert into public.cohort_members (cohort_id, user_id, role)
values
  ('70000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'manager'),
  ('70000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'member'),
  ('70000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'member');

insert into public.teams (
  id,
  initiator_id,
  status,
  invite_message,
  visibility_acknowledged_at,
  invited_at,
  accepted_at
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'active',
    'Lets pair on the weekly challenges.',
    now() - interval '12 days',
    now() - interval '13 days',
    now() - interval '12 days'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '33333333-3333-4333-8333-333333333333',
    'pending',
    'Want to join forces for next month?',
    null,
    now() - interval '1 day',
    null
  );

insert into public.team_members (team_id, user_id, role, joined_at)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'initiator',
    now() - interval '13 days'
  ),
  (
    '71000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'member',
    now() - interval '13 days'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '33333333-3333-4333-8333-333333333333',
    'initiator',
    now() - interval '1 day'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'member',
    now() - interval '1 day'
  );

insert into public.team_preferences (
  team_id,
  user_id,
  share_completions,
  allow_nudges,
  notify_partner_activity
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    true,
    true,
    true
  ),
  (
    '71000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    true,
    true,
    true
  );

-- Alice + Bob team-owned goal for Checklist / complete-as-member demos.
insert into public.goals (
  id,
  owner_id,
  title,
  description,
  category,
  category_key,
  color,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date,
  team_id,
  is_private
)
values (
  '10000000-0000-4000-8000-000000000023',
  '11111111-1111-4111-8111-111111111111',
  'Team daily check-in',
  'Seeded team-owned goal for Alice and Bob.',
  'Health',
  'health',
  '#10b981',
  'recurring',
  'daily',
  null,
  current_date - 14,
  null,
  '71000000-0000-4000-8000-000000000001',
  false
);

insert into public.completions (goal_id, user_id, completed_on, source)
values
  (
    '10000000-0000-4000-8000-000000000023',
    '11111111-1111-4111-8111-111111111111',
    current_date - 1,
    'manual'
  ),
  (
    '10000000-0000-4000-8000-000000000023',
    '22222222-2222-4222-8222-222222222222',
    current_date - 1,
    'manual'
  );

insert into public.challenges (
  id,
  slug,
  title,
  description,
  status,
  subject_kind,
  metric,
  metric_track_key,
  target_value,
  starts_at,
  ends_at,
  reward_xp,
  max_participants,
  created_by,
  audience_kind,
  cohort_id
)
values
  (
    '72000000-0000-4000-8000-000000000001',
    'seed-active-user-total-xp',
    'Weekly XP Sprint',
    'Active individual sprint based on total XP.',
    'active',
    'user',
    'total_xp',
    null,
    280,
    now() - interval '10 days',
    now() + interval '4 days',
    120,
    null,
    '11111111-1111-4111-8111-111111111111',
    'global',
    null
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    'seed-active-team-completions',
    'Team Completion Rally',
    'Active team challenge based on completion count.',
    'active',
    'team',
    'completions_count',
    null,
    8,
    now() - interval '5 days',
    now() + interval '5 days',
    150,
    6,
    '22222222-2222-4222-8222-222222222222',
    'global',
    null
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    'seed-scheduled-cohort-health',
    'Cohort Health Push',
    'Upcoming cohort-scoped category XP challenge.',
    'scheduled',
    'user',
    'category_xp',
    'health',
    160,
    now() + interval '2 days',
    now() + interval '9 days',
    80,
    20,
    '11111111-1111-4111-8111-111111111111',
    'cohort',
    '70000000-0000-4000-8000-000000000001'
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    'seed-closed-active-days',
    'Consistency Wrap-Up',
    'Closed challenge to show history and completions.',
    'closed',
    'user',
    'distinct_active_days',
    null,
    12,
    now() - interval '20 days',
    now() - interval '2 days',
    90,
    null,
    '33333333-3333-4333-8333-333333333333',
    'global',
    null
  ),
  (
    '72000000-0000-4000-8000-000000000005',
    'seed-draft-streak',
    'Draft Streak Prototype',
    'Draft challenge for admin/moderation surfaces.',
    'draft',
    'user',
    'max_streak_days',
    null,
    7,
    now() + interval '5 days',
    now() + interval '20 days',
    60,
    null,
    '11111111-1111-4111-8111-111111111111',
    'global',
    null
  );

insert into public.challenge_participants (
  challenge_id,
  subject_kind,
  subject_id,
  joined_at,
  progress_value,
  progress_at,
  completed_at,
  awarded_at
)
values
  (
    '72000000-0000-4000-8000-000000000001',
    'user',
    '11111111-1111-4111-8111-111111111111',
    now() - interval '9 days',
    215,
    now() - interval '2 hours',
    null,
    null
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    'user',
    '22222222-2222-4222-8222-222222222222',
    now() - interval '9 days',
    292,
    now() - interval '3 hours',
    now() - interval '3 hours',
    now() - interval '2 hours'
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    'user',
    '33333333-3333-4333-8333-333333333333',
    now() - interval '8 days',
    148,
    now() - interval '5 hours',
    null,
    null
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    'team',
    '71000000-0000-4000-8000-000000000001',
    now() - interval '4 days',
    6,
    now() - interval '1 hour',
    null,
    null
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    'user',
    '11111111-1111-4111-8111-111111111111',
    now() - interval '18 days',
    14,
    now() - interval '3 days',
    now() - interval '3 days',
    now() - interval '2 days'
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    'user',
    '22222222-2222-4222-8222-222222222222',
    now() - interval '18 days',
    10,
    now() - interval '3 days',
    null,
    null
  );

insert into public.leaderboard_seasons (
  id,
  slug,
  title,
  subject_kind,
  metric,
  metric_track_key,
  starts_at,
  ends_at,
  status,
  rollover,
  previous_season_id,
  created_by,
  scope,
  cohort_id
)
values
  (
    '74000000-0000-4000-8000-000000000001',
    'seed-user-open',
    'Seed User Cohort Season',
    'user',
    'total_xp',
    null,
    now() - interval '14 days',
    now() + interval '14 days',
    'open',
    'monthly',
    null,
    '11111111-1111-4111-8111-111111111111',
    'cohort',
    '70000000-0000-4000-8000-000000000001'
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    'seed-user-closed',
    'Seed User Closed Season',
    'user',
    'total_xp',
    null,
    now() - interval '45 days',
    now() - interval '15 days',
    'closed',
    'none',
    null,
    '22222222-2222-4222-8222-222222222222',
    'global',
    null
  ),
  (
    '74000000-0000-4000-8000-000000000003',
    'seed-team-open-cohort',
    'Seed Team Cohort Season',
    'team',
    'completions_count',
    null,
    now() - interval '7 days',
    now() + interval '7 days',
    'open',
    'none',
    null,
    '11111111-1111-4111-8111-111111111111',
    'cohort',
    '70000000-0000-4000-8000-000000000001'
  );

insert into public.leaderboard_standings (
  season_id,
  subject_kind,
  subject_id,
  score,
  tie_break_at,
  rank,
  refreshed_at
)
values
  (
    '74000000-0000-4000-8000-000000000001',
    'user',
    '11111111-1111-4111-8111-111111111111',
    420,
    now() - interval '3 days',
    1,
    now() - interval '10 minutes'
  ),
  (
    '74000000-0000-4000-8000-000000000001',
    'user',
    '22222222-2222-4222-8222-222222222222',
    300,
    now() - interval '2 days',
    2,
    now() - interval '10 minutes'
  ),
  (
    '74000000-0000-4000-8000-000000000001',
    'user',
    '33333333-3333-4333-8333-333333333333',
    265,
    now() - interval '1 day',
    3,
    now() - interval '10 minutes'
  ),
  (
    '74000000-0000-4000-8000-000000000003',
    'team',
    '71000000-0000-4000-8000-000000000001',
    12,
    now() - interval '1 day',
    1,
    now() - interval '10 minutes'
  );

insert into public.leaderboard_season_results (
  season_id,
  subject_kind,
  subject_id,
  score,
  tie_break_at,
  rank,
  display_name,
  frozen_at
)
values
  (
    '74000000-0000-4000-8000-000000000002',
    'user',
    '11111111-1111-4111-8111-111111111111',
    610,
    now() - interval '20 days',
    1,
    'Alice Park',
    now() - interval '15 days'
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    'user',
    '22222222-2222-4222-8222-222222222222',
    540,
    now() - interval '19 days',
    2,
    'Bob Chen',
    now() - interval '15 days'
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    'user',
    '33333333-3333-4333-8333-333333333333',
    500,
    now() - interval '18 days',
    3,
    'Carla Diaz',
    now() - interval '15 days'
  );

insert into public.feed_events (
  id,
  actor_id,
  event_type,
  subject_key,
  bucket_date,
  track_key,
  goal_id,
  xp_delta,
  occurrence_count,
  payload,
  reaction_count,
  hidden_at,
  hidden_by,
  hidden_reason,
  created_at,
  updated_at
)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'xp_earned',
    'health',
    current_date - 1,
    'health',
    '10000000-0000-4000-8000-000000000004',
    40,
    2,
    jsonb_build_object('source', 'seed', 'note', 'double workout day'),
    2,
    null,
    null,
    null,
    now() - interval '20 hours',
    now() - interval '20 hours'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    'goal_achieved',
    '10000000-0000-4000-8000-000000000006',
    current_date - 2,
    'career',
    '10000000-0000-4000-8000-000000000006',
    100,
    1,
    jsonb_build_object('goalId', '10000000-0000-4000-8000-000000000006'),
    1,
    null,
    null,
    null,
    now() - interval '40 hours',
    now() - interval '40 hours'
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    'challenge_completed',
    '72000000-0000-4000-8000-000000000004',
    current_date - 2,
    'health',
    null,
    90,
    1,
    jsonb_build_object('challengeId', '72000000-0000-4000-8000-000000000004', 'rank', 1),
    1,
    null,
    null,
    null,
    now() - interval '36 hours',
    now() - interval '36 hours'
  ),
  (
    '73000000-0000-4000-8000-000000000004',
    '11111111-1111-4111-8111-111111111111',
    'season_result',
    '74000000-0000-4000-8000-000000000002',
    current_date - 14,
    'health',
    null,
    0,
    1,
    jsonb_build_object('seasonId', '74000000-0000-4000-8000-000000000002', 'rank', 1, 'score', 610),
    0,
    null,
    null,
    null,
    now() - interval '14 days',
    now() - interval '14 days'
  ),
  (
    '73000000-0000-4000-8000-000000000005',
    '22222222-2222-4222-8222-222222222222',
    'team_formed',
    '71000000-0000-4000-8000-000000000001',
    current_date - 12,
    null,
    null,
    0,
    1,
    jsonb_build_object('teamId', '71000000-0000-4000-8000-000000000001'),
    0,
    null,
    null,
    null,
    now() - interval '12 days',
    now() - interval '12 days'
  ),
  (
    '73000000-0000-4000-8000-000000000006',
    '11111111-1111-4111-8111-111111111111',
    'team_formed',
    '71000000-0000-4000-8000-000000000001',
    current_date - 12,
    null,
    null,
    0,
    1,
    jsonb_build_object('teamId', '71000000-0000-4000-8000-000000000001'),
    0,
    null,
    null,
    null,
    now() - interval '12 days',
    now() - interval '12 days'
  ),
  (
    '73000000-0000-4000-8000-000000000007',
    '33333333-3333-4333-8333-333333333333',
    'level_up',
    'global',
    current_date - 3,
    'global',
    null,
    0,
    1,
    jsonb_build_object('level', 3, 'track', 'global'),
    0,
    null,
    null,
    null,
    now() - interval '3 days',
    now() - interval '3 days'
  ),
  (
    '73000000-0000-4000-8000-000000000008',
    '22222222-2222-4222-8222-222222222222',
    'xp_earned',
    'career',
    current_date - 1,
    'career',
    '10000000-0000-4000-8000-000000000006',
    30,
    1,
    jsonb_build_object('source', 'seed', 'note', 'writing streak'),
    1,
    null,
    null,
    null,
    now() - interval '18 hours',
    now() - interval '18 hours'
  ),
  (
    '73000000-0000-4000-8000-000000000009',
    '33333333-3333-4333-8333-333333333333',
    'xp_earned',
    'personal',
    current_date - 4,
    'personal',
    '10000000-0000-4000-8000-000000000007',
    20,
    1,
    jsonb_build_object('source', 'seed', 'note', 'planning ritual'),
    0,
    now() - interval '2 days',
    '11111111-1111-4111-8111-111111111111',
    'duplicate_demo_event',
    now() - interval '4 days',
    now() - interval '2 days'
  ),
  (
    '73000000-0000-4000-8000-000000000010',
    '11111111-1111-4111-8111-111111111111',
    'challenge_completed',
    '72000000-0000-4000-8000-000000000001',
    current_date,
    'health',
    null,
    120,
    1,
    jsonb_build_object('challengeId', '72000000-0000-4000-8000-000000000001', 'subjectKind', 'user'),
    0,
    null,
    null,
    null,
    now() - interval '2 hours',
    now() - interval '2 hours'
  );

insert into public.feed_reactions (
  feed_event_id,
  user_id,
  reaction,
  created_at
)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'fire',
    now() - interval '19 hours'
  ),
  (
    '73000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'clap',
    now() - interval '18 hours'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'strong',
    now() - interval '38 hours'
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '22222222-2222-4222-8222-222222222222',
    'cheer',
    now() - interval '34 hours'
  ),
  (
    '73000000-0000-4000-8000-000000000008',
    '11111111-1111-4111-8111-111111111111',
    'clap',
    now() - interval '17 hours'
  );

insert into public.nudges (
  id,
  team_id,
  from_user_id,
  to_user_id,
  kind,
  goal_id,
  message,
  created_at
)
values
  (
    '75000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'cheer',
    '10000000-0000-4000-8000-000000000006',
    null,
    now() - interval '1 day'
  ),
  (
    '75000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'custom',
    '10000000-0000-4000-8000-000000000009',
    'Nice run streak this week. Keep it rolling.',
    now() - interval '22 hours'
  ),
  (
    '75000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'remind',
    '10000000-0000-4000-8000-000000000009',
    null,
    now() - interval '6 hours'
  );

insert into public.notification_outbox (
  id,
  user_id,
  kind,
  title,
  body,
  url,
  dedupe_key,
  state,
  attempts,
  last_error,
  available_at,
  sent_at,
  created_at
)
values
  (
    '76000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'team_invite',
    'New team invite',
    'Carla invited you to join her team.',
    '/social',
    'seed-team-invite-1',
    'pending',
    0,
    null,
    now() - interval '30 minutes',
    null,
    now() - interval '1 hour'
  ),
  (
    '76000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'reaction',
    'New reaction',
    'Bob reacted to your challenge completion.',
    '/social',
    'seed-reaction-1',
    'sent',
    1,
    null,
    now() - interval '6 hours',
    now() - interval '5 hours',
    now() - interval '6 hours'
  ),
  (
    '76000000-0000-4000-8000-000000000003',
    '33333333-3333-4333-8333-333333333333',
    'challenge_ending_soon',
    'Challenge ending soon',
    'Only a day left in Weekly XP Sprint.',
    '/social',
    'seed-challenge-ending-1',
    'failed',
    5,
    'delivery_timeout',
    now() - interval '3 hours',
    null,
    now() - interval '10 hours'
  ),
  (
    '76000000-0000-4000-8000-000000000004',
    '22222222-2222-4222-8222-222222222222',
    'nudge',
    'Partner nudge',
    'Alice nudged you on Daily sketching.',
    '/social',
    'seed-nudge-1',
    'skipped',
    1,
    'no_subscriptions',
    now() - interval '4 hours',
    null,
    now() - interval '7 hours'
  );

-- Additional social demo scenarios for recent rollouts:
-- - cohort-scoped visibility partitions
-- - archived/closed historical records
-- - broader feed/reaction/nudge/outbox coverage

insert into public.cohorts (
  id,
  slug,
  title,
  description,
  join_code,
  is_active,
  created_by
)
values (
  '70000000-0000-4000-8000-000000000002',
  'seed-builders-cohort',
  'Builders Cohort',
  'Second seeded cohort to demo scope-restricted challenges and leaderboards.',
  'BUILD2',
  true,
  '11111111-1111-4111-8111-111111111111'
);

insert into public.cohort_members (cohort_id, user_id, role)
values
  ('70000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'manager'),
  ('70000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'member');

insert into public.teams (
  id,
  initiator_id,
  status,
  invite_message,
  visibility_acknowledged_at,
  invited_at,
  accepted_at,
  dissolved_at,
  closed_at
)
values (
  '71000000-0000-4000-8000-000000000004',
  '11111111-1111-4111-8111-111111111111',
  'closed',
  'Historical team used for closed-state demos.',
  now() - interval '45 days',
  now() - interval '46 days',
  now() - interval '45 days',
  now() - interval '32 days',
  now() - interval '32 days'
);

insert into public.team_members (team_id, user_id, role, joined_at)
values
  (
    '71000000-0000-4000-8000-000000000004',
    '11111111-1111-4111-8111-111111111111',
    'initiator',
    now() - interval '46 days'
  ),
  (
    '71000000-0000-4000-8000-000000000004',
    '33333333-3333-4333-8333-333333333333',
    'member',
    now() - interval '46 days'
  );

insert into public.challenges (
  id,
  slug,
  title,
  description,
  status,
  subject_kind,
  metric,
  metric_track_key,
  target_value,
  starts_at,
  ends_at,
  reward_xp,
  max_participants,
  created_by,
  audience_kind,
  cohort_id
)
values
  (
    '72000000-0000-4000-8000-000000000006',
    'seed-builders-career-push',
    'Builders Career Push',
    'Active cohort-scoped category XP challenge for Alice and Bob.',
    'active',
    'user',
    'category_xp',
    'career',
    120,
    now() - interval '3 days',
    now() + interval '6 days',
    95,
    12,
    '11111111-1111-4111-8111-111111111111',
    'cohort',
    '70000000-0000-4000-8000-000000000002'
  ),
  (
    '72000000-0000-4000-8000-000000000007',
    'seed-archived-team-streak',
    'Archived Team Streak',
    'Archived team challenge retained for admin/history demos.',
    'archived',
    'team',
    'completions_count',
    null,
    14,
    now() - interval '40 days',
    now() - interval '10 days',
    75,
    null,
    '22222222-2222-4222-8222-222222222222',
    'global',
    null
  );

insert into public.challenge_participants (
  challenge_id,
  subject_kind,
  subject_id,
  joined_at,
  progress_value,
  progress_at,
  completed_at,
  awarded_at
)
values
  (
    '72000000-0000-4000-8000-000000000006',
    'user',
    '11111111-1111-4111-8111-111111111111',
    now() - interval '3 days',
    96,
    now() - interval '45 minutes',
    null,
    null
  ),
  (
    '72000000-0000-4000-8000-000000000006',
    'user',
    '22222222-2222-4222-8222-222222222222',
    now() - interval '3 days',
    132,
    now() - interval '75 minutes',
    now() - interval '75 minutes',
    now() - interval '40 minutes'
  ),
  (
    '72000000-0000-4000-8000-000000000007',
    'team',
    '71000000-0000-4000-8000-000000000001',
    now() - interval '39 days',
    17,
    now() - interval '11 days',
    now() - interval '11 days',
    now() - interval '10 days'
  );

insert into public.leaderboard_seasons (
  id,
  slug,
  title,
  subject_kind,
  metric,
  metric_track_key,
  starts_at,
  ends_at,
  status,
  rollover,
  previous_season_id,
  created_by,
  scope,
  cohort_id
)
values
  (
    '74000000-0000-4000-8000-000000000004',
    'seed-builders-career-open',
    'Builders Career Open Season',
    'user',
    'category_xp',
    'career',
    now() - interval '6 days',
    now() + interval '1 day',
    'open',
    'weekly',
    null,
    '11111111-1111-4111-8111-111111111111',
    'cohort',
    '70000000-0000-4000-8000-000000000002'
  ),
  (
    '74000000-0000-4000-8000-000000000005',
    'seed-team-closed-global',
    'Seed Team Closed Global Season',
    'team',
    'completions_count',
    null,
    now() - interval '40 days',
    now() - interval '12 days',
    'closed',
    'none',
    null,
    '22222222-2222-4222-8222-222222222222',
    'global',
    null
  );

insert into public.leaderboard_standings (
  season_id,
  subject_kind,
  subject_id,
  score,
  tie_break_at,
  rank,
  refreshed_at
)
values
  (
    '74000000-0000-4000-8000-000000000004',
    'user',
    '11111111-1111-4111-8111-111111111111',
    165,
    now() - interval '4 hours',
    1,
    now() - interval '10 minutes'
  ),
  (
    '74000000-0000-4000-8000-000000000004',
    'user',
    '22222222-2222-4222-8222-222222222222',
    142,
    now() - interval '5 hours',
    2,
    now() - interval '10 minutes'
  );

insert into public.leaderboard_season_results (
  season_id,
  subject_kind,
  subject_id,
  score,
  tie_break_at,
  rank,
  display_name,
  frozen_at
)
values
  (
    '74000000-0000-4000-8000-000000000005',
    'team',
    '71000000-0000-4000-8000-000000000001',
    27,
    now() - interval '13 days',
    1,
    'Alice Park + Bob Chen',
    now() - interval '12 days'
  );

insert into public.feed_events (
  id,
  actor_id,
  event_type,
  subject_key,
  bucket_date,
  track_key,
  goal_id,
  xp_delta,
  occurrence_count,
  payload,
  reaction_count,
  hidden_at,
  hidden_by,
  hidden_reason,
  created_at,
  updated_at
)
values
  (
    '73000000-0000-4000-8000-000000000011',
    '22222222-2222-4222-8222-222222222222',
    'challenge_completed',
    '72000000-0000-4000-8000-000000000006',
    current_date - 1,
    'career',
    null,
    95,
    1,
    jsonb_build_object('challengeId', '72000000-0000-4000-8000-000000000006', 'subjectKind', 'user'),
    1,
    null,
    null,
    null,
    now() - interval '2 hours',
    now() - interval '2 hours'
  ),
  (
    '73000000-0000-4000-8000-000000000012',
    '22222222-2222-4222-8222-222222222222',
    'season_result',
    '74000000-0000-4000-8000-000000000005',
    current_date - 12,
    null,
    null,
    0,
    1,
    jsonb_build_object('seasonId', '74000000-0000-4000-8000-000000000005', 'rank', 1, 'score', 27),
    0,
    null,
    null,
    null,
    now() - interval '12 days',
    now() - interval '12 days'
  ),
  (
    '73000000-0000-4000-8000-000000000013',
    '11111111-1111-4111-8111-111111111111',
    'team_formed',
    '71000000-0000-4000-8000-000000000004',
    current_date - 46,
    null,
    null,
    0,
    1,
    jsonb_build_object('teamId', '71000000-0000-4000-8000-000000000004', 'historical', true),
    0,
    null,
    null,
    null,
    now() - interval '46 days',
    now() - interval '46 days'
  );

insert into public.feed_reactions (
  feed_event_id,
  user_id,
  reaction,
  created_at
)
values (
  '73000000-0000-4000-8000-000000000011',
  '11111111-1111-4111-8111-111111111111',
  'fire',
  now() - interval '100 minutes'
);

insert into public.nudges (
  id,
  team_id,
  from_user_id,
  to_user_id,
  kind,
  goal_id,
  message,
  created_at
)
values (
  '75000000-0000-4000-8000-000000000004',
  '71000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'custom',
  '10000000-0000-4000-8000-000000000006',
  'Great momentum on the cohort push.',
  now() - interval '95 minutes'
);

insert into public.notification_outbox (
  id,
  user_id,
  kind,
  title,
  body,
  url,
  dedupe_key,
  state,
  attempts,
  last_error,
  available_at,
  sent_at,
  created_at
)
values
  (
    '76000000-0000-4000-8000-000000000005',
    '11111111-1111-4111-8111-111111111111',
    'team_accepted',
    'Invite accepted',
    'Bob accepted your team invite.',
    '/social',
    'seed-team-accepted-1',
    'sent',
    1,
    null,
    now() - interval '14 days',
    now() - interval '14 days',
    now() - interval '14 days'
  ),
  (
    '76000000-0000-4000-8000-000000000006',
    '11111111-1111-4111-8111-111111111111',
    'team_dissolved',
    'Team dissolved',
    'A historical team partnership was closed.',
    '/social',
    'seed-team-dissolved-1',
    'pending',
    0,
    null,
    now() - interval '15 minutes',
    null,
    now() - interval '20 minutes'
  ),
  (
    '76000000-0000-4000-8000-000000000007',
    '22222222-2222-4222-8222-222222222222',
    'challenge_joined',
    'Challenge joined',
    'Alice joined Builders Career Push.',
    '/social',
    'seed-challenge-joined-1',
    'sent',
    1,
    null,
    now() - interval '3 hours',
    now() - interval '2 hours',
    now() - interval '3 hours'
  ),
  (
    '76000000-0000-4000-8000-000000000008',
    '11111111-1111-4111-8111-111111111111',
    'challenge_completed',
    'Challenge completed',
    'Bob completed Builders Career Push.',
    '/social',
    'seed-challenge-completed-1',
    'sent',
    1,
    null,
    now() - interval '90 minutes',
    now() - interval '80 minutes',
    now() - interval '90 minutes'
  ),
  (
    '76000000-0000-4000-8000-000000000009',
    '22222222-2222-4222-8222-222222222222',
    'season_closed',
    'Season closed',
    'Seed Team Closed Global Season is now final.',
    '/social',
    'seed-season-closed-1',
    'failed',
    2,
    'push_gateway_429',
    now() - interval '11 days',
    null,
    now() - interval '11 days'
  ),
  (
    '76000000-0000-4000-8000-000000000010',
    '11111111-1111-4111-8111-111111111111',
    'planner_proposal',
    'Partner proposal ready',
    'A partner planner proposal is waiting for review.',
    '/social',
    'seed-planner-proposal-1',
    'pending',
    0,
    null,
    now() - interval '25 minutes',
    null,
    now() - interval '30 minutes'
  ),
  (
    '76000000-0000-4000-8000-000000000011',
    '22222222-2222-4222-8222-222222222222',
    'planner_proposal_decided',
    'Proposal updated',
    'Your partner responded to the planner proposal.',
    '/social',
    'seed-planner-proposal-decided-1',
    'skipped',
    1,
    'notifications_disabled',
    now() - interval '70 minutes',
    null,
    now() - interval '70 minutes'
  );
