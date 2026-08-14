begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(34);

insert into auth.users (id, email)
values
  ('a1000000-0000-4000-8000-000000000001', 'planner-prepare-owner@example.com'),
  ('a1000000-0000-4000-8000-000000000002', 'planner-prepare-other@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values
  ('a1000000-0000-4000-8000-000000000001', 'planner_prepare_owner', 'UTC'),
  ('a1000000-0000-4000-8000-000000000002', 'planner_prepare_other', 'UTC')
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
values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'Planner preparation replacement goal',
    'test',
    'recurring',
    'weekly',
    10,
    (date_trunc('month', current_date) - interval '1 month')::date,
    (date_trunc('month', current_date) + interval '6 month - 1 day')::date
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'Planner preparation target goal',
    'test',
    'recurring',
    'weekly',
    2,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '6 month - 1 day')::date
  ),
  (
    'a2000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000001',
    'Planner preparation cleanup goal',
    'test',
    'fixed_milestones',
    null,
    3,
    (date_trunc('month', current_date) - interval '1 month')::date,
    (date_trunc('month', current_date) + interval '6 month - 1 day')::date
  ),
  (
    'a2000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000002',
    'Planner preparation foreign goal',
    'test',
    'recurring',
    'weekly',
    5,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '6 month - 1 day')::date
  );

insert into public.planner_items (
  owner_id,
  goal_id,
  unit_key,
  scheduled_date,
  original_scheduled_date,
  scheduled_time,
  locked
)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'total:1',
    (date_trunc('month', current_date) + interval '1 month + 1 day')::date,
    (date_trunc('month', current_date) + interval '1 month + 1 day')::date,
    null,
    false
  ),
  (
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'total:3',
    (date_trunc('month', current_date) + interval '2 month + 2 day')::date,
    (date_trunc('month', current_date) + interval '2 month + 2 day')::date,
    null,
    false
  ),
  (
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'total:2',
    (date_trunc('month', current_date) + interval '3 month + 3 day')::date,
    (date_trunc('month', current_date) + interval '3 month + 3 day')::date,
    null,
    false
  ),
  (
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000003',
    'milestone:2',
    (current_date - 1),
    (current_date - 1),
    null,
    true
  ),
  (
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000003',
    'milestone:3',
    (date_trunc('month', current_date) + interval '4 month + 4 day')::date,
    (date_trunc('month', current_date) + interval '4 month + 4 day')::date,
    '09:15',
    true
  );

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    select *
    from public.prepare_planner_schedule('[]'::jsonb, '[]'::jsonb, '')
  $$,
  '28000',
  'authentication_required',
  'preparation requires an authenticated owner'
);

select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
      ),
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '3 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '4 month - 1 day')::date
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000004',
        'unit_key', 'total:1',
        'scheduled_date', (date_trunc('month', current_date) + interval '3 month + 1 day')::date,
        'locked', false
      )
    ),
    public.get_planner_schedule_digest()
  )
  $tap$,
  '22023',
  'unknown_goal',
  'preparation rejects goals owned by another user'
);

select is(
  (
    select count(*)::integer
    from public.planner_items
    where goal_id = 'a2000000-0000-4000-8000-000000000001'
      and scheduled_date in (
        (date_trunc('month', current_date) + interval '1 month + 1 day')::date,
        (date_trunc('month', current_date) + interval '3 month + 3 day')::date
      )
  ),
  2,
  'full payload validation happens before either window is deleted'
);

select throws_ok(
  $$
    select *
    from public.prepare_planner_schedule(
      '[]'::jsonb,
      '[]'::jsonb,
      public.get_planner_schedule_digest()
    )
  $$,
  '22023',
  'invalid_schedule_windows_payload',
  'preparation rejects an empty window list'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '3 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '4 month - 1 day')::date
      ),
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
      )
    ),
    '[]'::jsonb,
    public.get_planner_schedule_digest()
  )
  $tap$,
  '22023',
  'unordered_schedule_windows',
  'preparation requires windows in ascending order'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', date_trunc('month', current_date)::date,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
      ),
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '3 month - 1 day')::date
      )
    ),
    '[]'::jsonb,
    public.get_planner_schedule_digest()
  )
  $tap$,
  '22023',
  'overlapping_schedule_windows',
  'preparation rejects overlapping windows'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 day')::date,
        'end_date', (date_trunc('month', current_date) + interval '1 month - 1 day')::date
      )
    ),
    '[]'::jsonb,
    public.get_planner_schedule_digest()
  )
  $tap$,
  '22023',
  'invalid_schedule_window',
  'preparation rejects windows that are not whole-month aligned'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', date_trunc('month', current_date)::date,
        'end_date', (date_trunc('month', current_date) + interval '13 month - 1 day')::date
      )
    ),
    '[]'::jsonb,
    public.get_planner_schedule_digest()
  )
  $tap$,
  '22023',
  'invalid_schedule_window',
  'preparation rejects individual windows longer than 366 days'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', date_trunc('month', current_date)::date,
        'end_date', (date_trunc('month', current_date) + interval '12 month - 1 day')::date
      ),
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '12 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '24 month - 1 day')::date
      ),
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '24 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '25 month - 1 day')::date
      )
    ),
    '[]'::jsonb,
    public.get_planner_schedule_digest()
  )
  $tap$,
  '22023',
  'schedule_window_month_limit_exceeded',
  'preparation rejects payloads covering more than 24 distinct months'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
      )
    ),
    '{}'::jsonb,
    public.get_planner_schedule_digest()
  )
  $tap$,
  '22023',
  'invalid_schedule_payload',
  'preparation rejects non-array item payloads'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000001',
        'unit_key', 'total:4',
        'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 5 day')::date
      ),
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000001',
        'unit_key', 'total:4',
        'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 6 day')::date
      )
    ),
    public.get_planner_schedule_digest()
  )
  $tap$,
  '22023',
  'duplicate_goal_unit',
  'preparation rejects duplicate goal and unit identities'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000001',
        'unit_key', 'total:5',
        'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 7 day')::date
      ),
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000001',
        'unit_key', 'total:6',
        'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 7 day')::date
      )
    ),
    public.get_planner_schedule_digest()
  )
  $tap$,
  '22023',
  'duplicate_goal_date',
  'preparation rejects duplicate goal and scheduled-date entries'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000001',
        'unit_key', 'total:7',
        'scheduled_date', (date_trunc('month', current_date) + interval '2 month + 1 day')::date
      )
    ),
    public.get_planner_schedule_digest()
  )
  $tap$,
  '22023',
  'scheduled_date_outside_windows',
  'preparation rejects item dates outside every supplied window'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '6 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '7 month - 1 day')::date
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000002',
        'unit_key', 'total:1',
        'scheduled_date', (date_trunc('month', current_date) + interval '6 month + 1 day')::date
      )
    ),
    public.get_planner_schedule_digest()
  )
  $tap$,
  'P0001',
  'scheduled_outside_goal_lifetime',
  'preparation rejects item dates outside the current goal lifetime'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000002',
        'unit_key', 'total:1',
        'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 1 day')::date
      ),
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000002',
        'unit_key', 'total:2',
        'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 2 day')::date
      ),
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000002',
        'unit_key', 'total:3',
        'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 3 day')::date
      )
    ),
    public.get_planner_schedule_digest()
  )
  $tap$,
  'P0001',
  'exceeds_target_count',
  'preparation rejects snapshots exceeding a goal target count'
);

create temp table prepare_results (
  phase text primary key,
  before_digest text,
  schedule_digest text,
  upserted_count integer,
  deleted_count integer,
  replayed boolean
);

set local role service_role;
update public.goals
set target_count = 2
where id = 'a2000000-0000-4000-8000-000000000003';
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $tap$
  do $$
  declare
    v_before text := public.get_planner_schedule_digest();
    v_result record;
  begin
    select *
    into v_result
    from public.prepare_planner_schedule(
      jsonb_build_array(
        jsonb_build_object(
          'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
          'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
        ),
        jsonb_build_object(
          'start_date', (date_trunc('month', current_date) + interval '3 month')::date,
          'end_date', (date_trunc('month', current_date) + interval '4 month - 1 day')::date
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', 'a2000000-0000-4000-8000-000000000001',
          'unit_key', 'total:1',
          'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 8 day')::date,
          'original_scheduled_date', (date_trunc('month', current_date) + interval '1 month + 4 day')::date,
          'scheduled_time', '07:45',
          'locked', true
        ),
        jsonb_build_object(
          'goal_id', 'a2000000-0000-4000-8000-000000000001',
          'unit_key', 'total:2',
          'scheduled_date', (date_trunc('month', current_date) + interval '3 month + 9 day')::date,
          'original_scheduled_date', (date_trunc('month', current_date) + interval '3 month + 5 day')::date,
          'scheduled_time', '18:30',
          'locked', false
        )
      ),
      v_before
    );

    insert into prepare_results
    values (
      'write',
      v_before,
      v_result.schedule_digest,
      v_result.upserted_count,
      v_result.deleted_count,
      v_result.replayed
    );
  end;
  $$;
  $tap$,
  'preparation atomically replaces two ordered windows'
);

select is(
  (select upserted_count from prepare_results where phase = 'write'),
  2,
  'preparation reports both inserted snapshot rows'
);

select is(
  (select deleted_count from prepare_results where phase = 'write'),
  3,
  'preparation reports two replaced rows and one invalid future cleanup'
);

select is(
  (select replayed from prepare_results where phase = 'write'),
  false,
  'a changed preparation reports that it was not replayed'
);

select is(
  (
    select count(*)::integer
    from public.planner_items
    where goal_id = 'a2000000-0000-4000-8000-000000000001'
      and scheduled_date in (
        (date_trunc('month', current_date) + interval '1 month + 1 day')::date,
        (date_trunc('month', current_date) + interval '3 month + 3 day')::date
      )
  ),
  0,
  'replacement removes the prior snapshots from both supplied windows'
);

select results_eq(
  $$
    select unit_key, scheduled_time, locked, (original_scheduled_date - scheduled_date)::integer
    from public.planner_items
    where goal_id = 'a2000000-0000-4000-8000-000000000001'
      and unit_key in ('total:1', 'total:2')
    order by unit_key
  $$,
  $$
    values
      ('total:1'::text, '07:45'::text, true, -4),
      ('total:2'::text, '18:30'::text, false, -4)
  $$,
  'preparation preserves supplied original dates, local times, and locks'
);

select is(
  (
    select unit_key
    from public.planner_items
    where goal_id = 'a2000000-0000-4000-8000-000000000001'
      and unit_key = 'total:3'
  ),
  'total:3',
  'preparation leaves valid rows outside supplied windows unchanged'
);

select is(
  (
    select unit_key
    from public.planner_items
    where goal_id = 'a2000000-0000-4000-8000-000000000003'
      and unit_key = 'milestone:2'
  ),
  'milestone:2',
  'preparation does not delete valid historical rows outside supplied windows'
);

select is(
  (
    select count(*)::integer
    from public.planner_items
    where goal_id = 'a2000000-0000-4000-8000-000000000003'
      and unit_key = 'milestone:3'
  ),
  0,
  'preparation removes future ordinal rows invalidated by a reduced target'
);

select throws_ok(
  $tap$
  select *
  from public.prepare_planner_schedule(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
      ),
      jsonb_build_object(
        'start_date', (date_trunc('month', current_date) + interval '3 month')::date,
        'end_date', (date_trunc('month', current_date) + interval '4 month - 1 day')::date
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'goal_id', 'a2000000-0000-4000-8000-000000000001',
        'unit_key', 'total:4',
        'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 10 day')::date
      )
    ),
    (select before_digest from prepare_results where phase = 'write')
  )
  $tap$,
  'P0001',
  'stale_schedule',
  'preparation rejects a changed snapshot with a stale owner digest'
);

select lives_ok(
  $tap$
  do $$
  declare
    v_result record;
  begin
    select *
    into v_result
    from public.prepare_planner_schedule(
      jsonb_build_array(
        jsonb_build_object(
          'start_date', (date_trunc('month', current_date) + interval '1 month')::date,
          'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date
        ),
        jsonb_build_object(
          'start_date', (date_trunc('month', current_date) + interval '3 month')::date,
          'end_date', (date_trunc('month', current_date) + interval '4 month - 1 day')::date
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', 'a2000000-0000-4000-8000-000000000001',
          'unit_key', 'total:1',
          'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 8 day')::date,
          'original_scheduled_date', (date_trunc('month', current_date) + interval '1 month + 4 day')::date,
          'scheduled_time', '07:45',
          'locked', true
        ),
        jsonb_build_object(
          'goal_id', 'a2000000-0000-4000-8000-000000000001',
          'unit_key', 'total:2',
          'scheduled_date', (date_trunc('month', current_date) + interval '3 month + 9 day')::date,
          'original_scheduled_date', (date_trunc('month', current_date) + interval '3 month + 5 day')::date,
          'scheduled_time', '18:30',
          'locked', false
        )
      ),
      (select before_digest from prepare_results where phase = 'write')
    );

    insert into prepare_results
    values (
      'replay',
      null,
      v_result.schedule_digest,
      v_result.upserted_count,
      v_result.deleted_count,
      v_result.replayed
    );
  end;
  $$;
  $tap$,
  'an exact multi-window replay succeeds before stale-digest rejection'
);

select is(
  (select replayed from prepare_results where phase = 'replay'),
  true,
  'exact preparation reports replayed true'
);

select results_eq(
  $$
    select upserted_count, deleted_count, schedule_digest =
      (select schedule_digest from prepare_results where phase = 'write')
    from prepare_results
    where phase = 'replay'
  $$,
  $$ values (0, 0, true) $$,
  'exact replay performs no writes and returns the current digest'
);

select ok(
  pg_get_functiondef(
    'public.prepare_planner_schedule(jsonb,jsonb,text)'::regprocedure
  ) like '%pg_advisory_xact_lock%planner_owner_lock_key(v_owner)%',
  'preparation serializes owner writes with the canonical transaction lock'
);

select ok(
  not has_function_privilege(
    'public',
    'public.prepare_planner_schedule(jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'PUBLIC cannot execute preparation'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.prepare_planner_schedule(jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'anon cannot execute preparation'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.prepare_planner_schedule(jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'authenticated owners can execute preparation'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.prepare_planner_schedule(jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'service_role can execute preparation'
);

select ok(
  to_regprocedure('public.set_planner_schedule_batch(jsonb,text)') is null,
  'preparation does not resurrect the dropped generic batch write RPC'
);

reset role;
select * from finish();
rollback;
