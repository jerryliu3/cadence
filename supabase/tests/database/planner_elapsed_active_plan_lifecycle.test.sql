begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(3);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner-elapsed-active-plan-lifecycle@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner_elapsed_active_plan_lifecycle_fixture'
)
on conflict (id) do nothing;

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
  '52000000-0000-4000-8000-000000000099',
  '11111111-1111-4111-8111-111111111111',
  'Elapsed lifecycle test goal',
  null,
  'test',
  null,
  'recurring',
  'weekly',
  1,
  (date_trunc('month', current_date) - interval '1 month')::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
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
values (
  '51000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  (date_trunc('month', current_date) - interval '1 month')::date,
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
  '51000000-0000-4000-8000-000000000099',
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
  '53000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '52000000-0000-4000-8000-000000000099',
  '52000000-0000-4000-8000-000000000099',
  'Elapsed lifecycle test goal',
  'test',
  null,
  (date_trunc('month', current_date) - interval '1 month')::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
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
  '54000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  (date_trunc('month', current_date) - interval '1 month')::date,
  (date_trunc('month', current_date) - interval '1 month')::date + 5,
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
  locked_at
)
values (
  '55000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '53000000-0000-4000-8000-000000000001',
  'total:1',
  'deadline_total',
  1,
  (date_trunc('month', current_date) - interval '1 month')::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  (date_trunc('month', current_date) - interval '1 month')::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  'open',
  'roll_forward',
  true,
  'uncredited',
  (date_trunc('month', current_date) - interval '1 month')::date + 5,
  (date_trunc('month', current_date) - interval '1 month')::date + 5,
  false,
  null
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
values (
  '51000000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  date_trunc('month', current_date)::date,
  'end_month_v1',
  'UTC',
  1,
  null,
  'active',
  'manual',
  '{}'::jsonb,
  '{"schemaVersion":"1","timezone":"UTC"}'::jsonb,
  repeat('e', 64),
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
  '51000000-0000-4000-8000-000000000098',
  repeat('f', 64)
);

select is(
  (
    select status
    from public.execution_plans
    where id = '51000000-0000-4000-8000-000000000001'
  ),
  'superseded',
  'inserting a new active plan supersedes elapsed active plans for the owner'
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
  '53000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  '52000000-0000-4000-8000-000000000099',
  '52000000-0000-4000-8000-000000000099',
  'Elapsed lifecycle test goal',
  'test',
  null,
  (date_trunc('month', current_date) - interval '1 month')::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  'deadline_total',
  repeat('a', 64),
  '{"schemaVersion":"1","requirement":{"kind":"deadline_total","targetCount":1,"spacingHint":"weekly","maxPerDay":1}}'::jsonb,
  '{"schemaVersion":"1","estimatedMinutesPerSession":30}'::jsonb,
  repeat('b', 64),
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
  '54000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  date_trunc('month', current_date)::date,
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
      '55000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000002',
      '11111111-1111-4111-8111-111111111111',
      '53000000-0000-4000-8000-000000000002',
      'total:1',
      'deadline_total',
      1,
      (date_trunc('month', current_date) - interval '1 month')::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
      (date_trunc('month', current_date) - interval '1 month')::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
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
  'same ordinal unit key can be republished after elapsed active plan is superseded'
);

select is(
  (
    select status
    from public.execution_plans
    where id = '51000000-0000-4000-8000-000000000002'
  ),
  'active',
  'current scope plan remains active after elapsed lifecycle supersede pass'
);

select * from finish();
rollback;
