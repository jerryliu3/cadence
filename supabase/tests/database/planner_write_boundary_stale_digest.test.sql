begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(3);

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
  '91200000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Planner write boundary stale digest goal',
  null,
  'test',
  null,
  'recurring',
  'weekly',
  2,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
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
    v_stale_digest text;
  begin
    v_stale_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91200000-0000-4000-8000-000000000001',
          'unit_key', 'unit:1',
          'scheduled_date', (v_scope_month + 2)::text,
          'locked', false
        )
      ),
      v_stale_digest
    );
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91200000-0000-4000-8000-000000000001',
          'unit_key', 'unit:1',
          'scheduled_date', (v_scope_month + 4)::text,
          'locked', false
        )
      ),
      v_stale_digest
    );
  end;
  $$;
  $tap$,
  'P0001'::character(5),
  'stale_schedule',
  'stale digest writes are rejected'
);

create temp table tmp_replay_digests (
  returned_digest text,
  current_digest text
);

select lives_ok(
  $tap$
  do $$
  declare
    v_scope_month date := date_trunc('month', current_date)::date;
    v_stale_digest text;
    v_replay_digest text;
  begin
    v_stale_digest := public.get_planner_schedule_digest();

    perform *
    from public.set_planner_schedule(
      v_scope_month,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91200000-0000-4000-8000-000000000001',
          'unit_key', 'unit:1',
          'scheduled_date', (v_scope_month + 2)::text,
          'locked', false
        )
      ),
      v_stale_digest
    );

    select schedule_digest
    into v_replay_digest
    from public.set_planner_schedule(
      v_scope_month,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91200000-0000-4000-8000-000000000001',
          'unit_key', 'unit:1',
          'scheduled_date', (v_scope_month + 2)::text,
          'locked', false
        )
      ),
      v_stale_digest
    );

    insert into tmp_replay_digests (returned_digest, current_digest)
    values (v_replay_digest, public.get_planner_schedule_digest());
  end;
  $$;
  $tap$,
  'stale digest replay with identical payload succeeds'
);

select is(
  (select returned_digest from tmp_replay_digests limit 1),
  (select current_digest from tmp_replay_digests limit 1),
  'stale digest replay returns the current digest'
);

reset role;
select * from finish();
rollback;
