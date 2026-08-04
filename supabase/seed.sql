-- Cadence local seed data
-- Demo credentials:
-- alice@example.com / password123
-- bob@example.com / password123
-- carla@example.com / password123

truncate table
  public.goal_shares,
  public.goal_participants,
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

insert into public.profiles (id, username, display_name, avatar_url)
values
  ('11111111-1111-4111-8111-111111111111', 'alice', 'Alice Park', null),
  ('22222222-2222-4222-8222-222222222222', 'bob', 'Bob Chen', null),
  ('33333333-3333-4333-8333-333333333333', 'carla', 'Carla Diaz', null)
on conflict (id) do update
set
  username = excluded.username,
  display_name = excluded.display_name,
  avatar_url = excluded.avatar_url;

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
  is_group,
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
    false,
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
    false,
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
    false,
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
    false,
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
    false,
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
    false,
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
    false,
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
    true,
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
    false,
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
    false,
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
    false,
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
  is_group = excluded.is_group,
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

insert into public.goal_participants (goal_id, user_id, role)
values
  ('10000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('10000000-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', 'participant'),
  ('10000000-0000-4000-8000-000000000008', '33333333-3333-4333-8333-333333333333', 'participant')
on conflict (goal_id, user_id) do update
set role = excluded.role;

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
