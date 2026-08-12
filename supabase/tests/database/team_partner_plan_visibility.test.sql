begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(4);

insert into auth.users (id, email)
values
  ('9f111111-1111-4111-8111-111111111111', 'duo-plan-viewer@example.com'),
  ('9f222222-2222-4222-8222-222222222222', 'duo-plan-owner@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('9f111111-1111-4111-8111-111111111111', 'duo_plan_viewer'),
  ('9f222222-2222-4222-8222-222222222222', 'duo_plan_owner')
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
values (
  '9f300000-0000-4000-8000-000000000001',
  '9f111111-1111-4111-8111-111111111111',
  '9f222222-2222-4222-8222-222222222222',
  '9f111111-1111-4111-8111-111111111111',
  'active',
  pg_catalog.now() - interval '3 days',
  pg_catalog.now() - interval '3 days',
  pg_catalog.now() - interval '3 days'
)
on conflict (id) do nothing;

insert into public.team_preferences (
  team_id,
  user_id,
  share_planner,
  allow_proposals
)
values
  ('9f300000-0000-4000-8000-000000000001', '9f111111-1111-4111-8111-111111111111', true, true),
  ('9f300000-0000-4000-8000-000000000001', '9f222222-2222-4222-8222-222222222222', true, true)
on conflict (team_id, user_id) do update
set share_planner = excluded.share_planner,
    allow_proposals = excluded.allow_proposals;

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
  is_private
)
values
  (
    '9f400000-0000-4000-8000-000000000001',
    '9f222222-2222-4222-8222-222222222222',
    'Shared planner goal',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    date '2026-08-01',
    date '2026-08-31',
    false,
    false
  ),
  (
    '9f400000-0000-4000-8000-000000000002',
    '9f222222-2222-4222-8222-222222222222',
    'Excluded planner goal',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    date '2026-08-01',
    date '2026-08-31',
    false,
    true
  )
on conflict (id) do nothing;

insert into public.planner_items (
  owner_id,
  goal_id,
  unit_key,
  scheduled_date,
  scheduled_time,
  locked
)
values
  (
    '9f222222-2222-4222-8222-222222222222',
    '9f400000-0000-4000-8000-000000000001',
    'shared-unit',
    date '2026-08-12',
    '08:00',
    false
  ),
  (
    '9f222222-2222-4222-8222-222222222222',
    '9f400000-0000-4000-8000-000000000002',
    'excluded-unit',
    date '2026-08-13',
    '09:00',
    false
  )
on conflict (goal_id, unit_key) do nothing;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9f111111-1111-4111-8111-111111111111', true);

select is(
  (
    select count(*)::integer
    from public.get_team_partner_plan_service(date '2026-08-01')
  ),
  1,
  'partner plan service only returns partner-visible goal rows'
);

select ok(
  (
    select exists(
      select 1
      from public.get_team_partner_plan_service(date '2026-08-01') item
      where item.goal_id = '9f400000-0000-4000-8000-000000000001'
    )
  ),
  'shared goal item is visible through partner plan service'
);

reset role;
set local role service_role;
update public.team_preferences
set share_planner = false
where team_id = '9f300000-0000-4000-8000-000000000001'
  and user_id = '9f222222-2222-4222-8222-222222222222';

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9f111111-1111-4111-8111-111111111111', true);

select is(
  (
    select count(*)::integer
    from public.get_team_partner_plan_service(date '2026-08-01')
  ),
  0,
  'share_planner preference blocks partner plan visibility immediately'
);

select is(
  (
    select count(*)::integer
    from public.get_team_partner_plan_service(date '2026-09-01')
  ),
  0,
  'partner plan service returns empty for months without visible rows'
);

select * from finish();
rollback;
