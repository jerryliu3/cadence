alter table private.planner_coach_conversation_messages
add column if not exists proposal_meta jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_coach_conversation_messages_proposal_meta_object'
      and conrelid = 'private.planner_coach_conversation_messages'::regclass
  ) then
    alter table private.planner_coach_conversation_messages
    add constraint planner_coach_conversation_messages_proposal_meta_object check (
      proposal_meta is null or jsonb_typeof(proposal_meta) = 'object'
    );
  end if;
end;
$$;

drop function if exists private.save_planner_coach_conversation(
  uuid,
  text,
  text,
  jsonb,
  text
);
drop function if exists private.get_planner_coach_conversation(
  uuid,
  uuid
);

create or replace function private.save_planner_coach_conversation(
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
  v_conversation private.planner_coach_conversations%rowtype;
  v_message_record record;
  v_role text;
  v_content text;
  v_proposal jsonb;
  v_unresolved_question text;
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
    v_title := 'Conversation';
  end if;

  select nullif(
    pg_catalog.left(pg_catalog.btrim(message.value->>'content'), 180),
    ''
  )
  into v_preview
  from jsonb_array_elements(p_messages) with ordinality as message(value, ordinality)
  order by message.ordinality
  limit 1;
  if v_preview is null then
    v_preview := v_title;
  end if;

  insert into private.planner_coach_conversations (
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
    select
      message.value,
      message.ordinality
    from jsonb_array_elements(p_messages) with ordinality as message(value, ordinality)
    order by message.ordinality
  loop
    v_role := coalesce(v_message_record.value->>'role', '');
    if v_role not in ('user', 'assistant') then
      raise exception using
        errcode = '22023',
        message = 'invalid coach conversation role';
    end if;

    v_content := pg_catalog.btrim(coalesce(v_message_record.value->>'content', ''));
    if pg_catalog.char_length(v_content) < 1 or pg_catalog.char_length(v_content) > 12000 then
      raise exception using
        errcode = '22023',
        message = 'invalid coach conversation message content';
    end if;

    v_proposal := nullif(v_message_record.value->'proposal', 'null'::jsonb);
    if v_proposal is not null then
      if v_role <> 'assistant' then
        raise exception using
          errcode = '22023',
          message = 'coach proposal metadata requires assistant role';
      end if;
      if jsonb_typeof(v_proposal) <> 'object' then
        raise exception using
          errcode = '22023',
          message = 'invalid coach proposal metadata';
      end if;
      if coalesce(v_proposal->>'schemaVersion', '') <> '1' then
        raise exception using
          errcode = '22023',
          message = 'invalid coach proposal schema version';
      end if;
      if coalesce(v_proposal->>'applyStatus', '') not in (
        'not_applied',
        'auto_applied',
        'manually_applied',
        'undone'
      ) then
        raise exception using
          errcode = '22023',
          message = 'invalid coach proposal apply status';
      end if;
      if coalesce(v_proposal->>'patchSignature', '') !~ '^[0-9a-f]{64}$' then
        raise exception using
          errcode = '22023',
          message = 'invalid coach proposal signature';
      end if;
      if pg_catalog.char_length(coalesce(v_proposal->>'baselineSnapshotToken', '')) < 16
        or pg_catalog.char_length(coalesce(v_proposal->>'baselineSnapshotToken', '')) > 128 then
        raise exception using
          errcode = '22023',
          message = 'invalid coach baseline snapshot token';
      end if;
      if not (v_proposal ? 'baselinePolicy') then
        raise exception using
          errcode = '22023',
          message = 'coach baseline policy reference is required';
      end if;
      if v_proposal->'baselinePolicy' <> 'null'::jsonb
        and jsonb_typeof(v_proposal->'baselinePolicy') <> 'object' then
        raise exception using
          errcode = '22023',
          message = 'invalid coach baseline policy snapshot';
      end if;
      if jsonb_typeof(v_proposal->'policyPatches') <> 'array' then
        raise exception using
          errcode = '22023',
          message = 'invalid coach proposal patches';
      end if;
      if jsonb_array_length(v_proposal->'policyPatches') < 1
        or jsonb_array_length(v_proposal->'policyPatches') > 50 then
        raise exception using
          errcode = '22023',
          message = 'invalid coach proposal patch count';
      end if;
      if jsonb_typeof(coalesce(v_proposal->'unresolvedQuestions', '[]'::jsonb)) <> 'array' then
        raise exception using
          errcode = '22023',
          message = 'invalid coach proposal unresolved questions';
      end if;
      if jsonb_array_length(coalesce(v_proposal->'unresolvedQuestions', '[]'::jsonb)) > 20 then
        raise exception using
          errcode = '22023',
          message = 'coach proposal unresolved questions exceed limit';
      end if;
      for v_unresolved_question in
        select value
        from jsonb_array_elements_text(coalesce(v_proposal->'unresolvedQuestions', '[]'::jsonb))
      loop
        if pg_catalog.char_length(pg_catalog.btrim(v_unresolved_question)) < 1
          or pg_catalog.char_length(v_unresolved_question) > 500 then
          raise exception using
            errcode = '22023',
            message = 'invalid coach proposal unresolved question';
        end if;
      end loop;

      v_proposal := jsonb_build_object(
        'schemaVersion', '1',
        'applyStatus', v_proposal->>'applyStatus',
        'patchSignature', pg_catalog.lower(v_proposal->>'patchSignature'),
        'baselineSnapshotToken', v_proposal->>'baselineSnapshotToken',
        'baselinePolicy', coalesce(v_proposal->'baselinePolicy', 'null'::jsonb),
        'policyPatches', v_proposal->'policyPatches',
        'unresolvedQuestions', coalesce(v_proposal->'unresolvedQuestions', '[]'::jsonb)
      );
    end if;

    insert into private.planner_coach_conversation_messages (
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

create or replace function private.get_planner_coach_conversation(
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
  from private.planner_coach_conversations conversation
  join private.planner_coach_conversation_messages message
    on message.conversation_id = conversation.id
  where conversation.owner_id = p_owner
    and conversation.id = p_conversation_id
  order by message.ordinal;
end;
$$;

drop function if exists public.save_planner_coach_conversation_service(
  uuid,
  text,
  text,
  jsonb,
  text
);
drop function if exists public.get_planner_coach_conversation_service(
  uuid,
  uuid
);

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
language sql
security definer
set search_path = ''
as $$
  select *
  from private.save_planner_coach_conversation(
    p_owner,
    p_scope_month,
    p_timezone,
    p_messages,
    p_title
  );
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
language sql
security definer
set search_path = ''
as $$
  select *
  from private.get_planner_coach_conversation(
    p_owner,
    p_conversation_id
  );
$$;

revoke execute on function private.save_planner_coach_conversation(
  uuid,
  text,
  text,
  jsonb,
  text
) from public, anon, authenticated;
revoke execute on function private.get_planner_coach_conversation(
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function private.save_planner_coach_conversation(
  uuid,
  text,
  text,
  jsonb,
  text
) to service_role;
grant execute on function private.get_planner_coach_conversation(
  uuid,
  uuid
) to service_role;

revoke execute on function public.save_planner_coach_conversation_service(
  uuid,
  text,
  text,
  jsonb,
  text
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
grant execute on function public.get_planner_coach_conversation_service(
  uuid,
  uuid
) to service_role;
