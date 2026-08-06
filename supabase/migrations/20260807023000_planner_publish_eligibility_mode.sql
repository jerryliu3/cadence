create or replace function private.apply_publish_eligibility_mode_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
begin
  v_mode := pg_catalog.current_setting(
    'app.publish_eligibility_mode_override',
    true
  );
  if v_mode is null or v_mode = '' then
    return new;
  end if;
  if v_mode not in ('end_month_v1', 'overlap_v1') then
    raise exception using
      errcode = '22023',
      message = 'invalid eligibility mode';
  end if;
  new.eligibility_mode := v_mode;
  return new;
end;
$$;

drop trigger if exists execution_plan_publish_eligibility_mode_override
on public.execution_plans;

create trigger execution_plan_publish_eligibility_mode_override
before insert on public.execution_plans
for each row
execute function private.apply_publish_eligibility_mode_override();

create or replace function public.publish_execution_plan_service(
  p_owner uuid,
  p_scope_month date,
  p_eligibility_mode text,
  p_timezone text,
  p_generation_source text,
  p_change_summary jsonb,
  p_policy_snapshot jsonb,
  p_generation_input_hash text,
  p_contract_version text,
  p_scheduler_version text,
  p_requirement_schema_version text,
  p_assessment_schema_version text,
  p_policy_schema_version text,
  p_policy_compiler_version text,
  p_placement_status text,
  p_search_status text,
  p_capacity_status text,
  p_confirmation_required boolean,
  p_publishable boolean,
  p_idempotency_key uuid,
  p_request_digest text,
  p_expected_canonical_revision bigint,
  p_expected_execution_revision bigint,
  p_expected_base_plan_id uuid,
  p_expected_base_plan_version integer,
  p_goals jsonb,
  p_days jsonb,
  p_items jsonb,
  p_issues jsonb
)
returns table (
  plan_id uuid,
  version integer,
  replayed boolean,
  is_currently_active boolean,
  current_active_plan_id uuid,
  execution_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_plan_id uuid;
  v_version integer;
  v_replayed boolean;
  v_is_currently_active boolean;
  v_current_active_plan_id uuid;
  v_execution_revision bigint;
begin
  v_mode := coalesce(p_eligibility_mode, 'end_month_v1');
  if v_mode not in ('end_month_v1', 'overlap_v1') then
    raise exception using
      errcode = '22023',
      message = 'invalid eligibility mode';
  end if;
  perform pg_catalog.set_config(
    'app.publish_eligibility_mode_override',
    v_mode,
    true
  );

  select
    published.plan_id,
    published.version,
    published.replayed,
    published.is_currently_active,
    published.current_active_plan_id,
    published.execution_revision
  into
    v_plan_id,
    v_version,
    v_replayed,
    v_is_currently_active,
    v_current_active_plan_id,
    v_execution_revision
  from public.publish_execution_plan_service(
    p_owner,
    p_scope_month,
    p_timezone,
    p_generation_source,
    p_change_summary,
    p_policy_snapshot,
    p_generation_input_hash,
    p_contract_version,
    p_scheduler_version,
    p_requirement_schema_version,
    p_assessment_schema_version,
    p_policy_schema_version,
    p_policy_compiler_version,
    p_placement_status,
    p_search_status,
    p_capacity_status,
    p_confirmation_required,
    p_publishable,
    p_idempotency_key,
    p_request_digest,
    p_expected_canonical_revision,
    p_expected_execution_revision,
    p_expected_base_plan_id,
    p_expected_base_plan_version,
    p_goals,
    p_days,
    p_items,
    p_issues
  ) as published;
  perform pg_catalog.set_config(
    'app.publish_eligibility_mode_override',
    '',
    true
  );

  if v_plan_id is null then
    raise exception using
      errcode = '55000',
      message = 'publish service did not return a plan id';
  end if;

  plan_id := v_plan_id;
  version := v_version;
  replayed := v_replayed;
  is_currently_active := v_is_currently_active;
  current_active_plan_id := v_current_active_plan_id;
  execution_revision := v_execution_revision;
  return next;
end;
$$;

revoke execute on function public.publish_execution_plan_service(
  uuid,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  uuid,
  text,
  bigint,
  bigint,
  uuid,
  integer,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.publish_execution_plan_service(
  uuid,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  uuid,
  text,
  bigint,
  bigint,
  uuid,
  integer,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) to service_role;
