-- Additive Phase 1 (part C):
-- Add public AI quota and coach persistence surfaces while retaining legacy private tables.

create table if not exists public.planner_ai_usage_daily (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  feature text not null,
  request_count integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (owner_id, usage_date, feature),
  constraint planner_ai_usage_daily_feature
    check (feature in ('planner_coach', 'bulk_parser')),
  constraint planner_ai_usage_daily_requests
    check (request_count between 0 and 100),
  constraint planner_ai_usage_daily_tokens
    check (
      input_tokens between 0 and 1000000000000
      and output_tokens between 0 and 1000000000000
    )
);

alter table public.planner_ai_usage_daily enable row level security;

create index if not exists planner_ai_usage_daily_date_feature_idx
on public.planner_ai_usage_daily (usage_date, feature);

create or replace function public.consume_planner_ai_quota(
  p_owner uuid,
  p_feature text,
  p_limit integer default 20,
  p_input_tokens bigint default 0
)
returns table (
  quota_usage_date date,
  allowed boolean,
  request_count integer,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_usage_date date := (v_now at time zone 'UTC')::date;
  v_retry_after integer :=
    greatest(
      1,
      pg_catalog.ceil(
        extract(
          epoch from (
            ((v_usage_date + 1)::timestamp) - (v_now at time zone 'UTC')
          )
        )
      )::integer
    );
begin
  if p_owner is null then
    raise exception using
      errcode = '22023',
      message = 'quota owner is required';
  end if;

  if p_feature not in ('planner_coach', 'bulk_parser') then
    raise exception using
      errcode = '22023',
      message = 'unknown planner AI quota feature';
  end if;

  if p_limit < 1 or p_limit > 100 then
    raise exception using
      errcode = '22023',
      message = 'planner AI quota limit must be between 1 and 100';
  end if;

  if p_input_tokens < 0 or p_input_tokens > 1000000000000 then
    raise exception using
      errcode = '22023',
      message = 'invalid planner AI input token count';
  end if;

  return query
  insert into public.planner_ai_usage_daily (
    owner_id,
    usage_date,
    feature,
    request_count,
    input_tokens,
    output_tokens,
    updated_at
  )
  values (
    p_owner,
    v_usage_date,
    p_feature,
    1,
    p_input_tokens,
    0,
    pg_catalog.now()
  )
  on conflict (owner_id, usage_date, feature) do update
  set request_count =
        public.planner_ai_usage_daily.request_count + 1,
      input_tokens =
        public.planner_ai_usage_daily.input_tokens + excluded.input_tokens,
      updated_at = pg_catalog.now()
  where public.planner_ai_usage_daily.request_count < p_limit
  returning
    public.planner_ai_usage_daily.usage_date,
    true,
    public.planner_ai_usage_daily.request_count,
    p_limit - public.planner_ai_usage_daily.request_count,
    0;

  if found then
    return;
  end if;

  return query
  select
    usage.usage_date,
    false,
    usage.request_count,
    greatest(p_limit - usage.request_count, 0),
    v_retry_after
  from public.planner_ai_usage_daily usage
  where usage.owner_id = p_owner
    and usage.usage_date = v_usage_date
    and usage.feature = p_feature;
end;
$$;

create or replace function public.record_planner_ai_output_tokens(
  p_owner uuid,
  p_usage_date date,
  p_feature text,
  p_output_tokens bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
begin
  if p_owner is null
    or p_usage_date is null
    or p_feature not in ('planner_coach', 'bulk_parser')
    or p_output_tokens < 0
    or p_output_tokens > 1000000000000 then
    raise exception using
      errcode = '22023',
      message = 'invalid planner AI token telemetry';
  end if;

  update public.planner_ai_usage_daily
  set output_tokens = output_tokens + p_output_tokens,
      updated_at = pg_catalog.now()
  where owner_id = p_owner
    and usage_date = p_usage_date
    and feature = p_feature
  returning output_tokens into v_total;

  if v_total is null then
    raise exception using
      errcode = '55000',
      message = 'quota must be consumed before recording output tokens';
  end if;

  return v_total;
end;
$$;

-- Keep service wrappers stable while moving implementation to public schema.
create or replace function public.consume_planner_ai_quota_service(
  p_owner uuid,
  p_feature text,
  p_limit integer default 20,
  p_input_tokens bigint default 0
)
returns table (
  usage_date date,
  allowed boolean,
  request_count integer,
  remaining integer,
  retry_after_seconds integer
)
language sql
security definer
set search_path = ''
as $$
  select
    consumed.quota_usage_date as usage_date,
    consumed.allowed,
    consumed.request_count,
    consumed.remaining,
    consumed.retry_after_seconds
  from public.consume_planner_ai_quota(
    p_owner,
    p_feature,
    p_limit,
    p_input_tokens
  ) as consumed;
$$;

create or replace function public.record_planner_ai_output_tokens_service(
  p_owner uuid,
  p_usage_date date,
  p_feature text,
  p_output_tokens bigint
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select public.record_planner_ai_output_tokens(
    p_owner,
    p_usage_date,
    p_feature,
    p_output_tokens
  );
$$;

revoke all on table public.planner_ai_usage_daily
from public, anon, authenticated, service_role;
grant select on table public.planner_ai_usage_daily to service_role;

revoke execute on function public.consume_planner_ai_quota(
  uuid,
  text,
  integer,
  bigint
) from public, anon, authenticated;
revoke execute on function public.record_planner_ai_output_tokens(
  uuid,
  date,
  text,
  bigint
) from public, anon, authenticated;

grant execute on function public.consume_planner_ai_quota(
  uuid,
  text,
  integer,
  bigint
) to service_role;
grant execute on function public.record_planner_ai_output_tokens(
  uuid,
  date,
  text,
  bigint
) to service_role;

create table if not exists public.planner_coach_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  scope_month text not null,
  timezone text not null,
  title text not null,
  preview_text text not null,
  message_count integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint planner_coach_conversations_scope_month check (
    scope_month ~ '^\d{4}-(0[1-9]|1[0-2])$'
  ),
  constraint planner_coach_conversations_timezone check (
    pg_catalog.char_length(timezone) between 1 and 100
  ),
  constraint planner_coach_conversations_title check (
    pg_catalog.char_length(title) between 1 and 120
  ),
  constraint planner_coach_conversations_preview check (
    pg_catalog.char_length(preview_text) <= 180
  ),
  constraint planner_coach_conversations_message_count check (
    message_count between 1 and 20
  )
);

create table if not exists public.planner_coach_conversation_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null
    references public.planner_coach_conversations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  ordinal integer not null,
  role text not null,
  content text not null,
  proposal_meta jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint planner_coach_conversation_messages_ordinal check (
    ordinal between 1 and 20
  ),
  constraint planner_coach_conversation_messages_role check (
    role in ('user', 'assistant')
  ),
  constraint planner_coach_conversation_messages_content check (
    pg_catalog.char_length(content) between 1 and 12000
  ),
  constraint planner_coach_conversation_messages_unique_ordinal unique (
    conversation_id,
    ordinal
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_coach_conversation_messages_proposal_meta_object'
      and conrelid = 'public.planner_coach_conversation_messages'::regclass
  ) then
    alter table public.planner_coach_conversation_messages
    add constraint planner_coach_conversation_messages_proposal_meta_object check (
      proposal_meta is null or jsonb_typeof(proposal_meta) = 'object'
    );
  end if;
end;
$$;

alter table public.planner_coach_conversations enable row level security;
alter table public.planner_coach_conversation_messages enable row level security;

create index if not exists planner_coach_conversations_owner_updated_idx
on public.planner_coach_conversations (owner_id, updated_at desc);

create index if not exists planner_coach_conversations_owner_scope_updated_idx
on public.planner_coach_conversations (owner_id, scope_month, updated_at desc);

create index if not exists planner_coach_conversation_messages_owner_idx
on public.planner_coach_conversation_messages (owner_id, created_at desc);

drop trigger if exists set_planner_coach_conversations_updated_at
on public.planner_coach_conversations;
create trigger set_planner_coach_conversations_updated_at
before update on public.planner_coach_conversations
for each row execute function public.set_updated_at();

drop policy if exists planner_coach_conversations_owner_select
on public.planner_coach_conversations;
create policy planner_coach_conversations_owner_select
on public.planner_coach_conversations
for select
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists planner_coach_conversations_owner_insert
on public.planner_coach_conversations;
create policy planner_coach_conversations_owner_insert
on public.planner_coach_conversations
for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists planner_coach_conversations_owner_update
on public.planner_coach_conversations;
create policy planner_coach_conversations_owner_update
on public.planner_coach_conversations
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists planner_coach_conversations_owner_delete
on public.planner_coach_conversations;
create policy planner_coach_conversations_owner_delete
on public.planner_coach_conversations
for delete
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists planner_coach_messages_owner_select
on public.planner_coach_conversation_messages;
create policy planner_coach_messages_owner_select
on public.planner_coach_conversation_messages
for select
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists planner_coach_messages_owner_insert
on public.planner_coach_conversation_messages;
create policy planner_coach_messages_owner_insert
on public.planner_coach_conversation_messages
for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists planner_coach_messages_owner_update
on public.planner_coach_conversation_messages;
create policy planner_coach_messages_owner_update
on public.planner_coach_conversation_messages
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists planner_coach_messages_owner_delete
on public.planner_coach_conversation_messages;
create policy planner_coach_messages_owner_delete
on public.planner_coach_conversation_messages
for delete
to authenticated
using (owner_id = (select auth.uid()));
