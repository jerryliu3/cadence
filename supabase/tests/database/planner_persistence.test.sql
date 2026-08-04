begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(24);

create temporary table planner_test_revisions (
  label text primary key,
  canonical_revision bigint not null,
  execution_revision bigint not null
) on commit drop;

select is(
  (select count(*) from private.planner_state),
  (select count(*) from public.profiles),
  'planner state is backfilled for every profile'
);

select ok(
  private.validate_planner_json(
    '{"schemaVersion": "1", "values": [1, 2, 3]}'::jsonb,
    'object',
    1024,
    4
  ),
  'bounded planner JSON accepts a shallow typed object'
);

select isnt(
  private.validate_planner_json(
    '{"a": {"b": {"c": true}}}'::jsonb,
    'object',
    1024,
    2
  ),
  true,
  'bounded planner JSON rejects excessive nesting'
);

insert into planner_test_revisions
select 'before-goals', canonical_revision, execution_revision
from private.planner_state
where owner_id = '11111111-1111-4111-8111-111111111111';

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
values
  (
    '12000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Planner persistence test goal',
    null,
    'test',
    '#000000',
    'recurring',
    'weekly',
    2,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    false
  ),
  (
    '12000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'Planner link test goal',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    false
  );

select ok(
  (
    select canonical_revision
    from private.planner_state
    where owner_id = '11111111-1111-4111-8111-111111111111'
  ) > (
    select canonical_revision
    from planner_test_revisions
    where label = 'before-goals'
  ),
  'personal goal writes advance the canonical revision'
);

insert into planner_test_revisions
select 'before-completion', canonical_revision, execution_revision
from private.planner_state
where owner_id = '11111111-1111-4111-8111-111111111111';

insert into public.completions (
  id,
  goal_id,
  user_id,
  completed_on,
  source
)
values (
  '12500000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  current_date,
  'manual'
);

select ok(
  (
    select canonical_revision
    from private.planner_state
    where owner_id = '11111111-1111-4111-8111-111111111111'
  ) > (
    select canonical_revision
    from planner_test_revisions
    where label = 'before-completion'
  ),
  'personal completion writes advance the goal owner revision'
);

insert into public.planner_preferences (
  owner_id,
  timezone,
  default_policy,
  policy_schema_version,
  policy_compiler_version,
  timezone_confirmed_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  'UTC',
  '{
    "schemaVersion": "1",
    "timezone": "UTC",
    "timezoneConfirmedAt": "2026-08-01T00:00:00.000Z",
    "restWeekdays": [],
    "blackoutRanges": [],
    "goalAllowedWeekdays": {},
    "datePreferences": [],
    "spacingStrategy": "even",
    "goalSpacingStrategies": {},
    "dailyCadenceRestExemption": true
  }'::jsonb,
  '1',
  '1',
  '2026-08-01T00:00:00.000Z'
);

select is(
  (
    select policy_revision
    from public.planner_preferences
    where owner_id = '11111111-1111-4111-8111-111111111111'
  ),
  1::bigint,
  'planner preferences start at policy revision one'
);

update public.planner_preferences
set default_policy = jsonb_set(
  default_policy,
  '{spacingStrategy}',
  '"front_load"'::jsonb
)
where owner_id = '11111111-1111-4111-8111-111111111111';

select is(
  (
    select policy_revision
    from public.planner_preferences
    where owner_id = '11111111-1111-4111-8111-111111111111'
  ),
  2::bigint,
  'semantic preference updates advance the policy revision'
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
select
  '13000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  date_trunc('month', current_date)::date,
  'end_month_v1',
  'UTC',
  1,
  'active',
  'manual',
  '{"added": 2}'::jsonb,
  default_policy,
  repeat('a', 64),
  state.canonical_revision,
  state.execution_revision,
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
  '13000000-0000-4000-8000-000000000099',
  repeat('b', 64)
from public.planner_preferences preferences
join private.planner_state state
  on state.owner_id = preferences.owner_id
where preferences.owner_id = '11111111-1111-4111-8111-111111111111';

insert into public.execution_plan_goals (
  id,
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
values (
  '14000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '12000000-0000-4000-8000-000000000001',
  'Planner persistence test goal',
  'test',
  '#000000',
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  'deadline_total',
  repeat('c', 64),
  '{
    "schemaVersion": "1",
    "requirement": {
      "kind": "deadline_total",
      "targetCount": 2,
      "spacingHint": "weekly",
      "maxPerDay": 1
    }
  }'::jsonb,
  '{"schemaVersion": "1", "estimatedMinutesPerSession": 30}'::jsonb,
  repeat('d', 64),
  '{"completionToUnit": {}}'::jsonb,
  '{"expected": 2, "credited": 0}'::jsonb
);

select is(
  (
    select original_goal_id
    from public.execution_plan_goals
    where id = '14000000-0000-4000-8000-000000000001'
  ),
  '12000000-0000-4000-8000-000000000001'::uuid,
  'original goal identity is derived by the database'
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
    '15000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    date_trunc('month', current_date)::date,
    date_trunc('month', current_date)::date + 4,
    '{}'::jsonb
  ),
  (
    '15000000-0000-4000-8000-000000000002',
    '13000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    date_trunc('month', current_date)::date,
    date_trunc('month', current_date)::date + 5,
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
  '16000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '14000000-0000-4000-8000-000000000001',
  'total:1',
  'deadline_total',
  1,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  'open',
  'roll_forward',
  true,
  'uncredited',
  date_trunc('month', current_date)::date + 4,
  date_trunc('month', current_date)::date + 4,
  false,
  null
);

insert into public.execution_plan_issues (
  id,
  plan_id,
  owner_id,
  plan_goal_id,
  item_id,
  issue_code,
  severity,
  unit_key,
  details
)
values (
  '17000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '14000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  'historical_shortfall',
  'informational',
  'total:1',
  '{}'::jsonb
);

select throws_ok(
  $$
    insert into public.execution_plans (
      owner_id, scope_month, eligibility_mode, timezone, version,
      parent_plan_id, status,
      generation_source, change_summary, policy_snapshot,
      generation_input_hash, observed_canonical_revision,
      observed_execution_revision, contract_version, scheduler_version,
      requirement_schema_version, assessment_schema_version,
      policy_schema_version, policy_compiler_version, placement_status,
      search_status, capacity_status, confirmation_required, publishable,
      idempotency_key, request_digest
    )
    select
      owner_id, scope_month, eligibility_mode, timezone, 2, id, status,
      generation_source, change_summary, policy_snapshot,
      generation_input_hash, observed_canonical_revision,
      observed_execution_revision, contract_version, scheduler_version,
      requirement_schema_version, assessment_schema_version,
      policy_schema_version, policy_compiler_version, placement_status,
      search_status, capacity_status, confirmation_required, publishable,
      '13000000-0000-4000-8000-000000000098',
      repeat('e', 64)
    from public.execution_plans
    where id = '13000000-0000-4000-8000-000000000001'
  $$,
  '23505'::character(5),
  'duplicate key value violates unique constraint "execution_plans_one_active_scope_idx"',
  'one active plan is enforced per owner and monthly scope'
);

select throws_ok(
  $$
    update public.execution_plan_goals
    set title = 'Mutated snapshot'
    where id = '14000000-0000-4000-8000-000000000001'
  $$,
  '55000'::character(5),
  'execution plan goal snapshots are immutable',
  'plan goal snapshots reject mutation'
);

select throws_ok(
  $$
    update public.execution_plan_items
    set scheduled_date = scheduled_date + 1,
        revision = revision + 1
    where id = '16000000-0000-4000-8000-000000000001'
  $$,
  '23514'::character(5),
  'moving an execution plan item must lock it',
  'moving an item without locking is rejected'
);

update public.execution_plan_items
set scheduled_date = scheduled_date + 1,
    locked = true,
    locked_at = now(),
    revision = revision + 1
where id = '16000000-0000-4000-8000-000000000001';

select results_eq(
  $$
    select scheduled_date, locked, revision
    from public.execution_plan_items
    where id = '16000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      date_trunc('month', current_date)::date + 5,
      true,
      1::bigint
    )
  $$,
  'a valid move updates only mutable execution state'
);

select throws_ok(
  $$
    update public.execution_plan_items
    set classification = 'fulfilled',
        revision = revision + 1
    where id = '16000000-0000-4000-8000-000000000001'
  $$,
  '55000'::character(5),
  'execution plan item obligation state is immutable',
  'item obligation state remains immutable'
);

select throws_ok(
  $$
    insert into public.goal_links (
      owner_id,
      source_goal_id,
      target_goal_id
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      '12000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000002'
    )
  $$,
  '55000'::character(5),
  'goals in an active execution plan cannot be linked',
  'active-plan goals cannot be linked'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)
    from public.execution_plans
    where id = '13000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'RLS hides another owner plan'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select is(
  (
    select count(*)
    from public.execution_plans
    where id = '13000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'RLS exposes the owner plan'
);

select throws_ok(
  $$
    insert into public.execution_plan_issues (
      plan_id,
      owner_id,
      issue_code,
      severity
    )
    values (
      '13000000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      'placement_shortfall',
      'warning'
    )
  $$,
  '42501'::character(5),
  'permission denied for table execution_plan_issues',
  'authenticated clients cannot write planning snapshots directly'
);

select ok(
  (
    select canonical_revision >= 0 and execution_revision >= 0
    from public.get_planner_state()
  ),
  'authenticated owners can read only their planner revision tokens'
);

reset role;

set local role service_role;
select throws_ok(
  $$
    insert into public.execution_plan_issues (
      plan_id,
      owner_id,
      issue_code,
      severity
    )
    values (
      '13000000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      'placement_shortfall',
      'warning'
    )
  $$,
  '42501'::character(5),
  'permission denied for table execution_plan_issues',
  'service-role clients must use privileged planner functions for writes'
);
reset role;

delete from public.goals
where id = '12000000-0000-4000-8000-000000000001';

select results_eq(
  $$
    select goal_id, original_goal_id
    from public.execution_plan_goals
    where id = '14000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      null::uuid,
      '12000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'live goal deletion preserves immutable snapshot identity'
);

update public.execution_plans
set status = 'dismissed',
    dismissed_at = now()
where id = '13000000-0000-4000-8000-000000000001';

select is(
  (
    select status
    from public.execution_plans
    where id = '13000000-0000-4000-8000-000000000001'
  ),
  'dismissed',
  'an active plan may transition to dismissed'
);

select throws_ok(
  $$
    update public.execution_plans
    set status = 'active',
        dismissed_at = null
    where id = '13000000-0000-4000-8000-000000000001'
  $$,
  '55000'::character(5),
  'invalid execution plan status transition',
  'dismissed plan snapshots cannot be reactivated'
);

select throws_ok(
  $$
    delete from public.execution_plans
    where id = '13000000-0000-4000-8000-000000000001'
  $$,
  '55000'::character(5),
  'execution plan history cannot be deleted',
  'execution plan history rejects direct deletion'
);

delete from auth.users
where id = '11111111-1111-4111-8111-111111111111';

select is(
  (
    select count(*)
    from public.execution_plans
    where owner_id = '11111111-1111-4111-8111-111111111111'
  ),
  0::bigint,
  'account deletion is the explicit immutable-history cascade exception'
);

select * from finish();
rollback;
