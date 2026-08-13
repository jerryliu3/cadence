begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(4);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner-write-boundary-reset-owner@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner_write_boundary_reset_owner',
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
    '91400000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Planner reset unlock goal',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    2,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date
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
    v_scope_month date := date_trunc('month', current_date)::date;
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91400000-0000-4000-8000-000000000001',
          'unit_key', 'unit:reset',
          'scheduled_date', (v_scope_month + 3)::text,
          'locked', true
        )
      ),
      v_digest
    );
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.clear_planner_schedule(v_scope_month, v_digest);
  end;
  $$;
  $tap$,
  'reset unlocks planner rows in-place'
);

select is(
  (
    select locked
    from public.planner_items
    where goal_id = '91400000-0000-4000-8000-000000000001'
      and unit_key = 'unit:reset'
  ),
  false,
  'reset clears lock state'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91400000-0000-4000-8000-000000000001'
      and unit_key = 'unit:reset'
  ),
  (date_trunc('month', current_date) + interval '3 day')::date,
  'reset preserves scheduled placement'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_scope_month date := date_trunc('month', current_date)::date;
    v_stale_digest text;
    v_item_id uuid;
  begin
    v_stale_digest := public.get_planner_schedule_digest();

    select id
    into v_item_id
    from public.planner_items
    where goal_id = '91400000-0000-4000-8000-000000000001'
      and unit_key = 'unit:reset';

    perform *
    from public.set_planner_item_lock(v_item_id, true, v_stale_digest);

    perform *
    from public.clear_planner_schedule(v_scope_month, v_stale_digest);
  end;
  $$;
  $tap$,
  'P0001'::character(5),
  'stale_schedule',
  'reset rejects stale digest writes'
);

reset role;
select * from finish();
rollback;
