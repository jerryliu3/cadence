begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(17);

create temporary table xp_test_context (
  test_date date not null,
  second_test_date date not null,
  baseline_total_xp integer not null
) on commit drop;

insert into xp_test_context (test_date, second_test_date, baseline_total_xp)
select
  current_date - 31,
  current_date - 30,
  coalesce(
    (
      select profile.total_xp
      from public.xp_profiles profile
      where profile.user_id = '11111111-1111-4111-8111-111111111111'
    ),
    0
  );

grant select on xp_test_context to authenticated, service_role;

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
  '1a000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'XP threshold test goal',
  'Used to validate goal-achievement XP threshold behavior.',
  'test',
  '#111827',
  'fixed_milestones',
  null,
  2,
  current_date - 120,
  current_date + 120,
  false
)
on conflict (id) do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  exists (
    select 1
    from public.xp_profiles profile
    where profile.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'xp profile is initialized for seeded users'
);

select public.mark_goal_complete(
  '10000000-0000-4000-8000-000000000003',
  (select test_date from xp_test_context)
);

select is(
  (
    select profile.total_xp
    from public.xp_profiles profile
    where profile.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  (
    select context.baseline_total_xp + 30
    from xp_test_context context
  ),
  'first mark awards manual plus cascaded XP'
);

select public.mark_goal_complete(
  '10000000-0000-4000-8000-000000000003',
  (select test_date from xp_test_context)
);

select is(
  (
    select profile.total_xp
    from public.xp_profiles profile
    where profile.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  (
    select context.baseline_total_xp + 30
    from xp_test_context context
  ),
  'duplicate mark is idempotent for XP totals'
);

select is(
  (
    select count(*)
    from public.xp_ledger ledger
    where ledger.user_id = '11111111-1111-4111-8111-111111111111'
      and ledger.completed_on = (select context.test_date from xp_test_context context)
      and ledger.event_type = 'award'
      and ledger.goal_id in (
        '10000000-0000-4000-8000-000000000003'::uuid,
        '10000000-0000-4000-8000-000000000004'::uuid,
        '10000000-0000-4000-8000-000000000005'::uuid
      )
  ),
  3::bigint,
  'ledger records one award event per completion fact'
);

select is(
  (
    select coalesce(sum(ledger.xp_delta), 0)
    from public.xp_ledger ledger
    where ledger.user_id = '11111111-1111-4111-8111-111111111111'
      and ledger.completed_on = (select context.test_date from xp_test_context context)
      and ledger.event_type = 'award'
      and ledger.goal_id in (
        '10000000-0000-4000-8000-000000000004'::uuid,
        '10000000-0000-4000-8000-000000000005'::uuid
      )
  ),
  10::bigint,
  'linked cascades award 25 percent of manual completion XP'
);

select public.unmark_goal_complete(
  '10000000-0000-4000-8000-000000000003',
  (select test_date from xp_test_context)
);

select is(
  (
    select profile.total_xp
    from public.xp_profiles profile
    where profile.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  (
    select context.baseline_total_xp
    from xp_test_context context
  ),
  'unmark fully reverses awarded XP'
);

select is(
  (
    select count(*)
    from public.xp_ledger ledger
    where ledger.user_id = '11111111-1111-4111-8111-111111111111'
      and ledger.completed_on = (select context.test_date from xp_test_context context)
      and ledger.event_type = 'reversal'
      and ledger.goal_id in (
        '10000000-0000-4000-8000-000000000003'::uuid,
        '10000000-0000-4000-8000-000000000004'::uuid,
        '10000000-0000-4000-8000-000000000005'::uuid
      )
  ),
  3::bigint,
  'reversal emits one ledger event per removed completion fact'
);

select is(
  (
    select count(*)
    from public.completions completion
    where completion.user_id = '11111111-1111-4111-8111-111111111111'
      and completion.completed_on = (select context.test_date from xp_test_context context)
      and completion.goal_id in (
        '10000000-0000-4000-8000-000000000003'::uuid,
        '10000000-0000-4000-8000-000000000004'::uuid,
        '10000000-0000-4000-8000-000000000005'::uuid
      )
  ),
  0::bigint,
  'reversal removes completion facts for root and cascaded goals'
);

select public.mark_goal_complete(
  '1a000000-0000-4000-8000-000000000001',
  (select test_date from xp_test_context)
);

select is(
  (
    select profile.total_xp
    from public.xp_profiles profile
    where profile.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  (
    select context.baseline_total_xp + 20
    from xp_test_context context
  ),
  'first targeted completion awards only completion XP before achievement'
);

select public.mark_goal_complete(
  '1a000000-0000-4000-8000-000000000001',
  (select second_test_date from xp_test_context)
);

select is(
  (
    select profile.total_xp
    from public.xp_profiles profile
    where profile.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  (
    select context.baseline_total_xp + 140
    from xp_test_context context
  ),
  'threshold crossing awards completion XP plus one-time achievement XP'
);

select is(
  (
    select count(*)
    from public.xp_ledger ledger
    where ledger.user_id = '11111111-1111-4111-8111-111111111111'
      and ledger.goal_id = '1a000000-0000-4000-8000-000000000001'
      and ledger.event_type = 'goal_achievement_award'
  ),
  1::bigint,
  'achievement XP awards exactly once at threshold crossing'
);

select public.unmark_goal_complete(
  '1a000000-0000-4000-8000-000000000001',
  (select second_test_date from xp_test_context)
);

select is(
  (
    select profile.total_xp
    from public.xp_profiles profile
    where profile.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  (
    select context.baseline_total_xp + 20
    from xp_test_context context
  ),
  'dropping below threshold reverses completion and achievement XP'
);

select is(
  (
    select count(*)
    from public.xp_ledger ledger
    where ledger.user_id = '11111111-1111-4111-8111-111111111111'
      and ledger.goal_id = '1a000000-0000-4000-8000-000000000001'
      and ledger.event_type = 'goal_achievement_reversal'
  ),
  1::bigint,
  'achievement reversal emits exactly once when threshold is lost'
);

reset role;

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
  '19000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  date_trunc('month', current_date)::date,
  'overlap_v1',
  'UTC',
  1,
  'active',
  'manual',
  '{}'::jsonb,
  '{"schemaVersion":"1","timezone":"UTC"}'::jsonb,
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
  '19000000-0000-4000-8000-000000000099',
  repeat('b', 64)
from private.planner_state state
where state.owner_id = '11111111-1111-4111-8111-111111111111';

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
  '19000000-0000-4000-8000-000000000011',
  '19000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000011',
  'Practice presentations 12 times',
  'career',
  '#0ea5e9',
  current_date - 20,
  current_date + 20,
  'cadence',
  repeat('c', 64),
  '{
    "schemaVersion": "1",
    "requirement": {
      "kind": "cadence",
      "targetCount": 12,
      "spacingHint": "weekly",
      "maxPerDay": 1
    }
  }'::jsonb,
  '{"schemaVersion": "1", "estimatedMinutesPerSession": 30}'::jsonb,
  repeat('d', 64),
  '{"completionToUnit": {}}'::jsonb,
  '{}'::jsonb
);

set local role service_role;

select goal_id
from public.set_execution_plan_goal_date_fact_service(
  '11111111-1111-4111-8111-111111111111',
  '19000000-0000-4000-8000-000000000011',
  current_date - 3,
  'present',
  (
    select canonical_revision
    from private.planner_state
    where owner_id = '11111111-1111-4111-8111-111111111111'
  ),
  (
    select execution_revision
    from private.planner_state
    where owner_id = '11111111-1111-4111-8111-111111111111'
  )
);

select is(
  (
    select profile.total_xp
    from public.xp_profiles profile
    where profile.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  (
    select context.baseline_total_xp + 40
    from xp_test_context context
  ),
  'planner goal date-fact completion awards manual XP'
);

select goal_id
from public.set_execution_plan_goal_date_fact_service(
  '11111111-1111-4111-8111-111111111111',
  '19000000-0000-4000-8000-000000000011',
  current_date - 3,
  'absent',
  (
    select canonical_revision
    from private.planner_state
    where owner_id = '11111111-1111-4111-8111-111111111111'
  ),
  (
    select execution_revision
    from private.planner_state
    where owner_id = '11111111-1111-4111-8111-111111111111'
  )
);

select is(
  (
    select profile.total_xp
    from public.xp_profiles profile
    where profile.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  (
    select context.baseline_total_xp + 20
    from xp_test_context context
  ),
  'planner goal date-fact removal reverses the awarded XP'
);

select is(
  (
    select count(*)
    from public.xp_ledger ledger
    where ledger.user_id = '11111111-1111-4111-8111-111111111111'
      and ledger.goal_id = '10000000-0000-4000-8000-000000000011'
      and ledger.completed_on = current_date - 3
      and ledger.event_type = 'award'
  ),
  1::bigint,
  'planner completion path records a single award event'
);

select is(
  (
    select count(*)
    from public.xp_ledger ledger
    where ledger.user_id = '11111111-1111-4111-8111-111111111111'
      and ledger.goal_id = '10000000-0000-4000-8000-000000000011'
      and ledger.completed_on = current_date - 3
      and ledger.event_type = 'reversal'
  ),
  1::bigint,
  'planner completion removal path records a single reversal event'
);

reset role;
select * from finish();
rollback;
