begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(7);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111111',
  'training-plan-import-owner@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values (
  '11111111-1111-4111-8111-111111111111',
  'training_plan_import_owner',
  'UTC'
)
on conflict (id) do update
set timezone = excluded.timezone;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table import_result as
select *
from public.import_training_plan(
  jsonb_build_array(
    jsonb_build_object(
      'id', '95000000-0000-4000-8000-000000000001',
      'title', 'Training import easy run',
      'category', 'Health',
      'frequency_type', 'recurring',
      'recurrence_interval', 'weekly',
      'target_count', null,
      'start_date', (current_date + 1)::text,
      'end_date', (current_date + 10)::text,
      'sessions', jsonb_build_array(
        jsonb_build_object(
          'scheduled_date', (current_date + 2)::text,
          'scheduled_time', '07:00'
        ),
        jsonb_build_object(
          'scheduled_date', (current_date + 5)::text,
          'scheduled_time', '18:30'
        )
      )
    )
  )
);

select is(
  (select goal_count from import_result),
  1,
  'import_training_plan reports imported goal count'
);

select is(
  (select session_count from import_result),
  2,
  'import_training_plan reports imported session count'
);

select is(
  (
    select count(*)::integer
    from public.planner_items
    where goal_id = '95000000-0000-4000-8000-000000000001'
      and unit_key like 'manual:%'
      and locked = true
  ),
  2,
  'imported sessions are persisted as locked manual planner rows'
);

select throws_ok(
  $tap$
  select *
  from public.import_training_plan(
    jsonb_build_array(
      jsonb_build_object(
        'id', '95000000-0000-4000-8000-000000000002',
        'title', 'Training import conflict goal',
        'category', 'Health',
        'frequency_type', 'recurring',
        'recurrence_interval', 'weekly',
        'start_date', (current_date + 1)::text,
        'end_date', (current_date + 10)::text,
        'sessions', jsonb_build_array(
          jsonb_build_object(
            'scheduled_date', (current_date + 3)::text,
            'scheduled_time', '07:00'
          ),
          jsonb_build_object(
            'scheduled_date', (current_date + 3)::text,
            'scheduled_time', '19:00'
          )
        )
      )
    )
  );
  $tap$,
  'P0001'::character(5),
  'schedule_conflict',
  'duplicate manual sessions for one goal/date fail atomically'
);

select is(
  (
    select count(*)::integer
    from public.goals
    where id = '95000000-0000-4000-8000-000000000002'
  ),
  0,
  'conflicted imports rollback goal creation'
);

select throws_ok(
  $tap$
  select *
  from public.import_training_plan(
    (
      select jsonb_agg(
        jsonb_build_object(
          'title', 'Limit goal ' || g::text,
          'category', 'Health',
          'frequency_type', 'recurring',
          'recurrence_interval', 'weekly',
          'start_date', (current_date + 1)::text,
          'end_date', (current_date + 14)::text,
          'sessions', '[]'::jsonb
        )
      )
      from generate_series(1, 61) as s(g)
    )
  );
  $tap$,
  '22023'::character(5),
  'training_plan_goals_limit_exceeded',
  'imports reject payloads with more than 60 goals'
);

select throws_ok(
  $tap$
  select *
  from public.import_training_plan(
    jsonb_build_array(
      jsonb_build_object(
        'title', 'Too many sessions',
        'category', 'Health',
        'frequency_type', 'recurring',
        'recurrence_interval', 'weekly',
        'start_date', current_date::text,
        'end_date', (current_date + 400)::text,
        'sessions', (
          select jsonb_agg(
            jsonb_build_object(
              'scheduled_date',
              (current_date + g)::text
            )
          )
          from generate_series(1, 367) as s(g)
        )
      )
    )
  );
  $tap$,
  '22023'::character(5),
  'training_plan_sessions_limit_exceeded',
  'imports reject goals with more than 366 dated sessions'
);

reset role;
select * from finish();
rollback;
