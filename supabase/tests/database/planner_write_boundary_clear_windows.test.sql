begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(9);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner-write-boundary-clear-windows-owner@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner_write_boundary_clear_windows_owner',
  'UTC'
)
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
    '91700000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Planner clear windows scope A',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    6,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '3 month - 1 day')::date
  ),
  (
    '91700000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'Planner clear windows scope B',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    6,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '3 month - 1 day')::date
  ),
  (
    '91700000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    'Planner clear windows untouched gap',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    6,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '3 month - 1 day')::date
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
    '91700000-0000-4000-8000-000000000001',
    'unit:scope-a',
    (date_trunc('month', current_date) + interval '2 day')::date,
    (date_trunc('month', current_date) + interval '2 day')::date,
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '91700000-0000-4000-8000-000000000002',
    'unit:scope-c',
    (date_trunc('month', current_date) + interval '2 month + 4 day')::date,
    (date_trunc('month', current_date) + interval '2 month + 4 day')::date,
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '91700000-0000-4000-8000-000000000003',
    'unit:scope-gap',
    (date_trunc('month', current_date) + interval '1 month + 5 day')::date,
    (date_trunc('month', current_date) + interval '1 month + 5 day')::date,
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
    v_scope_c date := (date_trunc('month', current_date) + interval '2 month')::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.clear_planner_schedule_windows(
      jsonb_build_array(
        jsonb_build_object(
          'start_date', v_scope_a::text,
          'end_date', (v_scope_a + interval '1 month - 1 day')::date::text
        ),
        jsonb_build_object(
          'start_date', v_scope_c::text,
          'end_date', (v_scope_c + interval '1 month - 1 day')::date::text
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  'clear_planner_schedule_windows deletes two non-contiguous month windows'
);

select is(
  (
    select count(*)::integer
    from public.planner_items
    where goal_id = '91700000-0000-4000-8000-000000000001'
  ),
  0,
  'clear-windows deletes the first requested month'
);

select is(
  (
    select count(*)::integer
    from public.planner_items
    where goal_id = '91700000-0000-4000-8000-000000000002'
  ),
  0,
  'clear-windows deletes the later requested month'
);

select is(
  (
    select unit_key
    from public.planner_items
    where goal_id = '91700000-0000-4000-8000-000000000003'
  ),
  'unit:scope-gap',
  'clear-windows leaves the unrequested gap month intact'
);

select lives_ok(
  $tap$
  do $$
  declare
    v_scope_a date := date_trunc('month', current_date)::date;
    v_scope_c date := (date_trunc('month', current_date) + interval '2 month')::date;
  begin
    perform *
    from public.clear_planner_schedule_windows(
      jsonb_build_array(
        jsonb_build_object(
          'start_date', v_scope_a::text,
          'end_date', (v_scope_a + interval '1 month - 1 day')::date::text
        ),
        jsonb_build_object(
          'start_date', v_scope_c::text,
          'end_date', (v_scope_c + interval '1 month - 1 day')::date::text
        )
      ),
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    );
  end;
  $$;
  $tap$,
  'clear-windows replays already-empty windows without a matching digest'
);

select throws_ok(
  $tap$
  select *
  from public.clear_planner_schedule_windows(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 day')::date::text,
        'end_date', (date_trunc('month', current_date) + interval '1 month - 1 day')::date::text
      )
    ),
    public.get_planner_schedule_digest()
  );
  $tap$,
  '22023',
  'invalid_schedule_window',
  'clear-windows rejects mid-month starts'
);

select throws_ok(
  $tap$
  select *
  from public.clear_planner_schedule_windows(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', date_trunc('month', current_date)::date::text,
        'end_date', (date_trunc('month', current_date) + interval '1 month - 1 day')::date::text
      ),
      jsonb_build_object(
        'start_date', date_trunc('month', current_date)::date::text,
        'end_date', (date_trunc('month', current_date) + interval '1 month - 1 day')::date::text
      )
    ),
    public.get_planner_schedule_digest()
  );
  $tap$,
  '22023',
  'duplicate_schedule_window',
  'clear-windows rejects duplicate windows'
);

select throws_ok(
  $tap$
  select *
  from public.clear_planner_schedule_windows(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', date_trunc('month', current_date)::date::text,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date::text
      ),
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 month')::date::text,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date::text
      )
    ),
    public.get_planner_schedule_digest()
  );
  $tap$,
  '22023',
  'overlapping_schedule_windows',
  'clear-windows rejects overlapping windows'
);

select throws_ok(
  $tap$
  select *
  from public.clear_planner_schedule_windows(
    '[]'::jsonb,
    public.get_planner_schedule_digest()
  );
  $tap$,
  '22023',
  'invalid_schedule_windows_payload',
  'clear-windows rejects an empty window list'
);

select * from finish();
rollback;
