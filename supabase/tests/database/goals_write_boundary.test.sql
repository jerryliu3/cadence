begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(8);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select public.create_goal(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'Write boundary goal',
      'desc',
      null,
      'health',
      'health',
      '#0ea5e9',
      'recurring',
      'daily',
      null,
      null,
      current_date,
      null,
      null,
      false
    )
  $$,
  'create_goal succeeds for authenticated owner'
);

select is(
  (
    select category_key
    from public.goals
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'health',
  'create_goal normalizes category_key without the category trigger'
);

select throws_ok(
  $$
    insert into public.goals (
      id,
      owner_id,
      title,
      category,
      category_key,
      frequency_type,
      recurrence_interval,
      start_date
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      '11111111-1111-4111-8111-111111111111',
      'blocked direct insert',
      'health',
      'health',
      'recurring',
      'daily',
      current_date
    )
  $$,
  '42501',
  null,
  'direct goals insert is blocked after write-policy drop'
);

select lives_ok(
  $$
    select public.replace_goal_source_link(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  'replace_goal_source_link inserts a validated personal link'
);

select throws_ok(
  $$
    insert into public.goal_links (
      owner_id,
      source_goal_id,
      target_goal_id
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '10000000-0000-4000-8000-000000000004'
    )
  $$,
  '42501',
  null,
  'direct goal_links insert is blocked'
);

select lives_ok(
  $$
    select public.create_group_goal(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      'Group boundary goal',
      null,
      'health',
      'health',
      '#0ea5e9',
      'recurring',
      'weekly',
      null,
      current_date,
      null
    )
  $$,
  'create_group_goal creates goal and owner participant'
);

select is(
  (
    select role::text
    from public.goal_participants
    where goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
      and user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'owner',
  'create_group_goal inserts owner participant row'
);

select throws_ok(
  $$
    insert into public.goal_participants (
      goal_id,
      user_id,
      role
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      '22222222-2222-4222-8222-222222222222',
      'participant'
    )
  $$,
  '42501',
  null,
  'direct goal_participants insert is blocked'
);

select * from finish();
rollback;
