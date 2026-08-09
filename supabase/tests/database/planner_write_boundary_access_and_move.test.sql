begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(7);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner-write-boundary-access-owner@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner_write_boundary_owner',
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
  end_date,
  is_group
)
values (
  '91100000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Planner write boundary move goal',
  null,
  'test',
  null,
  'recurring',
  'weekly',
  1,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  false
);

insert into public.planner_items (
  owner_id,
  goal_id,
  unit_key,
  scheduled_date,
  locked
)
values (
  '11111111-1111-4111-8111-111111111111',
  '91100000-0000-4000-8000-000000000001',
  'unit:move',
  (date_trunc('month', current_date) + interval '1 month')::date,
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

select throws_ok(
  $$
    insert into public.planner_items (
      owner_id,
      goal_id,
      unit_key,
      scheduled_date,
      locked
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      '91100000-0000-4000-8000-000000000001',
      'unit:direct',
      date_trunc('month', current_date)::date,
      false
    )
  $$,
  '42501'::character(5),
  'permission denied for table planner_items',
  'authenticated clients cannot directly write planner_items'
);

select lives_ok(
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
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91100000-0000-4000-8000-000000000001',
          'unit_key', 'unit:move',
          'scheduled_date', (v_scope_month + 2)::text,
          'locked', false
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  'cross-month unit move succeeds within target cap'
);

select is(
  (
    select date_trunc('month', scheduled_date)::date
    from public.planner_items
    where goal_id = '91100000-0000-4000-8000-000000000001'
      and unit_key = 'unit:move'
  ),
  date_trunc('month', current_date)::date,
  'cross-month move updates existing unit instead of counting as an extra allocation'
);

select is(
  (
    select original_scheduled_date
    from public.planner_items
    where goal_id = '91100000-0000-4000-8000-000000000001'
      and unit_key = 'unit:move'
  ),
  (date_trunc('month', current_date) + interval '2 day')::date,
  'cross-month move stores original_scheduled_date from payload values'
);

select lives_ok(
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
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91100000-0000-4000-8000-000000000001',
          'unit_key', 'unit:move',
          'scheduled_date', (v_scope_month + 4)::text,
          'original_scheduled_date', (v_scope_month + 2)::text,
          'locked', false
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  'republish move accepts caller-provided original_scheduled_date anchor'
);

select is(
  (
    select original_scheduled_date
    from public.planner_items
    where goal_id = '91100000-0000-4000-8000-000000000001'
      and unit_key = 'unit:move'
  ),
  (date_trunc('month', current_date) + interval '2 day')::date,
  'republish move keeps original_scheduled_date anchored to prior published date'
);

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

select throws_ok(
  $$
    select public.get_planner_schedule_digest('11111111-1111-4111-8111-111111111111');
  $$,
  '42501'::character(5),
  'owner_mismatch',
  'planner schedule digest rejects cross-owner lookups'
);

reset role;
select * from finish();
rollback;
