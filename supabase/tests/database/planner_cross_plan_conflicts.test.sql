begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(3);

insert into auth.users (id, email)
values (
  '77777777-7777-4777-8777-777777777777',
  'planner-cross-plan-conflicts@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username)
values (
  '77777777-7777-4777-8777-777777777777',
  'planner_cross_plan_conflicts_fixture'
)
on conflict (id) do nothing;

delete from public.goals
where id = '12000000-0000-4000-8000-000000000099';

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
  '12000000-0000-4000-8000-000000000099',
  '77777777-7777-4777-8777-777777777777',
  'Cross-plan conflict test goal',
  null,
  'test',
  null,
  'recurring',
  'weekly',
  1,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
  false
);

insert into public.execution_plans (
  id,
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
  prompt_version,
  placement_status,
  search_status,
  capacity_status,
  confirmation_required,
  publishable,
  idempotency_key,
  request_digest
)
values
  (
    '31000000-0000-4000-8000-000000000001',
    '77777777-7777-4777-8777-777777777777',
    date_trunc('month', current_date)::date,
    'end_month_v1',
    'UTC',
    1,
    null,
    'active',
    'manual',
    '{}'::jsonb,
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
    '31000000-0000-4000-8000-000000000099',
    repeat('b', 64)
  ),
  (
    '31000000-0000-4000-8000-000000000002',
    '77777777-7777-4777-8777-777777777777',
    (date_trunc('month', current_date) + interval '1 month')::date,
    'end_month_v1',
    'UTC',
    1,
    null,
    'active',
    'manual',
    '{}'::jsonb,
    '{"schemaVersion":"1","timezone":"UTC"}'::jsonb,
    repeat('c', 64),
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
    '31000000-0000-4000-8000-000000000098',
    repeat('d', 64)
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
values
  (
    '32000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '77777777-7777-4777-8777-777777777777',
    '12000000-0000-4000-8000-000000000099',
    '12000000-0000-4000-8000-000000000099',
    'Conflict guard goal',
    'test',
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
    'deadline_total',
    repeat('e', 64),
    '{"schemaVersion":"1","requirement":{"kind":"deadline_total","targetCount":1,"spacingHint":"weekly","maxPerDay":1}}'::jsonb,
    '{"schemaVersion":"1","estimatedMinutesPerSession":30}'::jsonb,
    repeat('f', 64),
    '{"completionToUnit":{}}'::jsonb,
    '{"expected":1,"credited":0}'::jsonb
  ),
  (
    '32000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    '77777777-7777-4777-8777-777777777777',
    '12000000-0000-4000-8000-000000000099',
    '12000000-0000-4000-8000-000000000099',
    'Conflict guard goal',
    'test',
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
    'deadline_total',
    repeat('1', 64),
    '{"schemaVersion":"1","requirement":{"kind":"deadline_total","targetCount":1,"spacingHint":"weekly","maxPerDay":1}}'::jsonb,
    '{"schemaVersion":"1","estimatedMinutesPerSession":30}'::jsonb,
    repeat('2', 64),
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
values
  (
    '33000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '77777777-7777-4777-8777-777777777777',
    date_trunc('month', current_date)::date,
    date_trunc('month', current_date)::date + 5,
    '{}'::jsonb
  ),
  (
    '33000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    '77777777-7777-4777-8777-777777777777',
    (date_trunc('month', current_date) + interval '1 month')::date,
    date_trunc('month', current_date)::date + 5,
    '{}'::jsonb
  ),
  (
    '33000000-0000-4000-8000-000000000003',
    '31000000-0000-4000-8000-000000000002',
    '77777777-7777-4777-8777-777777777777',
    (date_trunc('month', current_date) + interval '1 month')::date,
    date_trunc('month', current_date)::date + 6,
    '{}'::jsonb
  );

select lives_ok(
  $$
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
      locked_at
    )
    values (
      '34000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '77777777-7777-4777-8777-777777777777',
      '32000000-0000-4000-8000-000000000001',
      'total:1',
      'deadline_total',
      1,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
      'open',
      'roll_forward',
      true,
      'uncredited',
      date_trunc('month', current_date)::date + 5,
      date_trunc('month', current_date)::date + 5,
      false,
      null
    )
  $$,
  'baseline active plan item insert succeeds'
);

select throws_ok(
  $$
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
      locked_at
    )
    values (
      '34000000-0000-4000-8000-000000000002',
      '31000000-0000-4000-8000-000000000002',
      '77777777-7777-4777-8777-777777777777',
      '32000000-0000-4000-8000-000000000002',
      'total:1',
      'deadline_total',
      1,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
      'open',
      'roll_forward',
      true,
      'uncredited',
      date_trunc('month', current_date)::date + 5,
      date_trunc('month', current_date)::date + 5,
      false,
      null
    )
  $$,
  '23514'::character(5),
  'cross_plan_goal_date_conflict',
  'cross-plan goal/date conflicts are blocked across active plans'
);

select throws_ok(
  $$
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
      locked_at
    )
    values (
      '34000000-0000-4000-8000-000000000003',
      '31000000-0000-4000-8000-000000000002',
      '77777777-7777-4777-8777-777777777777',
      '32000000-0000-4000-8000-000000000002',
      'total:1',
      'deadline_total',
      1,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
      'open',
      'roll_forward',
      true,
      'uncredited',
      date_trunc('month', current_date)::date + 6,
      date_trunc('month', current_date)::date + 6,
      false,
      null
    )
  $$,
  '23514'::character(5),
  'cross_plan_goal_unit_conflict',
  'cross-plan goal/unit key conflicts are blocked across active plans'
);

select * from finish();
rollback;
