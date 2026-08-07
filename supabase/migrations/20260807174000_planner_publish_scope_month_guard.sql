-- Guard elapsed-month publishes in the base (28-arg) publish RPC so both
-- overloads inherit the same behavior.
create or replace function public.publish_execution_plan_service(
  p_owner uuid,
  p_scope_month date,
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
  v_state private.planner_state;
  v_existing_plan public.execution_plans;
  v_latest_plan public.execution_plans;
  v_replay_plan public.execution_plans;
  v_new_plan_id uuid;
  v_new_version integer;
  v_inserted_items integer;
  v_inserted_issues integer;
  v_execution_revision bigint;
  v_current_scope_month date;
begin
  if p_scope_month is null or extract(day from p_scope_month) <> 1 then
    raise exception using
      errcode = '22023',
      message = 'scope month must be the first day of month';
  end if;

  if p_goals is null or jsonb_typeof(p_goals) <> 'array'
    or p_days is null or jsonb_typeof(p_days) <> 'array'
    or p_items is null or jsonb_typeof(p_items) <> 'array'
    or p_issues is null or jsonb_typeof(p_issues) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'publish payload must contain JSON arrays';
  end if;

  perform pg_advisory_xact_lock(private.planner_owner_lock_key(p_owner));

  select *
  into v_replay_plan
  from public.execution_plans
  where owner_id = p_owner
    and idempotency_key = p_idempotency_key;

  if v_replay_plan.id is not null then
    if v_replay_plan.request_digest <> p_request_digest then
      raise exception using
        errcode = '23514',
        message = 'idempotency digest mismatch';
    end if;

    select state.execution_revision
    into v_execution_revision
    from private.planner_state state
    where state.owner_id = p_owner;

    return query
    select
      v_replay_plan.id,
      v_replay_plan.version,
      true,
      v_replay_plan.status = 'active',
      (
        select active.id
        from public.execution_plans active
        where active.owner_id = p_owner
          and active.scope_month = p_scope_month
          and active.status = 'active'
        limit 1
      ),
      v_execution_revision;
    return;
  end if;

  v_current_scope_month := date_trunc(
    'month',
    private.local_today_for_timezone(p_timezone)
  )::date;
  if p_scope_month < v_current_scope_month then
    raise exception using
      errcode = '23514',
      message = 'elapsed_scope_month_publish_forbidden';
  end if;

  v_state := private.require_planner_state_revisions(
    p_owner,
    p_expected_canonical_revision,
    p_expected_execution_revision
  );

  select *
  into v_existing_plan
  from public.execution_plans
  where owner_id = p_owner
    and scope_month = p_scope_month
    and status = 'active'
  for update;

  select *
  into v_latest_plan
  from public.execution_plans
  where owner_id = p_owner
    and scope_month = p_scope_month
  order by version desc
  limit 1
  for update;

  if p_expected_base_plan_id is null then
    if v_existing_plan.id is not null then
      raise exception using
        errcode = '40001',
        message = 'base plan mismatch';
    end if;
  else
    if v_existing_plan.id is null
      or v_existing_plan.id <> p_expected_base_plan_id
      or v_existing_plan.version <> p_expected_base_plan_version then
      raise exception using
        errcode = '40001',
        message = 'base plan mismatch';
    end if;
  end if;

  v_new_version := coalesce(v_latest_plan.version, 0) + 1;

  if v_existing_plan.id is not null then
    update public.execution_plans
    set status = 'superseded',
        superseded_at = now()
    where id = v_existing_plan.id;
  end if;

  insert into public.execution_plans (
    owner_id,
    scope_month,
    eligibility_mode,
    timezone,
    version,
    parent_plan_id,
    status,
    generation_source,
    change_summary,
    policy_snapshot,
    generation_input_hash,
    observed_canonical_revision,
    observed_execution_revision,
    contract_version,
    scheduler_version,
    requirement_schema_version,
    assessment_schema_version,
    policy_schema_version,
    policy_compiler_version,
    placement_status,
    search_status,
    capacity_status,
    confirmation_required,
    publishable,
    idempotency_key,
    request_digest
  )
  values (
    p_owner,
    p_scope_month,
    'end_month_v1',
    p_timezone,
    v_new_version,
    v_latest_plan.id,
    'active',
    p_generation_source,
    p_change_summary,
    p_policy_snapshot,
    p_generation_input_hash,
    v_state.canonical_revision,
    v_state.execution_revision,
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
    p_request_digest
  )
  returning id into v_new_plan_id;

  insert into public.execution_plan_goals (
    plan_id,
    owner_id,
    goal_id,
    title,
    category,
    color,
    start_date,
    end_date,
    requirement_kind,
    requirement_fingerprint,
    requirement_snapshot,
    assessment_snapshot,
    assessment_input_hash,
    admissible_credit_basis,
    generation_summary
  )
  select
    v_new_plan_id,
    p_owner,
    goal_rows.goal_id,
    goal_rows.title,
    goal_rows.category,
    goal_rows.color,
    goal_rows.start_date,
    goal_rows.end_date,
    goal_rows.requirement_kind,
    goal_rows.requirement_fingerprint,
    goal_rows.requirement_snapshot,
    goal_rows.assessment_snapshot,
    goal_rows.assessment_input_hash,
    goal_rows.admissible_credit_basis,
    coalesce(goal_rows.generation_summary, '{}'::jsonb)
  from jsonb_to_recordset(p_goals) as goal_rows(
    goal_id uuid,
    title text,
    category text,
    color text,
    start_date date,
    end_date date,
    requirement_kind text,
    requirement_fingerprint text,
    requirement_snapshot jsonb,
    assessment_snapshot jsonb,
    assessment_input_hash text,
    admissible_credit_basis jsonb,
    generation_summary jsonb
  );

  insert into public.execution_plan_days (
    plan_id,
    owner_id,
    scope_month,
    date,
    is_rest_day,
    is_blocked,
    preference_cost,
    resolved_policy,
    generation_session_count,
    generation_effort_minutes
  )
  select
    v_new_plan_id,
    p_owner,
    p_scope_month,
    day_rows.date,
    day_rows.is_rest_day,
    day_rows.is_blocked,
    day_rows.preference_cost,
    day_rows.resolved_policy,
    day_rows.generation_session_count,
    day_rows.generation_effort_minutes
  from jsonb_to_recordset(p_days) as day_rows(
    date date,
    is_rest_day boolean,
    is_blocked boolean,
    preference_cost integer,
    resolved_policy jsonb,
    generation_session_count integer,
    generation_effort_minutes integer
  );

  with item_rows as (
    select *
    from jsonb_to_recordset(p_items) as rows(
      goal_id uuid,
      unit_key text,
      requirement_kind text,
      ordinal integer,
      period_key date,
      label text,
      credit_window_start date,
      credit_window_end date,
      placement_window_start date,
      placement_window_end date,
      classification text,
      miss_policy text,
      rest_eligible boolean,
      max_per_day integer,
      credited_completion_id uuid,
      credited_completion_date date,
      credit_state text,
      original_scheduled_date date,
      scheduled_date date,
      locked boolean,
      locked_at timestamptz,
      estimated_minutes integer,
      priority integer,
      scheduled_time_override text,
      effective_scheduled_local_time text
    )
  ),
  goal_map as (
    select id, goal_id
    from public.execution_plan_goals
    where public.execution_plan_goals.plan_id = v_new_plan_id
      and owner_id = p_owner
  )
  insert into public.execution_plan_items (
    plan_id,
    owner_id,
    plan_goal_id,
    unit_key,
    requirement_kind,
    ordinal,
    period_key,
    label,
    credit_window_start,
    credit_window_end,
    placement_window_start,
    placement_window_end,
    classification,
    miss_policy,
    rest_eligible,
    max_per_day,
    credited_completion_id,
    credited_completion_date,
    credit_state,
    original_scheduled_date,
    scheduled_date,
    locked,
    locked_at,
    estimated_minutes,
    priority,
    scheduled_time_override,
    effective_scheduled_local_time
  )
  select
    v_new_plan_id,
    p_owner,
    goal_map.id,
    item_rows.unit_key,
    item_rows.requirement_kind,
    item_rows.ordinal,
    item_rows.period_key,
    item_rows.label,
    item_rows.credit_window_start,
    item_rows.credit_window_end,
    item_rows.placement_window_start,
    item_rows.placement_window_end,
    item_rows.classification,
    item_rows.miss_policy,
    item_rows.rest_eligible,
    item_rows.max_per_day,
    item_rows.credited_completion_id,
    item_rows.credited_completion_date,
    item_rows.credit_state,
    item_rows.original_scheduled_date,
    item_rows.scheduled_date,
    item_rows.locked,
    item_rows.locked_at,
    item_rows.estimated_minutes,
    item_rows.priority,
    nullif(item_rows.scheduled_time_override, ''),
    nullif(item_rows.effective_scheduled_local_time, '')
  from item_rows
  join goal_map
    on goal_map.goal_id = item_rows.goal_id;

  get diagnostics v_inserted_items = row_count;
  if v_inserted_items <> jsonb_array_length(p_items) then
    raise exception using
      errcode = '23503',
      message = 'publish item payload references unknown goals';
  end if;

  with issue_rows as (
    select *
    from jsonb_to_recordset(p_issues) as rows(
      goal_id uuid,
      issue_code text,
      severity text,
      unit_key text,
      details jsonb
    )
  ),
  goal_map as (
    select id, goal_id
    from public.execution_plan_goals
    where public.execution_plan_goals.plan_id = v_new_plan_id
      and owner_id = p_owner
  )
  insert into public.execution_plan_issues (
    plan_id,
    owner_id,
    plan_goal_id,
    issue_code,
    severity,
    unit_key,
    details
  )
  select
    v_new_plan_id,
    p_owner,
    goal_map.id,
    issue_rows.issue_code,
    issue_rows.severity,
    issue_rows.unit_key,
    issue_rows.details
  from issue_rows
  join goal_map
    on goal_map.goal_id = issue_rows.goal_id;

  get diagnostics v_inserted_issues = row_count;
  if v_inserted_issues <> jsonb_array_length(p_issues) then
    raise exception using
      errcode = '23503',
      message = 'publish issue payload references unknown goals';
  end if;

  v_execution_revision := v_state.execution_revision + 1;
  update private.planner_state
  set execution_revision = v_execution_revision,
      updated_at = now()
  where owner_id = p_owner;

  plan_id := v_new_plan_id;
  version := v_new_version;
  replayed := false;
  is_currently_active := true;
  current_active_plan_id := v_new_plan_id;
  execution_revision := v_execution_revision;
  return next;
end;
$$;
