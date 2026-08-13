begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(33);

-- Pin the five dropped client-PostgREST triggers.
select hasnt_trigger(
  'public',
  'goal_links',
  'validate_goal_link',
  'validate_goal_link trigger is dropped'
);
select hasnt_table(
  'public',
  'goal_participants',
  'goal_participants table is dropped'
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

insert into auth.users (id, email)
values ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2', 'write-boundary-partner@example.com')
on conflict (id) do nothing;
insert into public.profiles (id, username)
values ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2', 'write_boundary_partner')
on conflict (id) do nothing;

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
      null
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

select set_config(
  'request.team_id',
  public.create_team_invite_service('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2', null)::text,
  true
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2', true);
select ok(
  public.accept_team_invite_service(current_setting('request.team_id')::uuid, true),
  'partner accepts team invite for team-goal writes'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select lives_ok(
  $$
    select public.create_goal(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      'Team boundary goal',
      null,
      null,
      'health',
      'health',
      '#0ea5e9',
      'recurring',
      'weekly',
      null,
      null,
      current_date,
      null,
      null,
      current_setting('request.team_id')::uuid
    )
  $$,
  'create_goal accepts p_team_id for a team the owner belongs to'
);

select is(
  (
    select team_id
    from public.goals
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
  ),
  current_setting('request.team_id')::uuid,
  'create_goal stores team_id'
);

select throws_ok(
  $$
    select public.replace_goal_source_link(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
    )
  $$,
  '23514',
  'team goals cannot participate in personal goal links',
  'team-goal link is rejected'
);

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select throws_ok(
  $$
    select public.create_goal(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa30',
      'Outsider team goal',
      null,
      null,
      'health',
      'health',
      '#0ea5e9',
      'recurring',
      'weekly',
      null,
      null,
      current_date,
      null,
      null,
      current_setting('request.team_id')::uuid
    )
  $$,
  '42501',
  'not a member of team',
  'non-members cannot create a team goal'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

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
  null
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

-- XP recompute on archive (most common user path).
select public.create_goal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
  'XP archive goal',
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
  null
);

select public.mark_goal_complete(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
  current_date
);

select ok(
  (
    select coalesce(sum(l.xp_delta), 0)
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
  ) > 0,
  'completion accrues XP before archive'
);

select public.set_goal_archived(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
  true
);

select ok(
  (
    select archived_at is not null
    from public.goals
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
  ),
  'set_goal_archived stamps archived_at'
);

select ok(
  (
    select coalesce(sum(l.xp_delta), 0)
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
  ) > 0,
  'archive recomputes without wiping already-credited XP'
);

select ok(
  position(
    'RECOMPUTE_XP_FOR_GOAL_USERS'
    in upper(pg_get_functiondef('public.set_goal_archived(uuid, boolean)'::regprocedure))
  ) > 0,
  'set_goal_archived definition includes explicit xp recompute call'
);

-- XP recompute on target_count change via update_goal.
select public.create_goal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
  'XP target change goal',
  null,
  null,
  'health',
  'health',
  '#10b981',
  'fixed_milestones',
  null,
  1,
  null,
  current_date - 7,
  current_date + 30,
  null,
  null
);

select public.mark_goal_complete(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
  current_date
);

select is(
  (
    select coalesce(sum(l.xp_delta), 0)::integer
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
  ),
  120,
  'hitting target_count=1 accrues unit XP (20) plus achievement (100)'
);

select public.update_goal(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
  'XP target change goal',
  null,
  null,
  'health',
  'health',
  '#10b981',
  'fixed_milestones',
  null,
  10,
  null,
  current_date - 7,
  current_date + 30,
  null,
  null
);

select is(
  (
    select coalesce(sum(l.xp_delta), 0)::integer
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
  ),
  20,
  'update_goal target_count change recomputes and drops achievement XP'
);

reset role;
set local role service_role;
insert into public.goal_shares (goal_id, shared_with)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '33333333-3333-4333-8333-333333333333'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select ok(
  public.can_view_goal(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '33333333-3333-4333-8333-333333333333'
  ),
  'sharee can view a shared personal goal'
);

select public.update_goal(
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
  null,
  true
);

select is(
  (
    select count(*)::integer
    from public.goal_shares
    where goal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  0,
  'marking a goal private revokes its shares'
);

select ok(
  not public.can_view_goal(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '33333333-3333-4333-8333-333333333333'
  ),
  'former sharee cannot view after privacy revoke'
);

select throws_ok(
  $$
    insert into public.goal_shares (goal_id, shared_with)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '33333333-3333-4333-8333-333333333333'
    )
  $$,
  '42501',
  null,
  'sharing a private goal is rejected'
);

reset role;
set local role service_role;
insert into public.goal_shares (goal_id, shared_with)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '33333333-3333-4333-8333-333333333333'
);
reset role;

select ok(
  not public.can_view_goal(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '33333333-3333-4333-8333-333333333333'
  ),
  'a leftover share on a private goal does not grant view'
);

select * from finish();
rollback;
