begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(9);

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
values
  (
    '91600000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Cascade root',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    6,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '3 month - 1 day')::date,
    false
  ),
  (
    '91600000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'Cascade middle',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    6,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '3 month - 1 day')::date,
    false
  ),
  (
    '91600000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    'Cascade leaf',
    null,
    'test',
    null,
    'recurring',
    'weekly',
    6,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '3 month - 1 day')::date,
    false
  );

insert into public.goal_links (
  id,
  owner_id,
  source_goal_id,
  target_goal_id
)
values
  (
    '91610000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '91600000-0000-4000-8000-000000000001',
    '91600000-0000-4000-8000-000000000002'
  ),
  (
    '91610000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '91600000-0000-4000-8000-000000000002',
    '91600000-0000-4000-8000-000000000003'
  ),
  (
    '91610000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    '91600000-0000-4000-8000-000000000003',
    '91600000-0000-4000-8000-000000000001'
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
  '91600000-0000-4000-8000-000000000001',
  'unit:rls',
  (date_trunc('month', current_date) + interval '2 day')::date,
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

select is(
  (
    select count(*)
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'owner can read planner_items rows'
);

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

select is(
  (
    select count(*)
    from public.planner_items
    where goal_id = '91600000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'non-owner cannot read planner_items rows'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select lives_ok(
  $tap$
  do $$
  begin
    perform public.mark_goal_complete(
      '91600000-0000-4000-8000-000000000001',
      date_trunc('month', current_date)::date
    );
  end;
  $$;
  $tap$,
  'mark_goal_complete handles transitive cascades with cycles'
);

select is(
  (
    select count(*)
    from public.completions
    where user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = date_trunc('month', current_date)::date
      and goal_id in (
        '91600000-0000-4000-8000-000000000001',
        '91600000-0000-4000-8000-000000000002',
        '91600000-0000-4000-8000-000000000003'
      )
  ),
  3::bigint,
  'transitive cascades write one completion per reachable goal'
);

select is(
  (
    select count(*)
    from public.completions
    where user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = date_trunc('month', current_date)::date
      and goal_id = '91600000-0000-4000-8000-000000000001'
      and source = 'manual'
  ),
  1::bigint,
  'root completion is labeled manual'
);

select is(
  (
    select count(*)
    from public.completions
    where user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = date_trunc('month', current_date)::date
      and goal_id in (
        '91600000-0000-4000-8000-000000000002',
        '91600000-0000-4000-8000-000000000003'
      )
      and source = 'linked_cascade'
  ),
  2::bigint,
  'cascade descendants are labeled linked_cascade'
);

select public.mark_goal_complete(
  '91600000-0000-4000-8000-000000000001',
  date_trunc('month', current_date)::date
);

select is(
  (
    select count(*)
    from public.completions
    where user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = date_trunc('month', current_date)::date
      and goal_id in (
        '91600000-0000-4000-8000-000000000001',
        '91600000-0000-4000-8000-000000000002',
        '91600000-0000-4000-8000-000000000003'
      )
  ),
  3::bigint,
  'cycle traversal stays idempotent across repeated marks'
);

select lives_ok(
  $tap$
  do $$
  begin
    perform public.unmark_goal_complete(
      '91600000-0000-4000-8000-000000000001',
      date_trunc('month', current_date)::date
    );
  end;
  $$;
  $tap$,
  'unmark_goal_complete handles transitive cascades with cycles'
);

select is(
  (
    select count(*)
    from public.completions
    where user_id = '11111111-1111-4111-8111-111111111111'
      and completed_on = date_trunc('month', current_date)::date
      and goal_id in (
        '91600000-0000-4000-8000-000000000001',
        '91600000-0000-4000-8000-000000000002',
        '91600000-0000-4000-8000-000000000003'
      )
  ),
  0::bigint,
  'transitive unmark clears root and cascade descendants'
);

reset role;
select * from finish();
rollback;
