begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(10);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'planner-write-boundary-validation-owner@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'planner-write-boundary-validation-other@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values
  ('11111111-1111-4111-8111-111111111111', 'planner_write_boundary_validation_owner', 'UTC'),
  ('22222222-2222-4222-8222-222222222222', 'planner_write_boundary_validation_other', 'UTC')
on conflict (id) do update
set timezone = excluded.timezone;

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
  end_date
)
values
  (
    '91500000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Planner write-boundary validation goal (owner)',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    20,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '2 month - 1 day')::date
  ),
  (
    '91500000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    'Planner write-boundary validation goal (other owner)',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    20,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '2 month - 1 day')::date
  );

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_month date := date_trunc('month', current_date)::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      (v_scope_month + interval '1 month - 1 day')::date,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91500000-0000-4000-8000-000000000001',
          'unit_key', '   ',
          'scheduled_date', (v_scope_month + 1)::text,
          'locked', false
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'invalid_unit_key',
  'set_planner_schedule rejects blank unit keys'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_month date := date_trunc('month', current_date)::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      (v_scope_month + interval '1 month - 1 day')::date,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91500000-0000-4000-8000-000000000001',
          'unit_key', 'unit:invalid-time',
          'scheduled_date', (v_scope_month + 1)::text,
          'scheduled_time', '25:99',
          'locked', false
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'invalid_scheduled_time',
  'set_planner_schedule rejects invalid local times'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_month date := date_trunc('month', current_date)::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      (v_scope_month + interval '1 month - 1 day')::date,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91500000-0000-4000-8000-000000000001',
          'unit_key', 'unit:wrong-month',
          'scheduled_date', ((v_scope_month + interval '1 month')::date)::text,
          'locked', false
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'scheduled_date_outside_window',
  'set_planner_schedule rejects schedule rows outside the requested window'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_month date := date_trunc('month', current_date)::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      (v_scope_month + interval '1 month - 1 day')::date,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91500000-0000-4000-8000-000000000001',
          'unit_key', 'unit:dup',
          'scheduled_date', (v_scope_month + 1)::text,
          'locked', false
        ),
        jsonb_build_object(
          'goal_id', '91500000-0000-4000-8000-000000000001',
          'unit_key', 'unit:dup',
          'scheduled_date', (v_scope_month + 2)::text,
          'locked', false
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'duplicate_goal_unit',
  'set_planner_schedule rejects duplicate goal/unit rows'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_month date := date_trunc('month', current_date)::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      (v_scope_month + interval '1 month - 1 day')::date,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91500000-0000-4000-8000-000000000001',
          'unit_key', 'unit:date-a',
          'scheduled_date', (v_scope_month + 3)::text,
          'locked', false
        ),
        jsonb_build_object(
          'goal_id', '91500000-0000-4000-8000-000000000001',
          'unit_key', 'unit:date-b',
          'scheduled_date', (v_scope_month + 3)::text,
          'locked', false
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'duplicate_goal_date',
  'set_planner_schedule rejects duplicate goal/date rows'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_month date := date_trunc('month', current_date)::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      (v_scope_month + interval '1 month - 1 day')::date,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91500000-0000-4000-8000-000000000002',
          'unit_key', 'unit:foreign-owner',
          'scheduled_date', (v_scope_month + 1)::text,
          'locked', false
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'unknown_goal',
  'set_planner_schedule rejects goals not owned by the caller'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_month date := date_trunc('month', current_date)::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      (v_scope_month + interval '1 month - 1 day')::date,
      '{}'::jsonb,
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'invalid_schedule_payload',
  'set_planner_schedule rejects non-array payloads'
);

select throws_ok(
  $tap$
  do $$
  begin
    perform *
    from public.set_planner_schedule(
      current_date,
      (current_date - 1),
      '[]'::jsonb,
      ''
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'invalid_schedule_window',
  'set_planner_schedule rejects inverted date windows'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_month date := date_trunc('month', current_date)::date;
  begin
    perform *
    from public.set_planner_schedule(
      (v_scope_month + 9),
      (v_scope_month + interval '1 month - 1 day')::date,
      '[]'::jsonb,
      ''
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'invalid_schedule_window',
  'set_planner_schedule rejects mid-month publish windows'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_start date := date_trunc('month', current_date)::date;
    v_end date := (v_start + interval '13 month' - interval '1 day')::date;
  begin
    perform *
    from public.set_planner_schedule(
      v_start,
      v_end,
      '[]'::jsonb,
      ''
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'invalid_schedule_window',
  'set_planner_schedule rejects publish windows longer than 366 days'
);

reset role;
select * from finish();
rollback;
