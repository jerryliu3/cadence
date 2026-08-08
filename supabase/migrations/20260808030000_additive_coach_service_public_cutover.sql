-- Additive Phase 6:
-- Move coach service wrappers to public persistence tables.

create or replace function public.save_planner_coach_conversation_service(
  p_owner uuid,
  p_scope_month text,
  p_timezone text,
  p_messages jsonb,
  p_title text default null
)
returns table (
  conversation_id uuid,
  scope_month text,
  timezone text,
  title text,
  preview_text text,
  message_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_count integer;
  v_title text;
  v_preview text;
  v_conversation public.planner_coach_conversations%rowtype;
  v_message_record record;
  v_role text;
  v_content text;
  v_proposal jsonb;
begin
  if p_owner is null then
    raise exception using
      errcode = '22023',
      message = 'conversation owner is required';
  end if;
  if p_scope_month is null or p_scope_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception using
      errcode = '22023',
      message = 'invalid coach conversation scope month';
  end if;
  if p_timezone is null
    or pg_catalog.char_length(pg_catalog.btrim(p_timezone)) = 0
    or pg_catalog.char_length(pg_catalog.btrim(p_timezone)) > 100 then
    raise exception using
      errcode = '22023',
      message = 'invalid coach conversation timezone';
  end if;
  if p_messages is null or jsonb_typeof(p_messages) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'coach conversation messages must be an array';
  end if;

  v_message_count := jsonb_array_length(p_messages);
  if v_message_count < 1 or v_message_count > 20 then
    raise exception using
      errcode = '22023',
      message = 'coach conversation message count must be between 1 and 20';
  end if;

  v_title := nullif(pg_catalog.btrim(p_title), '');
  if v_title is not null and pg_catalog.char_length(v_title) > 120 then
    raise exception using
      errcode = '22023',
      message = 'coach conversation title exceeds maximum length';
  end if;
  if v_title is null then
    select nullif(
      pg_catalog.left(pg_catalog.btrim(message.value->>'content'), 120),
      ''
    )
    into v_title
    from jsonb_array_elements(p_messages) with ordinality as message(value, ordinality)
    where coalesce(message.value->>'role', '') = 'user'
    order by message.ordinality
    limit 1;
  end if;
  if v_title is null then
    select nullif(
      pg_catalog.left(pg_catalog.btrim(message.value->>'content'), 120),
      ''
    )
    into v_title
    from jsonb_array_elements(p_messages) with ordinality as message(value, ordinality)
    order by message.ordinality
    limit 1;
  end if;
  if v_title is null then
    raise exception using
      errcode = '22023',
      message = 'coach conversation title cannot be empty';
  end if;

  select nullif(
    pg_catalog.left(pg_catalog.btrim(message.value->>'content'), 180),
    ''
  )
  into v_preview
  from jsonb_array_elements(p_messages) with ordinality as message(value, ordinality)
  where coalesce(message.value->>'role', '') = 'assistant'
  order by message.ordinality desc
  limit 1;
  if v_preview is null then
    v_preview := v_title;
  end if;

  insert into public.planner_coach_conversations (
    owner_id,
    scope_month,
    timezone,
    title,
    preview_text,
    message_count
  )
  values (
    p_owner,
    p_scope_month,
    pg_catalog.btrim(p_timezone),
    v_title,
    v_preview,
    v_message_count
  )
  returning * into v_conversation;

  for v_message_record in
    select value, ordinality
    from jsonb_array_elements(p_messages) with ordinality
    order by ordinality
  loop
    v_role := pg_catalog.lower(pg_catalog.btrim(coalesce(v_message_record.value->>'role', '')));
    v_content := pg_catalog.btrim(coalesce(v_message_record.value->>'content', ''));
    if v_role not in ('user', 'assistant') then
      raise exception using
        errcode = '22023',
        message = 'invalid coach message role';
    end if;
    if pg_catalog.char_length(v_content) < 1 or pg_catalog.char_length(v_content) > 12000 then
      raise exception using
        errcode = '22023',
        message = 'invalid coach message content';
    end if;

    v_proposal := null;
    if v_role = 'assistant' then
      if not (v_message_record.value ? 'proposal') or v_message_record.value->'proposal' is null then
        v_proposal := null;
      elsif jsonb_typeof(v_message_record.value->'proposal') = 'object' then
        v_proposal := v_message_record.value->'proposal';
      else
        raise exception using
          errcode = '22023',
          message = 'invalid coach proposal payload';
      end if;
    end if;

    insert into public.planner_coach_conversation_messages (
      conversation_id,
      owner_id,
      ordinal,
      role,
      content,
      proposal_meta
    )
    values (
      v_conversation.id,
      p_owner,
      v_message_record.ordinality::integer,
      v_role,
      v_content,
      v_proposal
    );
  end loop;

  return query
  select
    v_conversation.id,
    v_conversation.scope_month,
    v_conversation.timezone,
    v_conversation.title,
    v_conversation.preview_text,
    v_conversation.message_count,
    v_conversation.created_at,
    v_conversation.updated_at;
end;
$$;

create or replace function public.list_planner_coach_conversations_service(
  p_owner uuid,
  p_scope_month text default null,
  p_limit integer default 20
)
returns table (
  conversation_id uuid,
  scope_month text,
  timezone text,
  title text,
  preview_text text,
  message_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if p_owner is null then
    raise exception using
      errcode = '22023',
      message = 'conversation owner is required';
  end if;
  if p_scope_month is not null and p_scope_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception using
      errcode = '22023',
      message = 'invalid coach conversation scope month';
  end if;

  return query
  select
    conversation.id,
    conversation.scope_month,
    conversation.timezone,
    conversation.title,
    conversation.preview_text,
    conversation.message_count,
    conversation.created_at,
    conversation.updated_at
  from public.planner_coach_conversations conversation
  where conversation.owner_id = p_owner
    and (p_scope_month is null or conversation.scope_month = p_scope_month)
  order by conversation.updated_at desc
  limit v_limit;
end;
$$;

create or replace function public.get_planner_coach_conversation_service(
  p_owner uuid,
  p_conversation_id uuid
)
returns table (
  conversation_id uuid,
  scope_month text,
  timezone text,
  title text,
  preview_text text,
  message_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  message_ordinal integer,
  message_role text,
  message_content text,
  message_created_at timestamptz,
  message_proposal_meta jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner is null then
    raise exception using
      errcode = '22023',
      message = 'conversation owner is required';
  end if;
  if p_conversation_id is null then
    raise exception using
      errcode = '22023',
      message = 'conversation id is required';
  end if;

  return query
  select
    conversation.id,
    conversation.scope_month,
    conversation.timezone,
    conversation.title,
    conversation.preview_text,
    conversation.message_count,
    conversation.created_at,
    conversation.updated_at,
    message.ordinal,
    message.role,
    message.content,
    message.created_at,
    message.proposal_meta
  from public.planner_coach_conversations conversation
  join public.planner_coach_conversation_messages message
    on message.conversation_id = conversation.id
  where conversation.owner_id = p_owner
    and conversation.id = p_conversation_id
  order by message.ordinal;
end;
$$;

revoke execute on function public.save_planner_coach_conversation_service(
  uuid,
  text,
  text,
  jsonb,
  text
) from public, anon, authenticated, service_role;
revoke execute on function public.list_planner_coach_conversations_service(
  uuid,
  text,
  integer
) from public, anon, authenticated, service_role;
revoke execute on function public.get_planner_coach_conversation_service(
  uuid,
  uuid
) from public, anon, authenticated, service_role;

grant execute on function public.save_planner_coach_conversation_service(
  uuid,
  text,
  text,
  jsonb,
  text
) to service_role;
grant execute on function public.list_planner_coach_conversations_service(
  uuid,
  text,
  integer
) to service_role;
grant execute on function public.get_planner_coach_conversation_service(
  uuid,
  uuid
) to service_role;
