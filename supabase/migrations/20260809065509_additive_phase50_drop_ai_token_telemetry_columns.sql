-- Additive Phase 50:
-- - Remove dead AI token telemetry columns and output-token RPC.
-- - Simplify consume_planner_ai_quota to request-count accounting only.

drop function if exists public.record_planner_ai_output_tokens(
  uuid,
  date,
  text,
  bigint
);

drop function if exists public.consume_planner_ai_quota(
  uuid,
  text,
  integer,
  bigint
);

alter table public.planner_ai_usage_daily
  drop constraint if exists planner_ai_usage_daily_tokens;

alter table public.planner_ai_usage_daily
  drop column if exists input_tokens,
  drop column if exists output_tokens;

create or replace function public.consume_planner_ai_quota(
  p_owner uuid,
  p_feature text,
  p_limit integer default 20
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

  return query
  insert into public.planner_ai_usage_daily (
    owner_id,
    usage_date,
    feature,
    request_count,
    updated_at
  )
  values (
    p_owner,
    v_usage_date,
    p_feature,
    1,
    pg_catalog.now()
  )
  on conflict (owner_id, usage_date, feature) do update
  set request_count =
        public.planner_ai_usage_daily.request_count + 1,
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

revoke execute on function public.consume_planner_ai_quota(
  uuid,
  text,
  integer
) from public;
revoke execute on function public.consume_planner_ai_quota(
  uuid,
  text,
  integer
) from anon;
revoke execute on function public.consume_planner_ai_quota(
  uuid,
  text,
  integer
) from authenticated;

grant execute on function public.consume_planner_ai_quota(
  uuid,
  text,
  integer
) to service_role;
