begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(5);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner-manual-items-owner@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner_manual_items_owner',
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
values (
  '91400000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Planner manual items goal',
  null,
  'test',
  null,
  'recurring',
  'weekly',
  1,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '2 month - 1 day')::date
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
  '91400000-0000-4000-8000-000000000001',
  'unit:existing',
  (date_trunc('month', current_date) + interval '1 month + 2 day')::date,
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

create temporary table manual_state (
  digest text not null,
  created_item_id uuid
);

insert into manual_state (digest)
select schedule_digest
from public.set_planner_schedule(
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  jsonb_build_array(
    jsonb_build_object(
      'goal_id', '91400000-0000-4000-8000-000000000001',
      'unit_key', 'manual:test-a',
      'scheduled_date', (date_trunc('month', current_date)::date + 1)::text,
      'locked', false
    )
  ),
  public.get_planner_schedule_digest()
);

select is(
  (
    select count(*)::integer
    from public.planner_items
    where goal_id = '91400000-0000-4000-8000-000000000001'
      and unit_key = 'manual:test-a'
  ),
  1,
  'manual units can publish even when canonical target cap is already full'
);

select ok(
  (
    select locked
    from public.planner_items
    where goal_id = '91400000-0000-4000-8000-000000000001'
      and unit_key = 'manual:test-a'
  ),
  'manual units are forced to locked at write time'
);

with created as (
  select *
  from public.create_planner_manual_item(
    '91400000-0000-4000-8000-000000000001',
    (date_trunc('month', current_date)::date + 4)::date,
    null,
    (select digest from manual_state limit 1)
  )
)
update manual_state
set
  created_item_id = (select item_id from created),
  digest = (select schedule_digest from created);

select ok(
  (select created_item_id is not null from manual_state),
  'create_planner_manual_item returns a planner item id'
);

select ok(
  (
    select item.locked
    from public.planner_items item
    where item.id = (select created_item_id from manual_state)
  ),
  'create_planner_manual_item persists new rows as locked'
);

with deleted as (
  select *
  from public.delete_planner_manual_item(
    (select created_item_id from manual_state),
    (select digest from manual_state)
  )
)
update manual_state
set digest = (select schedule_digest from deleted);

select ok(
  not exists (
    select 1
    from public.planner_items
    where id = (select created_item_id from manual_state)
  ),
  'delete_planner_manual_item removes manual rows'
);

reset role;
select * from finish();
rollback;
