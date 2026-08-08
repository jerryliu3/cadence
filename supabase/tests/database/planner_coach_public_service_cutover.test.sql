begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(4);

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

set local role service_role;

select is(
  (
    with saved as (
      select *
      from public.save_planner_coach_conversation_service(
        '11111111-1111-4111-8111-111111111111',
        '2099-12',
        'UTC',
        jsonb_build_array(
          jsonb_build_object(
            'role', 'user',
            'content', 'Can you help me improve spacing?'
          ),
          jsonb_build_object(
            'role', 'assistant',
            'content', 'Yes. I suggest moving one unit to the weekend.',
            'proposal', jsonb_build_object('example', true)
          )
        ),
        'Spacing help'
      )
    )
    select count(*)::integer
    from saved
  ),
  1,
  'save service returns one conversation summary row'
);

select is(
  (
    select count(*)::integer
    from public.planner_coach_conversations
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and scope_month = '2099-12'
  ),
  1,
  'save service writes conversation to public table'
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
  'save service writes messages to public table'
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
