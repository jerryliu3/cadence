begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(7);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner-tasks-owner@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner_tasks_owner',
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

with created as (
  select *
  from public.create_planner_task(
    'Strength mobility block',
    current_date
  )
)
select ok(
  (select count(*) = 1 from created),
  'create_planner_task returns one created task row'
);

select is(
  (
    select scheduled_date
    from public.planner_tasks
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and title = 'Strength mobility block'
    order by created_at desc
    limit 1
  ),
  current_date,
  'create_planner_task stores the scheduled date'
);

select ok(
  (
    select completed_at is not null
    from public.set_planner_task_completion(
      (
        select id
        from public.planner_tasks
        where owner_id = '11111111-1111-4111-8111-111111111111'
          and title = 'Strength mobility block'
        order by created_at desc
        limit 1
      ),
      true
    )
    limit 1
  ),
  'set_planner_task_completion marks tasks complete'
);

select is(
  (
    select count(*)::integer
    from public.list_planner_tasks(null)
    where title = 'Strength mobility block'
  ),
  1,
  'completed tasks remain visible on the day they are completed'
);

set local role service_role;
update public.planner_tasks
set completed_at = (current_date - interval '1 day')::timestamptz
where owner_id = '11111111-1111-4111-8111-111111111111'
  and title = 'Strength mobility block';
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
    select count(*)::integer
    from public.list_planner_tasks(null)
    where title = 'Strength mobility block'
  ),
  0,
  'completed tasks older than today are hidden from the active list'
);

select ok(
  (
    select count(*) = 1
    from public.create_planner_task(
      'Easy recovery walk',
      current_date + 1
    )
  ),
  'create_planner_task accepts future-dated tasks'
);

select is(
  (
    select count(*)::integer
    from public.list_planner_tasks(current_date + 1)
    where title = 'Easy recovery walk'
  ),
  1,
  'list_planner_tasks supports per-day filtering for planner surfaces'
);

reset role;
select * from finish();
rollback;
