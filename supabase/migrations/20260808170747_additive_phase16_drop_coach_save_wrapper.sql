-- Additive Phase 16:
-- Keep coach conversation saves atomic with a single RPC write boundary.
-- Planner item move route is deleted in favor of schedule-based flows.

drop function if exists public.save_planner_coach_conversation_service(
  uuid,
  text,
  text,
  jsonb,
  text
);

drop function if exists public.save_planner_coach_conversation_service(
  text,
  text,
  text,
  text,
  jsonb
);

drop function if exists public.move_execution_plan_item_service(
  uuid,
  uuid,
  date,
  bigint,
  bigint,
  bigint
);

create or replace function public.save_planner_coach_conversation_service(
  p_scope_month text,
  p_timezone text,
  p_title text,
  p_preview_text text,
  p_messages jsonb
)
returns table (
  id uuid,
  scope_month text,
  timezone text,
  title text,
  preview_text text,
  message_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_conversation public.planner_coach_conversations%rowtype;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_messages is null or pg_catalog.jsonb_typeof(p_messages) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'coach conversation messages must be an array';
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
    v_owner,
    p_scope_month,
    p_timezone,
    p_title,
    p_preview_text,
    pg_catalog.jsonb_array_length(p_messages)
  )
  returning * into v_conversation;

  insert into public.planner_coach_conversation_messages (
    conversation_id,
    owner_id,
    ordinal,
    role,
    content,
    proposal_meta
  )
  select
    v_conversation.id,
    v_owner,
    message.ordinality::integer,
    message.value->>'role',
    message.value->>'content',
    case
      when message.value->>'role' = 'assistant'
        then message.value->'proposal'
      else null
    end
  from pg_catalog.jsonb_array_elements(p_messages) with ordinality as message(value, ordinality);

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

revoke execute on function public.save_planner_coach_conversation_service(
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.save_planner_coach_conversation_service(
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;
