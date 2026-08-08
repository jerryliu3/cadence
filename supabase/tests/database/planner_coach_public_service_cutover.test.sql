begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(5);

do $$
declare
  v_owner constant uuid := '11111111-1111-4111-8111-111111111111';
  v_scope constant text := '2099-12';
begin
  insert into auth.users (id, email)
  values (v_owner, 'coach-cutover@example.com')
  on conflict (id) do nothing;
  insert into public.profiles (id, username)
  values (
    v_owner,
    'coach_cutover_' || pg_catalog.replace(v_owner::text, '-', '')
  )
  on conflict (id) do nothing;

  delete from public.planner_coach_conversation_messages
  where owner_id = v_owner;
  delete from public.planner_coach_conversations
  where owner_id = v_owner and scope_month = v_scope;
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
    insert into public.planner_coach_conversations (
      owner_id,
      scope_month,
      timezone,
      title,
      preview_text,
      message_count
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      '2099-12',
      'UTC',
      'Spacing help',
      'Yes. I suggest moving one unit to the weekend.',
      2
    )
  $$,
  'authenticated owners can insert coach conversations directly'
);

select lives_ok(
  $$
    insert into public.planner_coach_conversation_messages (
      conversation_id,
      owner_id,
      ordinal,
      role,
      content,
      proposal_meta
    )
    values
      (
        (
          select id
          from public.planner_coach_conversations
          where owner_id = '11111111-1111-4111-8111-111111111111'
            and scope_month = '2099-12'
          limit 1
        ),
        '11111111-1111-4111-8111-111111111111',
        1,
        'user',
        'Can you help me improve spacing?',
        null
      ),
      (
        (
          select id
          from public.planner_coach_conversations
          where owner_id = '11111111-1111-4111-8111-111111111111'
            and scope_month = '2099-12'
          limit 1
        ),
        '11111111-1111-4111-8111-111111111111',
        2,
        'assistant',
        'Yes. I suggest moving one unit to the weekend.',
        '{"example": true}'::jsonb
      )
  $$,
  'authenticated owners can insert coach conversation messages directly'
);

select is(
  (
    select count(*)::integer
    from public.planner_coach_conversations
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and scope_month = '2099-12'
  ),
  1,
  'direct writes persist conversations to the public table'
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
          and scope_month = '2099-12'
        limit 1
      )
  ),
  2,
  'direct writes persist messages to the public table'
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
          and scope_month = '2099-12'
        limit 1
      )
      and proposal_meta is not null
  ),
  1,
  'proposal metadata persists on public coach messages'
);

reset role;
select * from finish();
rollback;
