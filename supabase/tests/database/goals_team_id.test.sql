begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(15);

insert into auth.users (id, email)
values
  ('bf111111-1111-4111-8111-111111111111', 'team-goal-owner@example.com'),
  ('bf222222-2222-4222-8222-222222222222', 'team-goal-partner@example.com'),
  ('bf333333-3333-4333-8333-333333333333', 'team-goal-outsider@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, display_name)
values
  ('bf111111-1111-4111-8111-111111111111', 'team_goal_owner', 'Owner'),
  ('bf222222-2222-4222-8222-222222222222', 'team_goal_partner', 'Partner'),
  ('bf333333-3333-4333-8333-333333333333', 'team_goal_outsider', 'Outsider')
on conflict (id) do nothing;

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'goals'
      and column_name = 'team_id'
  ),
  1,
  'goals.team_id exists'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'bf111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.team_id',
  public.create_team_invite_service('bf222222-2222-4222-8222-222222222222', null)::text,
  true
);

select set_config('request.jwt.claim.sub', 'bf222222-2222-4222-8222-222222222222', true);
select ok(
  public.accept_team_invite_service(current_setting('request.team_id')::uuid, true),
  'partner accepts team invite'
);

reset role;
set local role service_role;

select throws_ok(
  format(
    $$insert into public.goals (
      id, owner_id, title, category, category_key, frequency_type,
      recurrence_interval, target_count, start_date, end_date,
      is_group, is_private, team_id
    ) values (
      'bf400000-0000-4000-8000-000000000099',
      'bf111111-1111-4111-8111-111111111111',
      'Private team goal',
      'Health', 'health', 'recurring', 'weekly', 3,
      current_date - 5, current_date + 5,
      false, true, '%s'::uuid
    )$$,
    current_setting('request.team_id')::uuid
  ),
  '23514',
  'new row for relation "goals" violates check constraint "goals_team_id_not_private"',
  'private team_id goals are rejected'
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
  is_group,
  is_private,
  team_id
)
values
  (
    'bf400000-0000-4000-8000-000000000001',
    'bf111111-1111-4111-8111-111111111111',
    'Team owned goal',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 5,
    current_date + 5,
    false,
    false,
    current_setting('request.team_id')::uuid
  ),
  (
    'bf400000-0000-4000-8000-000000000002',
    'bf111111-1111-4111-8111-111111111111',
    'Personal shared goal',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 5,
    current_date + 5,
    false,
    false,
    null
  ),
  (
    'bf400000-0000-4000-8000-000000000003',
    'bf111111-1111-4111-8111-111111111111',
    'Personal private goal',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 5,
    current_date + 5,
    false,
    true,
    null
  ),
  (
    'bf400000-0000-4000-8000-000000000004',
    'bf111111-1111-4111-8111-111111111111',
    'Leftover group goal',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 5,
    current_date + 5,
    true,
    false,
    null
  );

insert into public.goal_participants (goal_id, user_id, role)
values (
  'bf400000-0000-4000-8000-000000000004',
  'bf222222-2222-4222-8222-222222222222',
  'participant'
);

insert into public.completions (goal_id, user_id, completed_on, source)
values
  (
    'bf400000-0000-4000-8000-000000000001',
    'bf111111-1111-4111-8111-111111111111',
    current_date - 1,
    'manual'
  ),
  (
    'bf400000-0000-4000-8000-000000000001',
    'bf111111-1111-4111-8111-111111111111',
    current_date,
    'manual'
  ),
  (
    'bf400000-0000-4000-8000-000000000001',
    'bf222222-2222-4222-8222-222222222222',
    current_date,
    'manual'
  );

reset role;

select ok(
  public.can_view_goal(
    'bf400000-0000-4000-8000-000000000001',
    'bf222222-2222-4222-8222-222222222222'
  ),
  'team member can view a team-id goal'
);

select ok(
  public.can_view_goal_content(
    'bf400000-0000-4000-8000-000000000001',
    'bf222222-2222-4222-8222-222222222222'
  ),
  'team member can view team-id goal content'
);

select ok(
  public.can_complete_goal(
    'bf400000-0000-4000-8000-000000000001',
    'bf222222-2222-4222-8222-222222222222'
  ),
  'team member can complete a team-id goal'
);

select ok(
  public.can_view_goal_content(
    'bf400000-0000-4000-8000-000000000002',
    'bf222222-2222-4222-8222-222222222222'
  ),
  'partner can view the owner personal non-private goal'
);

select ok(
  not public.can_complete_goal(
    'bf400000-0000-4000-8000-000000000002',
    'bf222222-2222-4222-8222-222222222222'
  ),
  'partner cannot complete the owner personal goal'
);

select ok(
  not public.can_view_goal_content(
    'bf400000-0000-4000-8000-000000000003',
    'bf222222-2222-4222-8222-222222222222'
  ),
  'partner cannot view the owner private personal goal'
);

select ok(
  not public.can_view_goal(
    'bf400000-0000-4000-8000-000000000001',
    'bf333333-3333-4333-8333-333333333333'
  ),
  'outsider cannot view a team-id goal'
);

select ok(
  not public.can_complete_goal(
    'bf400000-0000-4000-8000-000000000001',
    'bf333333-3333-4333-8333-333333333333'
  ),
  'outsider cannot complete a team-id goal'
);

select ok(
  not public.can_complete_goal(
    'bf400000-0000-4000-8000-000000000004',
    'bf222222-2222-4222-8222-222222222222'
  ),
  'leftover group participants are not completers after the team-id cutover'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'bf111111-1111-4111-8111-111111111111', true);

select is(
  (
    select count(*)::integer
    from public.get_team_goal_progress('bf400000-0000-4000-8000-000000000001')
  ),
  2,
  'team goal progress returns both members'
);

select is(
  (
    select completion_count
    from public.get_team_goal_progress('bf400000-0000-4000-8000-000000000001')
    where user_id = 'bf111111-1111-4111-8111-111111111111'
  ),
  2,
  'team goal progress counts owner completions'
);

select throws_ok(
  $$select * from public.get_team_goal_progress('bf400000-0000-4000-8000-000000000002')$$,
  '22023',
  'team_goal_required',
  'progress rpc rejects personal goals'
);

select * from finish();
rollback;
