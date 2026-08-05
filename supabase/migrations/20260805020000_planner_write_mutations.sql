create or replace function private.require_planner_state_revisions(
  p_owner uuid,
  p_expected_canonical_revision bigint,
  p_expected_execution_revision bigint
)
returns private.planner_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.planner_state;
begin
  if p_owner is null then
    raise exception using
      errcode = '22023',
      message = 'owner is required';
  end if;

  perform private.ensure_planner_state(p_owner);

  select *
  into v_state
  from private.planner_state
  where owner_id = p_owner
  for update;

  if v_state.owner_id is null then
    raise exception using
      errcode = '55000',
      message = 'planner state is unavailable';
  end if;

  if v_state.canonical_revision <> p_expected_canonical_revision
    or v_state.execution_revision <> p_expected_execution_revision then
    raise exception using
      errcode = '40001',
      message = 'planner revision mismatch';
  end if;

  return v_state;
end;
$$;

create or replace function private.local_today_for_timezone(
  p_timezone text
)
returns date
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not private.is_valid_planner_timezone(p_timezone) then
    raise exception using
      errcode = '22023',
      message = 'invalid planner timezone';
  end if;
  return (clock_timestamp() at time zone p_timezone)::date;
end;
$$;

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
      priority integer
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
    priority
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
    item_rows.priority
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
    coalesce(issue_rows.details, '{}'::jsonb)
  from issue_rows
  left join goal_map
    on issue_rows.goal_id = goal_map.goal_id
  where issue_rows.goal_id is null
    or goal_map.id is not null;

  get diagnostics v_inserted_issues = row_count;
  if v_inserted_issues <> jsonb_array_length(p_issues) then
    raise exception using
      errcode = '23503',
      message = 'publish issue payload references unknown goals';
  end if;

  perform private.bump_planner_execution_revision(p_owner);

  select state.execution_revision
  into v_execution_revision
  from private.planner_state state
  where state.owner_id = p_owner;

  return query
  select
    v_new_plan_id,
    v_new_version,
    false,
    true,
    v_new_plan_id,
    v_execution_revision;
end;
$$;

create or replace function public.move_execution_plan_item_service(
  p_owner uuid,
  p_item_id uuid,
  p_date date,
  p_expected_item_revision bigint,
  p_expected_canonical_revision bigint,
  p_expected_execution_revision bigint
)
returns table (
  item_id uuid,
  scheduled_date date,
  locked boolean,
  item_revision bigint,
  execution_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_item_id uuid;
  v_scheduled_date date;
  v_locked boolean;
  v_item_revision bigint;
  v_execution_revision bigint;
begin
  if p_date is null then
    raise exception using
      errcode = '22023',
      message = 'move date is required';
  end if;

  perform pg_advisory_xact_lock(private.planner_owner_lock_key(p_owner));
  perform private.require_planner_state_revisions(
    p_owner,
    p_expected_canonical_revision,
    p_expected_execution_revision
  );

  select
    item.id,
    item.revision,
    item.scheduled_date,
    item.locked,
    item.classification,
    item.credit_state,
    plan_goal.goal_id as live_goal_id
  into v_item
  from public.execution_plan_items item
  join public.execution_plan_goals plan_goal
    on plan_goal.id = item.plan_goal_id
   and plan_goal.plan_id = item.plan_id
   and plan_goal.owner_id = item.owner_id
  join public.execution_plans plan
    on plan.id = item.plan_id
   and plan.owner_id = item.owner_id
  where item.id = p_item_id
    and item.owner_id = p_owner
    and plan.status = 'active'
  for update of item, plan_goal, plan;

  if v_item.id is null then
    raise exception using
      errcode = '42501',
      message = 'active planner item not found';
  end if;

  if v_item.revision <> p_expected_item_revision then
    raise exception using
      errcode = '40001',
      message = 'planner item revision mismatch';
  end if;

  if v_item.credit_state <> 'uncredited'
    or v_item.classification in (
      'historical_shortfall',
      'historical_miss'
    ) then
    raise exception using
      errcode = '23514',
      message = 'completed or historical items cannot move';
  end if;

  if v_item.live_goal_id is null then
    raise exception using
      errcode = '23514',
      message = 'orphaned planner items cannot move';
  end if;

  if exists (
    select 1
    from public.completions completion
    where completion.user_id = p_owner
      and completion.goal_id = v_item.live_goal_id
      and completion.completed_on = p_date
  ) then
    raise exception using
      errcode = '23514',
      message = 'completion_exists';
  end if;

  update public.execution_plan_items
  set scheduled_date = p_date,
      locked = true,
      revision = revision + 1
  where id = p_item_id
    and owner_id = p_owner
    and revision = p_expected_item_revision
  returning
    public.execution_plan_items.id,
    public.execution_plan_items.scheduled_date,
    public.execution_plan_items.locked,
    public.execution_plan_items.revision
  into v_item_id, v_scheduled_date, v_locked, v_item_revision;

  if v_item_id is null then
    raise exception using
      errcode = '40001',
      message = 'planner item revision mismatch';
  end if;

  perform private.bump_planner_execution_revision(p_owner);

  select state.execution_revision
  into v_execution_revision
  from private.planner_state state
  where state.owner_id = p_owner;

  item_id := v_item_id;
  scheduled_date := v_scheduled_date;
  locked := v_locked;
  item_revision := v_item_revision;
  execution_revision := v_execution_revision;
  return next;
end;
$$;

create or replace function public.set_execution_plan_item_lock_service(
  p_owner uuid,
  p_item_id uuid,
  p_locked boolean,
  p_expected_item_revision bigint,
  p_expected_canonical_revision bigint,
  p_expected_execution_revision bigint
)
returns table (
  item_id uuid,
  scheduled_date date,
  locked boolean,
  item_revision bigint,
  execution_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.planner_state;
  v_item record;
  v_item_id uuid;
  v_scheduled_date date;
  v_locked boolean;
  v_item_revision bigint;
  v_execution_revision bigint;
begin
  perform pg_advisory_xact_lock(private.planner_owner_lock_key(p_owner));
  v_state := private.require_planner_state_revisions(
    p_owner,
    p_expected_canonical_revision,
    p_expected_execution_revision
  );

  select
    item.id,
    item.revision,
    item.scheduled_date,
    item.locked
  into v_item
  from public.execution_plan_items item
  join public.execution_plans plan
    on plan.id = item.plan_id
   and plan.owner_id = item.owner_id
  where item.id = p_item_id
    and item.owner_id = p_owner
    and plan.status = 'active'
  for update of item, plan;

  if v_item.id is null then
    raise exception using
      errcode = '42501',
      message = 'active planner item not found';
  end if;

  if v_item.revision <> p_expected_item_revision then
    raise exception using
      errcode = '40001',
      message = 'planner item revision mismatch';
  end if;

  if v_item.locked = p_locked then
    item_id := v_item.id;
    scheduled_date := v_item.scheduled_date;
    locked := v_item.locked;
    item_revision := v_item.revision;
    execution_revision := v_state.execution_revision;
    return next;
    return;
  end if;

  update public.execution_plan_items
  set locked = p_locked,
      revision = revision + 1
  where id = p_item_id
    and owner_id = p_owner
    and revision = p_expected_item_revision
  returning
    public.execution_plan_items.id,
    public.execution_plan_items.scheduled_date,
    public.execution_plan_items.locked,
    public.execution_plan_items.revision
  into v_item_id, v_scheduled_date, v_locked, v_item_revision;

  if v_item_id is null then
    raise exception using
      errcode = '40001',
      message = 'planner item revision mismatch';
  end if;

  perform private.bump_planner_execution_revision(p_owner);

  select state.execution_revision
  into v_execution_revision
  from private.planner_state state
  where state.owner_id = p_owner;

  item_id := v_item_id;
  scheduled_date := v_scheduled_date;
  locked := v_locked;
  item_revision := v_item_revision;
  execution_revision := v_execution_revision;
  return next;
end;
$$;

create or replace function public.dismiss_execution_plan_service(
  p_owner uuid,
  p_plan_id uuid,
  p_expected_canonical_revision bigint,
  p_expected_execution_revision bigint
)
returns table (
  plan_id uuid,
  status text,
  execution_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform pg_advisory_xact_lock(private.planner_owner_lock_key(p_owner));
  perform private.require_planner_state_revisions(
    p_owner,
    p_expected_canonical_revision,
    p_expected_execution_revision
  );

  update public.execution_plans
  set status = 'dismissed',
      dismissed_at = now()
  where id = p_plan_id
    and owner_id = p_owner
    and public.execution_plans.status = 'active'
  returning id, public.execution_plans.status
  into plan_id, v_status;

  if plan_id is null then
    raise exception using
      errcode = '42501',
      message = 'active planner plan not found';
  end if;

  perform private.bump_planner_execution_revision(p_owner);

  select state.execution_revision
  into execution_revision
  from private.planner_state state
  where state.owner_id = p_owner;

  status := v_status;
  return next;
end;
$$;

create or replace function public.set_execution_plan_goal_date_fact_service(
  p_owner uuid,
  p_plan_goal_id uuid,
  p_date date,
  p_desired_fact_state text,
  p_expected_canonical_revision bigint,
  p_expected_execution_revision bigint
)
returns table (
  goal_id uuid,
  date date,
  fact_state text,
  canonical_revision bigint,
  execution_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal record;
  v_existing_completion_id uuid;
  v_target_count integer;
  v_completion_count integer;
begin
  perform pg_advisory_xact_lock(private.planner_owner_lock_key(p_owner));
  perform private.require_planner_state_revisions(
    p_owner,
    p_expected_canonical_revision,
    p_expected_execution_revision
  );

  if p_desired_fact_state not in ('present', 'absent') then
    raise exception using
      errcode = '22023',
      message = 'invalid desired fact state';
  end if;

  select
    plan_goal.id,
    plan_goal.goal_id,
    plan_goal.start_date,
    plan_goal.end_date,
    plan_goal.requirement_kind,
    plan_goal.requirement_snapshot,
    plan.timezone
  into v_goal
  from public.execution_plan_goals plan_goal
  join public.execution_plans plan
    on plan.id = plan_goal.plan_id
   and plan.owner_id = plan_goal.owner_id
  where plan_goal.id = p_plan_goal_id
    and plan_goal.owner_id = p_owner
    and plan.status = 'active'
  for update of plan_goal, plan;

  if v_goal.id is null then
    raise exception using
      errcode = '42501',
      message = 'active planner goal not found';
  end if;

  if v_goal.goal_id is null then
    raise exception using
      errcode = '23514',
      message = 'planner goal no longer has a live goal';
  end if;

  if exists (
    select 1
    from public.goal_links link
    where link.owner_id = p_owner
      and (
        link.source_goal_id = v_goal.goal_id
        or link.target_goal_id = v_goal.goal_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'linked goals cannot use planner plan-goal date facts';
  end if;

  select completion.id
  into v_existing_completion_id
  from public.completions completion
  where completion.user_id = p_owner
    and completion.goal_id = v_goal.goal_id
    and completion.completed_on = p_date
  order by completion.id
  limit 1;

  if p_desired_fact_state = 'present' then
    if p_date > private.local_today_for_timezone(v_goal.timezone) then
      raise exception using
        errcode = '23514',
        message = 'future_completion_not_allowed';
    end if;

    if p_date < v_goal.start_date
      or (v_goal.end_date is not null and p_date > v_goal.end_date) then
      raise exception using
        errcode = '23514',
        message = 'completion_outside_goal_lifetime';
    end if;

    if v_goal.requirement_kind = 'milestone_sequence'
      and v_existing_completion_id is null then
      v_target_count := greatest(
        1,
        coalesce(
          (v_goal.requirement_snapshot->'requirement'->>'targetCount')::integer,
          1
        )
      );
      select count(*)
      into v_completion_count
      from public.completions completion
      where completion.user_id = p_owner
        and completion.goal_id = v_goal.goal_id;

      if v_completion_count >= v_target_count then
        raise exception using
          errcode = '23514',
          message = 'milestone_sequence_already_complete';
      end if;
    end if;

    if v_existing_completion_id is null then
      insert into public.completions (
        id,
        goal_id,
        user_id,
        completed_on,
        source
      )
      values (
        gen_random_uuid(),
        v_goal.goal_id,
        p_owner,
        p_date,
        'manual'
      );
    end if;
  else
    delete from public.completions completion
    where completion.user_id = p_owner
      and completion.goal_id = v_goal.goal_id
      and completion.completed_on = p_date;
  end if;

  select state.canonical_revision, state.execution_revision
  into canonical_revision, execution_revision
  from private.planner_state state
  where state.owner_id = p_owner;

  goal_id := v_goal.goal_id;
  date := p_date;
  fact_state := p_desired_fact_state;
  return next;
end;
$$;

create or replace function public.set_execution_plan_item_date_fact_service(
  p_owner uuid,
  p_item_id uuid,
  p_desired_fact_state text,
  p_expected_credited_unit jsonb,
  p_expected_canonical_revision bigint,
  p_expected_execution_revision bigint,
  p_expected_item_revision bigint
)
returns table (
  item_id uuid,
  goal_id uuid,
  date date,
  fact_state text,
  canonical_revision bigint,
  execution_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_existing_completion_id uuid;
begin
  perform pg_advisory_xact_lock(private.planner_owner_lock_key(p_owner));
  perform private.require_planner_state_revisions(
    p_owner,
    p_expected_canonical_revision,
    p_expected_execution_revision
  );

  if p_desired_fact_state not in ('present', 'absent') then
    raise exception using
      errcode = '22023',
      message = 'invalid desired fact state';
  end if;

  select
    item.id,
    item.revision,
    item.scheduled_date,
    item.classification,
    item.credited_completion_id,
    item.credited_completion_date,
    plan.timezone,
    plan_goal.goal_id,
    plan_goal.original_goal_id,
    plan_goal.requirement_fingerprint,
    item.unit_key
  into v_item
  from public.execution_plan_items item
  join public.execution_plan_goals plan_goal
    on plan_goal.id = item.plan_goal_id
   and plan_goal.plan_id = item.plan_id
   and plan_goal.owner_id = item.owner_id
  join public.execution_plans plan
    on plan.id = item.plan_id
   and plan.owner_id = item.owner_id
  where item.id = p_item_id
    and item.owner_id = p_owner
    and plan.status = 'active'
  for update of item, plan_goal, plan;

  if v_item.id is null then
    raise exception using
      errcode = '42501',
      message = 'active planner item not found';
  end if;

  if v_item.revision <> p_expected_item_revision then
    raise exception using
      errcode = '40001',
      message = 'planner item revision mismatch';
  end if;

  if v_item.goal_id is null then
    raise exception using
      errcode = '23514',
      message = 'planner item no longer has a live goal';
  end if;

  if v_item.scheduled_date is null then
    raise exception using
      errcode = '23514',
      message = 'planner item has no scheduled date';
  end if;

  if v_item.classification in (
    'historical_shortfall',
    'historical_miss',
    'satisfied_elsewhere'
  ) then
    raise exception using
      errcode = '23514',
      message = 'item state cannot accept exact-date facts';
  end if;

  if p_expected_credited_unit is null then
    if v_item.credited_completion_id is not null then
      raise exception using
        errcode = '40001',
        message = 'credited unit mismatch';
    end if;
  else
    if v_item.credited_completion_id is null
      or p_expected_credited_unit->>'goalId' <> v_item.original_goal_id::text
      or p_expected_credited_unit->>'requirementFingerprint' <> v_item.requirement_fingerprint
      or p_expected_credited_unit->>'unitKey' <> v_item.unit_key
      or p_expected_credited_unit->>'completedOn' <> v_item.credited_completion_date::text then
      raise exception using
        errcode = '40001',
        message = 'credited unit mismatch';
    end if;
  end if;

  select completion.id
  into v_existing_completion_id
  from public.completions completion
  where completion.user_id = p_owner
    and completion.goal_id = v_item.goal_id
    and completion.completed_on = v_item.scheduled_date
  order by completion.id
  limit 1;

  if p_desired_fact_state = 'present' then
    if v_item.scheduled_date > private.local_today_for_timezone(v_item.timezone) then
      raise exception using
        errcode = '23514',
        message = 'future_completion_not_allowed';
    end if;
    if v_existing_completion_id is null then
      insert into public.completions (
        id,
        goal_id,
        user_id,
        completed_on,
        source
      )
      values (
        gen_random_uuid(),
        v_item.goal_id,
        p_owner,
        v_item.scheduled_date,
        'manual'
      );
    end if;
  else
    delete from public.completions completion
    where completion.user_id = p_owner
      and completion.goal_id = v_item.goal_id
      and completion.completed_on = v_item.scheduled_date;
  end if;

  select state.canonical_revision, state.execution_revision
  into canonical_revision, execution_revision
  from private.planner_state state
  where state.owner_id = p_owner;

  item_id := v_item.id;
  goal_id := v_item.goal_id;
  date := v_item.scheduled_date;
  fact_state := p_desired_fact_state;
  return next;
end;
$$;

revoke execute on function private.require_planner_state_revisions(
  uuid,
  bigint,
  bigint
) from public, anon, authenticated;
revoke execute on function private.local_today_for_timezone(text)
from public, anon, authenticated;

grant execute on function private.require_planner_state_revisions(
  uuid,
  bigint,
  bigint
) to service_role;
grant execute on function private.local_today_for_timezone(text)
to service_role;

revoke execute on function public.publish_execution_plan_service(
  uuid,
  date,
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
revoke execute on function public.move_execution_plan_item_service(
  uuid,
  uuid,
  date,
  bigint,
  bigint,
  bigint
) from public, anon, authenticated, service_role;
revoke execute on function public.set_execution_plan_item_lock_service(
  uuid,
  uuid,
  boolean,
  bigint,
  bigint,
  bigint
) from public, anon, authenticated, service_role;
revoke execute on function public.dismiss_execution_plan_service(
  uuid,
  uuid,
  bigint,
  bigint
) from public, anon, authenticated, service_role;
revoke execute on function public.set_execution_plan_goal_date_fact_service(
  uuid,
  uuid,
  date,
  text,
  bigint,
  bigint
) from public, anon, authenticated, service_role;
revoke execute on function public.set_execution_plan_item_date_fact_service(
  uuid,
  uuid,
  text,
  jsonb,
  bigint,
  bigint,
  bigint
) from public, anon, authenticated, service_role;

grant execute on function public.publish_execution_plan_service(
  uuid,
  date,
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
grant execute on function public.move_execution_plan_item_service(
  uuid,
  uuid,
  date,
  bigint,
  bigint,
  bigint
) to service_role;
grant execute on function public.set_execution_plan_item_lock_service(
  uuid,
  uuid,
  boolean,
  bigint,
  bigint,
  bigint
) to service_role;
grant execute on function public.dismiss_execution_plan_service(
  uuid,
  uuid,
  bigint,
  bigint
) to service_role;
grant execute on function public.set_execution_plan_goal_date_fact_service(
  uuid,
  uuid,
  date,
  text,
  bigint,
  bigint
) to service_role;
grant execute on function public.set_execution_plan_item_date_fact_service(
  uuid,
  uuid,
  text,
  jsonb,
  bigint,
  bigint,
  bigint
) to service_role;
