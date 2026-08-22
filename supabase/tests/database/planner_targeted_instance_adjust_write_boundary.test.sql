begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(12);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'planner-instance-adjust-owner@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'planner-instance-adjust-other@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values
  ('11111111-1111-4111-8111-111111111111', 'planner_instance_adjust_owner', 'UTC'),
  ('22222222-2222-4222-8222-222222222222', 'planner_instance_adjust_other', 'UTC')
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
  milestone_names,
  start_date,
  end_date
)
values
  (
    '92100000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Deadline goal',
    'test',
    'recurring',
    'weekly',
    3,
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '2 month - 1 day')::date
  ),
  (
    '92200000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Milestone goal',
    'test',
    'fixed_milestones',
    null,
    3,
    array['One', 'Two', 'Three'],
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '2 month - 1 day')::date
  ),
  (
    '92300000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Cadence goal',
    'test',
    'recurring',
    'weekly',
    null,
    null,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '2 month - 1 day')::date
  ),
  (
    '92400000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Locked delete goal',
    'test',
    'recurring',
    'weekly',
    2,
    null,
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
    '92100000-0000-4000-8000-000000000001',
    'total:1',
    (date_trunc('month', current_date)::date + 2),
    (date_trunc('month', current_date)::date + 2),
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '92100000-0000-4000-8000-000000000001',
    'total:2',
    (date_trunc('month', current_date)::date + 3),
    (date_trunc('month', current_date)::date + 3),
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '92100000-0000-4000-8000-000000000001',
    'total:3',
    (date_trunc('month', current_date)::date + 4),
    (date_trunc('month', current_date)::date + 4),
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '92400000-0000-4000-8000-000000000001',
    'total:1',
    (date_trunc('month', current_date)::date + 8),
    (date_trunc('month', current_date)::date + 8),
    true
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '92400000-0000-4000-8000-000000000001',
    'total:2',
    (date_trunc('month', current_date)::date + 9),
    (date_trunc('month', current_date)::date + 9),
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '92200000-0000-4000-8000-000000000001',
    'milestone:1',
    (date_trunc('month', current_date)::date + 10),
    (date_trunc('month', current_date)::date + 10),
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '92200000-0000-4000-8000-000000000001',
    'milestone:2',
    (date_trunc('month', current_date)::date + 11),
    (date_trunc('month', current_date)::date + 11),
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '92200000-0000-4000-8000-000000000001',
    'milestone:3',
    (date_trunc('month', current_date)::date + 12),
    (date_trunc('month', current_date)::date + 12),
    false
  );

insert into public.completions (user_id, goal_id, completed_on)
values (
  '11111111-1111-4111-8111-111111111111',
  '92100000-0000-4000-8000-000000000001',
  (date_trunc('month', current_date)::date + 2)
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
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.adjust_targeted_planner_instance(
      '92300000-0000-4000-8000-000000000001',
      'add',
      (date_trunc('month', current_date)::date + 15),
      null::text,
      v_digest
    );
  end;
  $$;
  $tap$,
  'P0001'::character(5),
  'unsupported_requirement_kind',
  'cadence goals are rejected by targeted instance adjust'
);

select lives_ok(
  $tap$
  do $$
  declare
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.adjust_targeted_planner_instance(
      '92100000-0000-4000-8000-000000000001',
      'add',
      (date_trunc('month', current_date)::date + 14),
      null::text,
      v_digest
    );
  end;
  $$;
  $tap$,
  'add increments target count and creates a new planner unit'
);

select is(
  (select target_count from public.goals where id = '92100000-0000-4000-8000-000000000001'),
  4,
  'add bumps target_count'
);

select ok(
  exists (
    select 1
    from public.planner_items
    where goal_id = '92100000-0000-4000-8000-000000000001'
      and unit_key = 'total:4'
      and scheduled_date = (date_trunc('month', current_date)::date + 14)
  ),
  'add inserts the new total:4 planner item on the requested date'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.adjust_targeted_planner_instance(
      '92100000-0000-4000-8000-000000000001',
      'delete',
      null::date,
      'total:1',
      v_digest
    );
  end;
  $$;
  $tap$,
  'P0001'::character(5),
  'planner_item_credited',
  'credited instances cannot be deleted'
);

select throws_ok(
  $tap$
  do $$
  declare
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.adjust_targeted_planner_instance(
      '92400000-0000-4000-8000-000000000001',
      'delete',
      null::date,
      'total:1',
      v_digest
    );
  end;
  $$;
  $tap$,
  'P0001'::character(5),
  'planner_item_locked',
  'locked instances cannot be deleted'
);

select lives_ok(
  $tap$
  do $$
  declare
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.adjust_targeted_planner_instance(
      '92100000-0000-4000-8000-000000000001',
      'delete',
      null::date,
      'total:2',
      v_digest
    );
  end;
  $$;
  $tap$,
  'delete removes uncredited item and renumbers higher ordinals'
);

select is(
  (select target_count from public.goals where id = '92100000-0000-4000-8000-000000000001'),
  3,
  'delete decrements target_count'
);

select ok(
  exists (
    select 1
    from public.planner_items
    where goal_id = '92100000-0000-4000-8000-000000000001'
      and unit_key = 'total:2'
      and scheduled_date = (date_trunc('month', current_date)::date + 4)
  ),
  'delete renumbers total:3 to total:2 while preserving scheduled date'
);

select ok(
  not exists (
    select 1
    from public.planner_items
    where goal_id = '92100000-0000-4000-8000-000000000001'
      and unit_key = 'total:3'
  ),
  'delete removes old total:3 identity after renumbering'
);

select lives_ok(
  $tap$
  do $$
  declare
    v_digest text;
  begin
    v_digest := public.get_planner_schedule_digest();
    perform *
    from public.adjust_targeted_planner_instance(
      '92200000-0000-4000-8000-000000000001',
      'add',
      (date_trunc('month', current_date)::date + 16),
      null::text,
      v_digest
    );
  end;
  $$;
  $tap$,
  'milestone add succeeds'
);

select is(
  (select array_to_string(milestone_names, ',') from public.goals where id = '92200000-0000-4000-8000-000000000001'),
  'One,Two,Three,Milestone 4',
  'milestone add appends default milestone label'
);

reset role;
select * from finish();
rollback;
