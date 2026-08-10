begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(9);

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
values
  (
    '91600000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Planner write boundary batch scope A',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    6,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '2 month - 1 day')::date,
    false
  ),
  (
    '91600000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'Planner write boundary batch scope B',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    6,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '2 month - 1 day')::date,
    false
  ),
  (
    '91600000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    'Planner write boundary untouched scope C',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    6,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '3 month - 1 day')::date,
    false
  );

insert into public.planner_items (
  owner_id,
  goal_id,
  unit_key,
  scheduled_date,
  original_scheduled_date,
  locked
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '91600000-0000-4000-8000-000000000001',
    'unit:scope-a',
    (date_trunc('month', current_date) + interval '2 day')::date,
    (date_trunc('month', current_date) + interval '2 day')::date,
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '91600000-0000-4000-8000-000000000002',
    'unit:scope-b',
    (date_trunc('month', current_date) + interval '1 month + 3 day')::date,
    (date_trunc('month', current_date) + interval '1 month + 3 day')::date,
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '91600000-0000-4000-8000-000000000003',
    'unit:scope-c',
    (date_trunc('month', current_date) + interval '2 month + 5 day')::date,
    (date_trunc('month', current_date) + interval '2 month + 5 day')::date,
    false
  );

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $tap$
  do $$
  declare
    v_scope_a date := date_trunc('month', current_date)::date;
    v_scope_b date := (date_trunc('month', current_date) + interval '1 month')::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule_batch(
      jsonb_build_array(
        jsonb_build_object(
          'scope_month', v_scope_a::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000001',
              'unit_key', 'unit:scope-a',
              'scheduled_date', (v_scope_a + 5)::text,
              'original_scheduled_date', (v_scope_a + 2)::text,
              'locked', false
            )
          )
        ),
        jsonb_build_object(
          'scope_month', v_scope_b::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000002',
              'unit_key', 'unit:scope-b',
              'scheduled_date', (v_scope_b + 7)::text,
              'original_scheduled_date', (v_scope_b + 3)::text,
              'locked', false
            )
          )
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  'set_planner_schedule_batch publishes two scope months in one call'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000001'
      and unit_key = 'unit:scope-a'
  ),
  (date_trunc('month', current_date) + interval '5 day')::date,
  'batch publish updates scope A rows'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000002'
      and unit_key = 'unit:scope-b'
  ),
  (date_trunc('month', current_date) + interval '1 month + 7 day')::date,
  'batch publish updates scope B rows'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000003'
      and unit_key = 'unit:scope-c'
  ),
  (date_trunc('month', current_date) + interval '2 month + 5 day')::date,
  'batch publish preserves rows from untouched scope months'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_a date := date_trunc('month', current_date)::date;
    v_scope_b date := (date_trunc('month', current_date) + interval '1 month')::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule_batch(
      jsonb_build_array(
        jsonb_build_object(
          'scope_month', v_scope_a::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000001',
              'unit_key', 'unit:scope-a',
              'scheduled_date', (v_scope_a + 8)::text,
              'original_scheduled_date', (v_scope_a + 5)::text,
              'locked', false
            )
          )
        ),
        jsonb_build_object(
          'scope_month', v_scope_b::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000002',
              'unit_key', 'unit:scope-b',
              'scheduled_date', ((v_scope_b + interval '1 month')::date)::text,
              'original_scheduled_date', (v_scope_b + 7)::text,
              'locked', false
            )
          )
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'scheduled_date_outside_scope_month',
  'batch publish fails when any scope payload is invalid'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000001'
      and unit_key = 'unit:scope-a'
  ),
  (date_trunc('month', current_date) + interval '5 day')::date,
  'batch publish failure rolls back prior scope writes'
);

do $$
declare
  v_scope_b date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_stale_digest text;
begin
  v_stale_digest := public.get_planner_schedule_digest();
  perform set_config('pgtap.stale_digest', v_stale_digest, true);
  perform *
  from public.set_planner_schedule(
    v_scope_b,
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', '91600000-0000-4000-8000-000000000002',
        'unit_key', 'unit:scope-b',
        'scheduled_date', (v_scope_b + 9)::text,
        'original_scheduled_date', (v_scope_b + 7)::text,
        'locked', false
      )
    ),
    v_stale_digest
  );
end;
$$;

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_a date := date_trunc('month', current_date)::date;
    v_scope_b date := (date_trunc('month', current_date) + interval '1 month')::date;
  begin
    perform *
    from public.set_planner_schedule_batch(
      jsonb_build_array(
        jsonb_build_object(
          'scope_month', v_scope_a::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000001',
              'unit_key', 'unit:scope-a',
              'scheduled_date', (v_scope_a + 5)::text,
              'original_scheduled_date', (v_scope_a + 2)::text,
              'locked', false
            )
          )
        ),
        jsonb_build_object(
          'scope_month', v_scope_b::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000002',
              'unit_key', 'unit:scope-b',
              'scheduled_date', (v_scope_b + 10)::text,
              'original_scheduled_date', (v_scope_b + 9)::text,
              'locked', false
            )
          )
        )
      ),
      current_setting('pgtap.stale_digest')
    );
  end;
  $$;
  $tap$,
  'P0001'::character(5),
  'stale_schedule',
  'batch publish rejects stale digest even when leading scope is a replay'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000002'
      and unit_key = 'unit:scope-b'
  ),
  (date_trunc('month', current_date) + interval '1 month + 9 day')::date,
  'stale digest rejection preserves concurrent scope writes'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_a date := date_trunc('month', current_date)::date;
    v_scope_b date := (date_trunc('month', current_date) + interval '1 month')::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule_batch(
      jsonb_build_array(
        jsonb_build_object(
          'scope_month', v_scope_a::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000001',
              'unit_key', 'unit:scope-a',
              'scheduled_date', (v_scope_a + 5)::text,
              'original_scheduled_date', (v_scope_a + 2)::text,
              'locked', false
            )
          )
        ),
        jsonb_build_object(
          'scope_month', v_scope_b::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000001',
              'unit_key', 'unit:scope-a',
              'scheduled_date', (v_scope_b + 6)::text,
              'original_scheduled_date', (v_scope_a + 5)::text,
              'locked', false
            )
          )
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'duplicate_goal_unit_across_scopes',
  'batch publish rejects duplicate goal+unit pairs across scopes'
);

reset role;
select * from finish();
rollback;
