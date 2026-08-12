begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(1);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner-write-boundary-target-cap-owner@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner_write_boundary_cap_owner',
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
  '91300000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Planner write boundary target-cap goal',
  null,
  'test',
  null,
  'recurring',
  'weekly',
  1,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '2 month - 1 day')::date,
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
  '91300000-0000-4000-8000-000000000001',
  'unit:existing',
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
          'goal_id', '91300000-0000-4000-8000-000000000001',
          'unit_key', 'unit:new',
          'scheduled_date', (v_scope_month + 6)::text,
          'locked', false
        )
      ),
      v_digest
    );
  end;
  $$;
  $tap$,
  'P0001'::character(5),
  'exceeds_target_count',
  'cross-month target cap blocks new unit allocations'
);

reset role;
select * from finish();
rollback;
