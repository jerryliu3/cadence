begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(3);

set local role service_role;

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
  '91700000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Publish issue null-goal regression goal',
  null,
  'test',
  null,
  'recurring',
  'weekly',
  1,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '3 month - 1 day')::date,
  false
);

create temporary table publish_issue_fix_result (
  plan_id uuid not null
) on commit drop;

select lives_ok(
  $tap$
  do $$
  declare
    v_scope_month date := (date_trunc('month', current_date) + interval '1 month')::date;
    v_item_date date := (date_trunc('month', current_date) + interval '1 month + 5 day')::date;
    v_plan_id uuid;
  begin
    select published.plan_id
    into v_plan_id
    from public.publish_execution_plan_service(
      '11111111-1111-4111-8111-111111111111',
      v_scope_month,
      'overlap_v1',
      'America/New_York',
      'manual',
      '{}'::jsonb,
      jsonb_build_object(
        'schemaVersion', '1',
        'timezone', 'America/New_York',
        'timezoneConfirmedAt', '2026-08-02T00:00:00.000Z',
        'restWeekdays', '[]'::jsonb,
        'blackoutRanges', '[]'::jsonb
      ),
      repeat('b', 64),
      '1',
      'ordered-dp-v1',
      '1',
      '1',
      '1',
      '1',
      'complete',
      'all_units_placed',
      'unverified',
      false,
      true,
      '24100000-0000-4000-8000-000000000001',
      repeat('e', 64),
      (
        select canonical_revision
        from private.planner_state
        where owner_id = '11111111-1111-4111-8111-111111111111'
      ),
      (
        select execution_revision
        from private.planner_state
        where owner_id = '11111111-1111-4111-8111-111111111111'
      ),
      null,
      null,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91700000-0000-4000-8000-000000000001',
          'title', 'Publish issue null-goal regression goal',
          'category', 'test',
          'color', null,
          'start_date', v_scope_month,
          'end_date', (v_scope_month + interval '1 month - 1 day')::date,
          'requirement_kind', 'cadence',
          'requirement_fingerprint', repeat('1', 64),
          'requirement_snapshot', '{}'::jsonb,
          'assessment_snapshot', '{}'::jsonb,
          'assessment_input_hash', repeat('2', 64),
          'admissible_credit_basis', '{}'::jsonb,
          'generation_summary', '{}'::jsonb
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'date', v_item_date,
          'is_rest_day', false,
          'is_blocked', false,
          'preference_cost', 0,
          'resolved_policy', '{}'::jsonb,
          'generation_session_count', 1,
          'generation_effort_minutes', 25
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91700000-0000-4000-8000-000000000001',
          'unit_key', 'cadence:publish-issue-null-goal',
          'requirement_kind', 'cadence',
          'ordinal', 1,
          'period_key', null,
          'label', 'Regression publish unit',
          'credit_window_start', v_item_date,
          'credit_window_end', v_item_date,
          'placement_window_start', v_scope_month,
          'placement_window_end', (v_scope_month + interval '1 month - 1 day')::date,
          'classification', 'future',
          'miss_policy', 'roll_forward',
          'rest_eligible', true,
          'max_per_day', 1,
          'credited_completion_id', null,
          'credited_completion_date', null,
          'credit_state', 'uncredited',
          'original_scheduled_date', v_item_date,
          'scheduled_date', v_item_date,
          'locked', false,
          'locked_at', null,
          'estimated_minutes', 25,
          'priority', 1,
          'scheduled_time_override', null,
          'effective_scheduled_local_time', null
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', null,
          'issue_code', 'placement_shortfall',
          'severity', 'warning',
          'unit_key', null,
          'details', null
        )
      )
    ) as published;

    if v_plan_id is null then
      raise exception using
        errcode = 'P0001',
        message = 'publish did not return a plan id';
    end if;

    insert into publish_issue_fix_result (plan_id) values (v_plan_id);
  end;
  $$;
  $tap$,
  'publish accepts issue rows with null goal_id'
);

select is(
  (
    select count(*)::integer
    from public.execution_plan_issues
    where plan_id = (select plan_id from publish_issue_fix_result limit 1)
      and issue_code = 'placement_shortfall'
      and plan_goal_id is null
  ),
  1,
  'publish persists null-goal issues without a plan_goal_id'
);

select is(
  (
    select details
    from public.execution_plan_issues
    where plan_id = (select plan_id from publish_issue_fix_result limit 1)
      and issue_code = 'placement_shortfall'
    limit 1
  ),
  '{}'::jsonb,
  'publish normalizes null issue details to empty json object'
);

reset role;
select * from finish();
rollback;
