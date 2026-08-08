begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(8);

do $$
declare
  v_owner constant uuid := '11111111-1111-4111-8111-111111111111';
  v_goal constant uuid := '91210000-0000-4000-8000-000000000001';
  v_plan constant uuid := '91210000-0000-4000-8000-000000000101';
  v_plan_goal constant uuid := '91210000-0000-4000-8000-000000000201';
  v_day constant uuid := '91210000-0000-4000-8000-000000000301';
  v_item constant uuid := '91210000-0000-4000-8000-000000000401';
  v_scope_month constant date := date_trunc('month', current_date)::date;
  v_scheduled_day constant date := date_trunc('month', current_date)::date + 3;
begin
  insert into auth.users (id, email)
  values (v_owner, 'planner-items-sync@example.com')
  on conflict (id) do nothing;

  insert into public.profiles (id, username)
  values (
    v_owner,
    'planner_items_sync_' || pg_catalog.replace(v_owner::text, '-', '')
  )
  on conflict (id) do nothing;

  delete from public.planner_items
  where owner_id = v_owner;

  delete from public.execution_plan_items
  where id = v_item;
  delete from public.execution_plan_days
  where id = v_day;
  delete from public.execution_plan_goals
  where id = v_plan_goal;
  delete from public.execution_plans
  where id = v_plan;
  delete from public.goals
  where id = v_goal;

  insert into public.goals (
    id,
    owner_id,
    title,
    description,
    category,
    color,
    frequency_type,
    recurrence_interval,
    target_count,
    start_date,
    end_date,
    is_group
  )
  values (
    v_goal,
    v_owner,
    'Planner items runtime sync goal',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    1,
    v_scope_month,
    (v_scope_month + interval '1 month - 1 day')::date,
    false
  );

  insert into public.execution_plans (
    id,
    owner_id,
    scope_month,
    eligibility_mode,
    timezone,
    version,
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
    prompt_version,
    placement_status,
    search_status,
    capacity_status,
    confirmation_required,
    publishable,
    idempotency_key,
    request_digest
  )
  values (
    v_plan,
    v_owner,
    v_scope_month,
    'overlap_v1',
    'UTC',
    1,
    'active',
    'manual',
    '{"added": 1}'::jsonb,
    '{"schemaVersion":"1","timezone":"UTC"}'::jsonb,
    repeat('a', 64),
    0,
    0,
    '1',
    'ordered-dp-v1',
    '1',
    '1',
    '1',
    '1',
    null,
    'complete',
    'all_units_placed',
    'unverified',
    false,
    true,
    '91210000-0000-4000-8000-000000000501',
    repeat('b', 64)
  );

  insert into public.execution_plan_goals (
    id,
    plan_id,
    owner_id,
    goal_id,
    original_goal_id,
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
  values (
    v_plan_goal,
    v_plan,
    v_owner,
    v_goal,
    v_goal,
    'Planner items runtime sync goal',
    'test',
    null,
    v_scope_month,
    (v_scope_month + interval '1 month - 1 day')::date,
    'deadline_total',
    repeat('c', 64),
    '{"schemaVersion":"1","requirement":{"kind":"deadline_total","targetCount":1,"spacingHint":"weekly","maxPerDay":1}}'::jsonb,
    '{"schemaVersion":"1","estimatedMinutesPerSession":30}'::jsonb,
    repeat('d', 64),
    '{"completionToUnit":{}}'::jsonb,
    '{"expected":1,"credited":0}'::jsonb
  );

  insert into public.execution_plan_days (
    id,
    plan_id,
    owner_id,
    scope_month,
    date,
    resolved_policy
  )
  values (
    v_day,
    v_plan,
    v_owner,
    v_scope_month,
    v_scheduled_day,
    '{}'::jsonb
  );

  insert into public.execution_plan_items (
    id,
    plan_id,
    owner_id,
    plan_goal_id,
    unit_key,
    requirement_kind,
    ordinal,
    credit_window_start,
    credit_window_end,
    placement_window_start,
    placement_window_end,
    classification,
    miss_policy,
    rest_eligible,
    credit_state,
    original_scheduled_date,
    scheduled_date,
    locked,
    scheduled_time_override,
    effective_scheduled_local_time,
    locked_at
  )
  values (
    v_item,
    v_plan,
    v_owner,
    v_plan_goal,
    'total:1',
    'deadline_total',
    1,
    v_scope_month,
    (v_scope_month + interval '1 month - 1 day')::date,
    v_scope_month,
    (v_scope_month + interval '1 month - 1 day')::date,
    'open',
    'roll_forward',
    true,
    'uncredited',
    v_scheduled_day,
    v_scheduled_day,
    true,
    '09:30',
    null,
    now()
  );
end;
$$;

set local role service_role;
select is(
  (
    select synced_count
    from public.sync_planner_items_from_active_execution_plan_service(
      '11111111-1111-4111-8111-111111111111',
      date_trunc('month', current_date)::date
    )
  ),
  1,
  'sync service mirrors one active execution-plan item into planner_items'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.planner_items
    where owner_id = '11111111-1111-4111-8111-111111111111'
  ),
  1,
  'planner_items has one synced row after service call'
);

select is(
  (
    select scheduled_time
    from public.planner_items
    where goal_id = '91210000-0000-4000-8000-000000000001'
      and unit_key = 'total:1'
  ),
  '09:30',
  'planner_items sync preserves scheduled_time from execution_plan_items'
);

select is(
  (
    select locked
    from public.planner_items
    where goal_id = '91210000-0000-4000-8000-000000000001'
      and unit_key = 'total:1'
  ),
  true,
  'planner_items sync preserves locked state from execution_plan_items'
);

update public.execution_plan_items
set locked = false,
    locked_at = null,
    revision = revision + 1
where id = '91210000-0000-4000-8000-000000000401';

set local role service_role;
select is(
  (
    select synced_count
    from public.sync_planner_items_from_active_execution_plan_service(
      '11111111-1111-4111-8111-111111111111',
      date_trunc('month', current_date)::date
    )
  ),
  1,
  'sync service replays active plan updates into planner_items'
);
reset role;

select is(
  (
    select locked
    from public.planner_items
    where goal_id = '91210000-0000-4000-8000-000000000001'
      and unit_key = 'total:1'
  ),
  false,
  'planner_items reflects updated lock state after resync'
);

update public.execution_plans
set status = 'dismissed',
    dismissed_at = now(),
    superseded_at = null
where id = '91210000-0000-4000-8000-000000000101';

set local role service_role;
select is(
  (
    select synced_count
    from public.sync_planner_items_from_active_execution_plan_service(
      '11111111-1111-4111-8111-111111111111',
      date_trunc('month', current_date)::date
    )
  ),
  0,
  'sync service emits zero rows when no active execution plan remains'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.planner_items
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and date_trunc('month', scheduled_date)::date = date_trunc('month', current_date)::date
  ),
  0,
  'planner_items month rows are cleared when the active plan is dismissed'
);

select * from finish();
rollback;
