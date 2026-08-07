alter table public.execution_plan_items
add column if not exists scheduled_time_override text;

alter table public.execution_plan_items
add column if not exists effective_scheduled_local_time text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'execution_plan_items_scheduled_time_override_format'
      and conrelid = 'public.execution_plan_items'::regclass
  ) then
    alter table public.execution_plan_items
    add constraint execution_plan_items_scheduled_time_override_format check (
      scheduled_time_override is null
      or scheduled_time_override ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    );
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'execution_plan_items_effective_scheduled_local_time_format'
      and conrelid = 'public.execution_plan_items'::regclass
  ) then
    alter table public.execution_plan_items
    add constraint execution_plan_items_effective_scheduled_local_time_format check (
      effective_scheduled_local_time is null
      or effective_scheduled_local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    );
  end if;
end;
$$;

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

  if not v_replayed then
    with item_rows as (
      select *
      from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as rows(
        goal_id uuid,
        unit_key text,
        scheduled_time_override text,
        effective_scheduled_local_time text
      )
    ),
    goal_map as (
      select id as plan_goal_id, goal_id
      from public.execution_plan_goals
      where public.execution_plan_goals.plan_id = v_plan_id
        and public.execution_plan_goals.owner_id = p_owner
    ),
    mapped_item_times as (
      select
        goal_map.plan_goal_id,
        item_rows.unit_key,
        nullif(item_rows.scheduled_time_override, '') as scheduled_time_override,
        nullif(item_rows.effective_scheduled_local_time, '') as effective_scheduled_local_time
      from item_rows
      join goal_map
        on goal_map.goal_id = item_rows.goal_id
    )
    update public.execution_plan_items as item
    set
      scheduled_time_override = mapped_item_times.scheduled_time_override,
      effective_scheduled_local_time = mapped_item_times.effective_scheduled_local_time
    from mapped_item_times
    where item.plan_id = v_plan_id
      and item.owner_id = p_owner
      and item.plan_goal_id = mapped_item_times.plan_goal_id
      and item.unit_key = mapped_item_times.unit_key;
  end if;

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
