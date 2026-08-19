begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(9);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner-write-boundary-item-id-stability-owner@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner_write_boundary_item_id_stability_owner',
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
    '91900000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Planner write boundary item identity goal',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    8,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '2 month - 1 day')::date
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
    '91900000-0000-4000-8000-000000000001',
    'unit:alpha',
    (date_trunc('month', current_date) + interval '2 day')::date,
    (date_trunc('month', current_date) + interval '2 day')::date,
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '91900000-0000-4000-8000-000000000001',
    'unit:beta',
    (date_trunc('month', current_date) + interval '3 day')::date,
    (date_trunc('month', current_date) + interval '3 day')::date,
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '91900000-0000-4000-8000-000000000001',
    'unit:gamma',
    (date_trunc('month', current_date) + interval '4 day')::date,
    (date_trunc('month', current_date) + interval '4 day')::date,
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '91900000-0000-4000-8000-000000000001',
    'unit:outside',
    (date_trunc('month', current_date) + interval '1 month + 5 day')::date,
    (date_trunc('month', current_date) + interval '1 month + 5 day')::date,
    false
  );

create temp table tmp_item_id_stability (
  alpha_id uuid,
  beta_id uuid,
  gamma_id uuid,
  outside_id uuid,
  delta_id uuid,
  replay_digest text,
  current_digest text
);

insert into tmp_item_id_stability (
  alpha_id,
  beta_id,
  gamma_id,
  outside_id
)
values (
  (
    select id
    from public.planner_items
    where goal_id = '91900000-0000-4000-8000-000000000001'
      and unit_key = 'unit:alpha'
  ),
  (
    select id
    from public.planner_items
    where goal_id = '91900000-0000-4000-8000-000000000001'
      and unit_key = 'unit:beta'
  ),
  (
    select id
    from public.planner_items
    where goal_id = '91900000-0000-4000-8000-000000000001'
      and unit_key = 'unit:gamma'
  ),
  (
    select id
    from public.planner_items
    where goal_id = '91900000-0000-4000-8000-000000000001'
      and unit_key = 'unit:outside'
  )
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
    v_scope_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
    v_stale_digest text;
    v_replay_digest text;
  begin
    v_stale_digest := public.get_planner_schedule_digest();
    perform *
    from public.set_planner_schedule(
      v_scope_month,
      v_scope_end,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91900000-0000-4000-8000-000000000001',
          'unit_key', 'unit:alpha',
          'scheduled_date', (v_scope_month + 3)::text,
          'original_scheduled_date', (v_scope_month + 2)::text,
          'locked', false
        ),
        jsonb_build_object(
          'goal_id', '91900000-0000-4000-8000-000000000001',
          'unit_key', 'unit:beta',
          'scheduled_date', (v_scope_month + 2)::text,
          'original_scheduled_date', (v_scope_month + 3)::text,
          'locked', false
        ),
        jsonb_build_object(
          'goal_id', '91900000-0000-4000-8000-000000000001',
          'unit_key', 'unit:delta',
          'scheduled_date', (v_scope_month + 5)::text,
          'original_scheduled_date', (v_scope_month + 5)::text,
          'locked', false
        )
      ),
      v_stale_digest
    );

    update tmp_item_id_stability
    set delta_id = (
      select id
      from public.planner_items
      where goal_id = '91900000-0000-4000-8000-000000000001'
        and unit_key = 'unit:delta'
    );

    select schedule_digest
    into v_replay_digest
    from public.set_planner_schedule(
      v_scope_month,
      v_scope_end,
      jsonb_build_array(
        jsonb_build_object(
          'goal_id', '91900000-0000-4000-8000-000000000001',
          'unit_key', 'unit:alpha',
          'scheduled_date', (v_scope_month + 3)::text,
          'original_scheduled_date', (v_scope_month + 2)::text,
          'locked', false
        ),
        jsonb_build_object(
          'goal_id', '91900000-0000-4000-8000-000000000001',
          'unit_key', 'unit:beta',
          'scheduled_date', (v_scope_month + 2)::text,
          'original_scheduled_date', (v_scope_month + 3)::text,
          'locked', false
        ),
        jsonb_build_object(
          'goal_id', '91900000-0000-4000-8000-000000000001',
          'unit_key', 'unit:delta',
          'scheduled_date', (v_scope_month + 5)::text,
          'original_scheduled_date', (v_scope_month + 5)::text,
          'locked', false
        )
      ),
      v_stale_digest
    );

    update tmp_item_id_stability
    set replay_digest = v_replay_digest,
      current_digest = public.get_planner_schedule_digest();
  end;
  $$;
  $tap$,
  'set_planner_schedule keeps item identity stable across targeted publish updates'
);

select is(
  (
    select id
    from public.planner_items
    where goal_id = '91900000-0000-4000-8000-000000000001'
      and unit_key = 'unit:alpha'
  ),
  (select alpha_id from tmp_item_id_stability),
  'alpha keeps planner_items.id when swapped within month window'
);

select is(
  (
    select id
    from public.planner_items
    where goal_id = '91900000-0000-4000-8000-000000000001'
      and unit_key = 'unit:beta'
  ),
  (select beta_id from tmp_item_id_stability),
  'beta keeps planner_items.id when swapped within month window'
);

select is(
  (
    select count(*)::integer
    from public.planner_items
    where goal_id = '91900000-0000-4000-8000-000000000001'
      and unit_key = 'unit:gamma'
  ),
  0,
  'month-window rows omitted from payload are deleted'
);

select ok(
  (
    select
      delta_id is not null
      and delta_id <> alpha_id
      and delta_id <> beta_id
      and delta_id <> gamma_id
    from tmp_item_id_stability
  ),
  'newly inserted payload row receives a fresh planner_items.id'
);

select is(
  (
    select id
    from public.planner_items
    where goal_id = '91900000-0000-4000-8000-000000000001'
      and unit_key = 'unit:outside'
  ),
  (select outside_id from tmp_item_id_stability),
  'rows outside the write window retain planner_items.id'
);

select is(
  (
    select scheduled_date
    from public.planner_items
    where goal_id = '91900000-0000-4000-8000-000000000001'
      and unit_key = 'unit:alpha'
  ),
  (date_trunc('month', current_date) + interval '3 day')::date,
  'swapped payload preserves updated scheduled_date'
);

select is(
  (select replay_digest from tmp_item_id_stability),
  (select current_digest from tmp_item_id_stability),
  'stale-digest replay returns the current digest'
);

select ok(
  (
    select
      alpha_id = (
        select id
        from public.planner_items
        where goal_id = '91900000-0000-4000-8000-000000000001'
          and unit_key = 'unit:alpha'
      )
      and beta_id = (
        select id
        from public.planner_items
        where goal_id = '91900000-0000-4000-8000-000000000001'
          and unit_key = 'unit:beta'
      )
    from tmp_item_id_stability
  ),
  'replay leaves stable planner item ids unchanged'
);

reset role;
select * from finish();
rollback;
