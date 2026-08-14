begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(11);

insert into auth.users (id, email)
values
  ('b1000000-0000-4000-8000-000000000001', 'planner-unplaceable-owner@example.com'),
  ('b1000000-0000-4000-8000-000000000002', 'planner-unplaceable-other@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values
  ('b1000000-0000-4000-8000-000000000001', 'planner_unplaceable_owner', 'UTC'),
  ('b1000000-0000-4000-8000-000000000002', 'planner_unplaceable_other', 'UTC')
on conflict (id) do update
set timezone = excluded.timezone;

set local role service_role;
insert into public.goals (
  id,
  owner_id,
  title,
  category,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date
)
values (
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'Planner durable unplaceable goal',
  'test',
  'fixed_milestones',
  null,
  2,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '2 month - 1 day')::date
)
on conflict (id) do nothing;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', date_trunc('month', current_date)::date,
        'end_date', (date_trunc('month', current_date) + interval '1 month - 1 day')::date
      )
    ),
    '[]'::jsonb,
    public.get_planner_schedule_digest(),
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', 'b2000000-0000-4000-8000-000000000001',
        'requirement_fingerprint', repeat('a', 64),
        'policy_revision', 1,
        'effective_span_end', (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
        'unplaced_count', 2,
        'reason', 'capacity'
      )
    )
  )
  $tap$,
  'prepare writes durable unplaceable state when unresolved sessions remain'
);

select is(
  (
    select unplaced_count
    from public.planner_goal_unplaceable
    where owner_id = 'b1000000-0000-4000-8000-000000000001'
      and goal_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  2,
  'durable unplaceable row stores unresolved count'
);

select is(
  (
    select reason
    from public.planner_goal_unplaceable
    where owner_id = 'b1000000-0000-4000-8000-000000000001'
      and goal_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  'capacity',
  'durable unplaceable row stores reason'
);

select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000002',
  true
);

select is(
  (
    select count(*)::integer
    from public.planner_goal_unplaceable
    where goal_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  0,
  'RLS hides durable unplaceable rows from other users'
);

select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', date_trunc('month', current_date)::date,
        'end_date', (date_trunc('month', current_date) + interval '1 month - 1 day')::date
      )
    ),
    '[]'::jsonb,
    public.get_planner_schedule_digest(),
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', 'b2000000-0000-4000-8000-000000000001',
        'requirement_fingerprint', repeat('a', 64),
        'policy_revision', 1,
        'effective_span_end', (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
        'unplaced_count', 0,
        'reason', 'capacity'
      )
    )
  )
  $tap$,
  'prepare deletes durable unplaceable row when goal is fully resolved'
);

select is(
  (
    select count(*)::integer
    from public.planner_goal_unplaceable
    where owner_id = 'b1000000-0000-4000-8000-000000000001'
      and goal_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  0,
  'resolved goals clear durable unplaceable rows'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.planner_goal_unplaceable',
    'INSERT'
  ),
  'authenticated cannot insert durable unplaceable rows directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.planner_goal_unplaceable',
    'UPDATE'
  ),
  'authenticated cannot update durable unplaceable rows directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.planner_goal_unplaceable',
    'DELETE'
  ),
  'authenticated cannot delete durable unplaceable rows directly'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', date_trunc('month', current_date)::date,
        'end_date', (date_trunc('month', current_date) + interval '1 month - 1 day')::date
      )
    ),
    '[]'::jsonb,
    public.get_planner_schedule_digest(),
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', 'b2000000-0000-4000-8000-000000000001',
        'requirement_fingerprint', repeat('a', 64),
        'policy_revision', 1,
        'effective_span_end', (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
        'unplaced_count', -1,
        'reason', 'capacity'
      )
    )
  )
  $tap$,
  '22023',
  'invalid_unplaceable_payload',
  'prepare rejects invalid durable unplaceable payload values'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.prepare_planner_schedule(jsonb,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated owners can execute prepare with durable-state payload'
);

reset role;
select * from finish();
rollback;
