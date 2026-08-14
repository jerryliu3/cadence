begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(23);

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
    (date_trunc('month', current_date) + interval '2 month - 1 day')::date
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
    (date_trunc('month', current_date) + interval '2 month - 1 day')::date
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
          'start_date', v_scope_a::text,
          'end_date', (v_scope_a + interval '1 month - 1 day')::date::text,
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
          'start_date', v_scope_b::text,
          'end_date', (v_scope_b + interval '1 month - 1 day')::date::text,
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
  'set_planner_schedule_batch publishes two date windows in one call'
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
          'start_date', v_scope_a::text,
          'end_date', (v_scope_a + interval '1 month - 1 day')::date::text,
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
          'start_date', v_scope_b::text,
          'end_date', (v_scope_b + interval '1 month - 1 day')::date::text,
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
  'scheduled_date_outside_window',
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
    (v_scope_b + interval '1 month - 1 day')::date,
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
          'start_date', v_scope_a::text,
          'end_date', (v_scope_a + interval '1 month - 1 day')::date::text,
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
          'start_date', v_scope_b::text,
          'end_date', (v_scope_b + interval '1 month - 1 day')::date::text,
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
          'start_date', v_scope_a::text,
          'end_date', (v_scope_a + interval '1 month - 1 day')::date::text,
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
          'start_date', v_scope_b::text,
          'end_date', (v_scope_b + interval '1 month - 1 day')::date::text,
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

-- Moving a session across a month boundary is the primary reason multi-scope
-- publish exists: the source scope drops the unit and the destination scope
-- claims it, in one atomic call. This works in either scope order only because
-- the re-insert upserts on (goal_id, unit_key), which is month-agnostic -- so
-- the destination claims the row wherever it currently lives. Lock both orders
-- down; a month-scoped conflict target would silently break one of them.
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
          'start_date', v_scope_a::text,
          'end_date', (v_scope_a + interval '1 month - 1 day')::date::text,
          'items', jsonb_build_array()
        ),
        jsonb_build_object(
          'start_date', v_scope_b::text,
          'end_date', (v_scope_b + interval '1 month - 1 day')::date::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000002',
              'unit_key', 'unit:scope-b',
              'scheduled_date', (v_scope_b + 3)::text,
              'original_scheduled_date', (v_scope_b + 3)::text,
              'locked', false
            ),
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000001',
              'unit_key', 'unit:scope-a',
              'scheduled_date', (v_scope_b + 15)::text,
              'original_scheduled_date', (v_scope_a + 2)::text,
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
  'batch publish moves a unit across a month boundary, source scope first'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000001'
      and unit_key = 'unit:scope-a'
  ),
  (date_trunc('month', current_date) + interval '1 month + 15 day')::date,
  'cross-month move lands the unit in the destination scope'
);

select is(
  (
    select count(*)::int
    from public.planner_items
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and date_trunc('month', scheduled_date)::date
        = date_trunc('month', current_date)::date
  ),
  0,
  'cross-month move leaves no stranded row in the source scope'
);

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
          'start_date', v_scope_a::text,
          'end_date', (v_scope_a + interval '1 month - 1 day')::date::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000001',
              'unit_key', 'unit:scope-a',
              'scheduled_date', (v_scope_a + 9)::text,
              'original_scheduled_date', (v_scope_a + 2)::text,
              'locked', false
            )
          )
        ),
        jsonb_build_object(
          'start_date', v_scope_b::text,
          'end_date', (v_scope_b + interval '1 month - 1 day')::date::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000002',
              'unit_key', 'unit:scope-b',
              'scheduled_date', (v_scope_b + 3)::text,
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
  'batch publish moves a unit back across the boundary, destination scope first'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000001'
      and unit_key = 'unit:scope-a'
  ),
  (date_trunc('month', current_date) + interval '9 day')::date,
  'cross-month move is order independent across scope payloads'
);

-- Retrying a batch that already landed must stay idempotent even though the
-- digest has moved on since the client captured it. This is the exact case the
-- all-replay short-circuit exists for: hoisting the digest check above it would
-- turn every publish retry into a spurious `stale_schedule`. The API cannot
-- reach this path (its preview-hash check rejects first), so this is the only
-- guard on it.
do $$
declare
  v_scope_a date := date_trunc('month', current_date)::date;
  v_scope_b date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_digest text;
begin
  v_digest := public.get_planner_schedule_digest();
  perform set_config('pgtap.batch_retry_digest', v_digest, true);
  perform *
  from public.set_planner_schedule_batch(
    jsonb_build_array(
      jsonb_build_object(
        'start_date', v_scope_a::text,
        'end_date', (v_scope_a + interval '1 month - 1 day')::date::text,
        'items', jsonb_build_array(
          jsonb_build_object(
            'goal_id', '91600000-0000-4000-8000-000000000001',
            'unit_key', 'unit:scope-a',
            'scheduled_date', (v_scope_a + 11)::text,
            'original_scheduled_date', (v_scope_a + 2)::text,
            'locked', false
          )
        )
      ),
      jsonb_build_object(
        'start_date', v_scope_b::text,
        'end_date', (v_scope_b + interval '1 month - 1 day')::date::text,
        'items', jsonb_build_array(
          jsonb_build_object(
            'goal_id', '91600000-0000-4000-8000-000000000002',
            'unit_key', 'unit:scope-b',
            'scheduled_date', (v_scope_b + 4)::text,
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

select isnt(
  current_setting('pgtap.batch_retry_digest', true),
  public.get_planner_schedule_digest(),
  'the captured digest is stale once the first batch lands'
);

select is(
  (
    select scoped.upserted_count
    from public.set_planner_schedule_batch(
      jsonb_build_array(
        jsonb_build_object(
          'start_date', date_trunc('month', current_date)::date::text,
          'end_date', (date_trunc('month', current_date) + interval '1 month - 1 day')::date::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000001',
              'unit_key', 'unit:scope-a',
              'scheduled_date', (date_trunc('month', current_date) + interval '11 day')::date::text,
              'original_scheduled_date', (date_trunc('month', current_date) + interval '2 day')::date::text,
              'locked', false
            )
          )
        ),
        jsonb_build_object(
          'start_date', (date_trunc('month', current_date) + interval '1 month')::date::text,
          'end_date', (date_trunc('month', current_date) + interval '2 month - 1 day')::date::text,
          'items', jsonb_build_array(
            jsonb_build_object(
              'goal_id', '91600000-0000-4000-8000-000000000002',
              'unit_key', 'unit:scope-b',
              'scheduled_date', (date_trunc('month', current_date) + interval '1 month + 4 day')::date::text,
              'original_scheduled_date', (date_trunc('month', current_date) + interval '1 month + 3 day')::date::text,
              'locked', false
            )
          )
        )
      ),
      current_setting('pgtap.batch_retry_digest', true)
    ) as scoped
  ),
  0,
  'retrying a landed batch with a stale digest replays instead of raising'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000001'
      and unit_key = 'unit:scope-a'
  ),
  (date_trunc('month', current_date) + interval '11 day')::date,
  'replayed retry leaves the landed schedule untouched'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000003'
      and unit_key = 'unit:scope-c'
  ),
  (date_trunc('month', current_date) + interval '2 month + 5 day')::date,
  'scope C is never touched by any batch in this file'
);

-- A single inclusive window can move a unit across a month boundary without
-- splitting the write into source/destination month batches.
select lives_ok(
  $tap$
  do $$
  declare
    v_start date := date_trunc('month', current_date)::date;
    v_end date := (date_trunc('month', current_date) + interval '2 month - 1 day')::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_start,
      v_end,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91600000-0000-4000-8000-000000000001',
          'unit_key', 'unit:scope-a',
          'scheduled_date', (v_start + interval '1 month + 6 day')::date::text,
          'original_scheduled_date', (v_start + 2)::text,
          'locked', false
        ),
        jsonb_build_object(
          'goal_id', '91600000-0000-4000-8000-000000000002',
          'unit_key', 'unit:scope-b',
          'scheduled_date', (v_start + interval '1 month + 4 day')::date::text,
          'original_scheduled_date', (v_start + interval '1 month + 3 day')::date::text,
          'locked', false
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  'set_planner_schedule moves a unit across months in one date window'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000001'
      and unit_key = 'unit:scope-a'
  ),
  (date_trunc('month', current_date) + interval '1 month + 6 day')::date,
  'single-window publish lands the moved unit in the destination month'
);

select is(
  (
    select count(*)::int
    from public.planner_items
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and goal_id = '91600000-0000-4000-8000-000000000001'
      and date_trunc('month', scheduled_date)::date
        = date_trunc('month', current_date)::date
  ),
  0,
  'single-window publish leaves no stranded source-month row'
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
          'start_date', v_scope_a::text,
          'end_date', (v_scope_b + interval '1 month - 1 day')::date::text,
          'items', '[]'::jsonb
        ),
        jsonb_build_object(
          'start_date', v_scope_b::text,
          'end_date', (v_scope_b + interval '1 month - 1 day')::date::text,
          'items', '[]'::jsonb
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'overlapping_schedule_windows',
  'set_planner_schedule_batch rejects overlapping month-aligned windows'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_a date := date_trunc('month', current_date)::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule_batch(
      jsonb_build_array(
        jsonb_build_object(
          'start_date', v_scope_a::text,
          'end_date', (v_scope_a + interval '1 month - 1 day')::date::text,
          'items', '[]'::jsonb
        ),
        jsonb_build_object(
          'start_date', v_scope_a::text,
          'end_date', (v_scope_a + interval '1 month - 1 day')::date::text,
          'items', '[]'::jsonb
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  '22023'::character(5),
  'duplicate_schedule_window',
  'set_planner_schedule_batch rejects duplicate windows'
);

reset role;
select * from finish();
rollback;
