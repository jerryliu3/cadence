begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(24);

-- Pin the five dropped client-PostgREST triggers.
select hasnt_trigger(
  'public',
  'goal_links',
  'validate_goal_link',
  'validate_goal_link trigger is dropped'
);
select hasnt_trigger(
  'public',
  'goal_participants',
  'validate_goal_participant',
  'validate_goal_participant trigger is dropped'
);
select hasnt_trigger(
  'public',
  'goals',
  'goals_set_category_key',
  'goals_set_category_key trigger is dropped'
);
select hasnt_trigger(
  'public',
  'goals',
  'goals_xp_recompute',
  'goals_xp_recompute trigger is dropped'
);
select hasnt_trigger(
  'public',
  'goals',
  'goals_xp_reverse_on_delete',
  'goals_xp_reverse_on_delete trigger is dropped'
);
select has_trigger(
  'public',
  'goals',
  'set_goals_updated_at',
  'set_goals_updated_at trigger is kept'
);

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

update public.goals
set title = 'blocked direct update'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select is(
  (
    select title
    from public.goals
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'Write boundary goal',
  'direct goals update is a no-op under RLS'
);

delete from public.goals
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select ok(
  exists(
    select 1
    from public.goals
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'direct goals delete is a no-op under RLS'
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

-- Cross-owner link rejection (old validate_goal_link invariant).
select throws_ok(
  $$
    select public.replace_goal_source_link(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '10000000-0000-4000-8000-000000000009'
    )
  $$,
  '23514',
  'goal links may only connect goals owned by the link owner',
  'cross-owner goal link is rejected'
);

-- Group goal cannot participate in personal links.
select throws_ok(
  $$
    select public.replace_goal_source_link(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '10000000-0000-4000-8000-000000000008'
    )
  $$,
  '23514',
  'group goals cannot participate in personal goal links',
  'group-goal link is rejected'
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

delete from public.goal_links
where source_goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select ok(
  exists(
    select 1
    from public.goal_links
    where source_goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and target_goal_id = '10000000-0000-4000-8000-000000000003'
  ),
  'direct goal_links delete is a no-op under RLS'
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

select lives_ok(
  $$
    select public.add_goal_participant(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      '22222222-2222-4222-8222-222222222222',
      'participant'
    )
  $$,
  'owner can invite a participant'
);

-- Self-leave must work for non-owners.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select public.remove_goal_participant(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      '22222222-2222-4222-8222-222222222222'
    )
  $$,
  'participant can self-leave via remove_goal_participant'
);

select is(
  (
    select count(*)::integer
    from public.goal_participants
    where goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
      and user_id = '22222222-2222-4222-8222-222222222222'
  ),
  0,
  'self-leave removes the participant row'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

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

-- XP recompute on soft-delete (replaces goals_xp_recompute for is_deleted).
select public.create_goal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
  'XP soft delete goal',
  null,
  null,
  'health',
  'health',
  '#10b981',
  'recurring',
  'daily',
  null,
  null,
  current_date - 7,
  null,
  null,
  false
);

select public.mark_goal_complete(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
  current_date
);

select ok(
  (
    select coalesce(sum(l.xp_delta), 0)
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
  ) > 0,
  'completion accrues XP before soft delete'
);

select public.soft_delete_goal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4');

select is(
  (
    select coalesce(sum(l.xp_delta), 0)::integer
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
  ),
  0,
  'soft_delete_goal recomputes XP to a zero balance'
);

select * from finish();
rollback;
