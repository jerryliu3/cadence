begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(5);

do $$
declare
  v_owner constant uuid := '11111111-1111-4111-8111-111111111111';
begin
  insert into auth.users (id, email)
  values (v_owner, 'coach-atomic@example.com')
  on conflict (id) do nothing;
  insert into public.profiles (id, username)
  values (
    v_owner,
    'coach_atomic_' || pg_catalog.replace(v_owner::text, '-', '')
  )
  on conflict (id) do nothing;

  delete from public.planner_coach_conversation_messages
  where owner_id = v_owner
    and conversation_id in (
      select id
      from public.planner_coach_conversations
      where owner_id = v_owner
        and scope_month in ('2099-10', '2099-11')
    );
  delete from public.planner_coach_conversations
  where owner_id = v_owner
    and scope_month in ('2099-10', '2099-11');
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select *
    from public.save_planner_coach_conversation_service(
      '2099-11',
      'UTC',
      'Atomic coach save',
      'Sure, here is an updated schedule.',
      jsonb_build_array(
        jsonb_build_object(
          'role',
          'user',
          'content',
          'Help me improve next week.'
        ),
        jsonb_build_object(
          'role',
          'assistant',
          'content',
          'Sure, here is an updated schedule.',
          'proposal',
          jsonb_build_object('applyStatus', 'not_applied')
        )
      )
    )
  $$,
  'rpc persists conversation and messages in one call'
);

select is(
  (
    select count(*)::integer
    from public.planner_coach_conversations
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and scope_month = '2099-11'
  ),
  1,
  'rpc write stores exactly one conversation row'
);

select is(
  (
    select count(*)::integer
    from public.planner_coach_conversation_messages
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and conversation_id = (
        select id
        from public.planner_coach_conversations
        where owner_id = '11111111-1111-4111-8111-111111111111'
          and scope_month = '2099-11'
        limit 1
      )
  ),
  2,
  'rpc write stores all message rows'
);

select throws_ok(
  $$
    select *
    from public.save_planner_coach_conversation_service(
      '2099-10',
      'UTC',
      'Atomic rollback',
      'This should fail.',
      jsonb_build_array(
        jsonb_build_object(
          'role',
          'system',
          'content',
          'Invalid role for table constraint'
        )
      )
    )
  $$,
  '23514',
  'new row for relation "planner_coach_conversation_messages" violates check constraint "planner_coach_conversation_messages_role"',
  'invalid message rows fail inside the rpc transaction'
);

select is(
  (
    select count(*)::integer
    from public.planner_coach_conversations
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and scope_month = '2099-10'
  ),
  0,
  'failed message insert rolls back the conversation row'
);

reset role;
select * from finish();
rollback;
