create table private.planner_ai_usage_daily (
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

alter table private.planner_ai_usage_daily enable row level security;

create index planner_ai_usage_daily_date_feature_idx
on private.planner_ai_usage_daily (usage_date, feature);

create or replace function private.consume_planner_ai_quota(
  p_owner uuid,
  p_feature text,
  p_limit integer default 20,
  p_input_tokens bigint default 0
)
returns table (
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
  v_usage_date date :=
    (pg_catalog.clock_timestamp() at time zone 'UTC')::date;
  v_retry_after integer :=
    greatest(
      1,
      pg_catalog.ceil(
        extract(
          epoch from (
            (
              (pg_catalog.clock_timestamp() at time zone 'UTC')::date + 1
            )::timestamp
            - (pg_catalog.clock_timestamp() at time zone 'UTC')
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
  insert into private.planner_ai_usage_daily (
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
        private.planner_ai_usage_daily.request_count + 1,
      input_tokens =
        private.planner_ai_usage_daily.input_tokens
        + excluded.input_tokens,
      updated_at = pg_catalog.now()
  where private.planner_ai_usage_daily.request_count < p_limit
  returning
    true,
    private.planner_ai_usage_daily.request_count,
    p_limit - private.planner_ai_usage_daily.request_count,
    0;

  if found then
    return;
  end if;

  return query
  select
    false,
    usage.request_count,
    greatest(p_limit - usage.request_count, 0),
    v_retry_after
  from private.planner_ai_usage_daily usage
  where usage.owner_id = p_owner
    and usage.usage_date = v_usage_date
    and usage.feature = p_feature;
end;
$$;

create or replace function private.record_planner_ai_output_tokens(
  p_owner uuid,
  p_feature text,
  p_output_tokens bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_date date :=
    (pg_catalog.clock_timestamp() at time zone 'UTC')::date;
  v_total bigint;
begin
  if p_owner is null
    or p_feature not in ('planner_coach', 'bulk_parser')
    or p_output_tokens < 0
    or p_output_tokens > 1000000000000 then
    raise exception using
      errcode = '22023',
      message = 'invalid planner AI token telemetry';
  end if;

  update private.planner_ai_usage_daily
  set output_tokens = output_tokens + p_output_tokens,
      updated_at = pg_catalog.now()
  where owner_id = p_owner
    and usage_date = v_usage_date
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

revoke all on table private.planner_ai_usage_daily
from public, anon, authenticated, service_role;
grant select on table private.planner_ai_usage_daily to service_role;

revoke execute on function private.consume_planner_ai_quota(
  uuid,
  text,
  integer,
  bigint
) from public, anon, authenticated;
revoke execute on function private.record_planner_ai_output_tokens(
  uuid,
  text,
  bigint
) from public, anon, authenticated;

grant execute on function private.consume_planner_ai_quota(
  uuid,
  text,
  integer,
  bigint
) to service_role;
grant execute on function private.record_planner_ai_output_tokens(
  uuid,
  text,
  bigint
) to service_role;
