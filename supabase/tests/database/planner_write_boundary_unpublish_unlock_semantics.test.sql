begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(7);

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
  '91500000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Planner unpublish semantics goal',
  null,
  'test',
  null,
  'recurring',
  'weekly',
  5,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '2 month - 1 day')::date,
  false
);

insert into public.planner_items (
  owner_id,
  goal_id,
  unit_key,
  scheduled_date,
  original_scheduled_date,
  scheduled_time,
  locked
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '91500000-0000-4000-8000-000000000001',
    'unit:month-a',
    (date_trunc('month', current_date) + interval '2 day')::date,
    (date_trunc('month', current_date) + interval '2 day')::date,
    '08:15',
    true
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '91500000-0000-4000-8000-000000000001',
    'unit:month-b',
    (date_trunc('month', current_date) + interval '7 day')::date,
    (date_trunc('month', current_date) + interval '1 day')::date,
    null,
    true
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '91500000-0000-4000-8000-000000000001',
    'unit:next-month',
    (date_trunc('month', current_date) + interval '1 month + 2 day')::date,
    (date_trunc('month', current_date) + interval '1 month + 2 day')::date,
    '09:45',
    true
  );

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table tmp_target_month_before as
select
  item.id,
  item.scheduled_date,
  item.scheduled_time,
  item.original_scheduled_date
from public.planner_items item
where item.owner_id = '11111111-1111-4111-8111-111111111111'
  and date_trunc('month', item.scheduled_date)::date = date_trunc('month', current_date)::date
order by item.id;

create temp table tmp_unpublish_digests (
  before_digest text,
  after_digest text
);

insert into tmp_unpublish_digests (before_digest)
select public.get_planner_schedule_digest();

select lives_ok(
  $tap$
  do $$
  begin
    perform *
    from public.clear_planner_schedule(
      date_trunc('month', current_date)::date,
      (select before_digest from tmp_unpublish_digests limit 1)
    );
  end;
  $$;
  $tap$,
  'unpublish clears month locks successfully'
);

update tmp_unpublish_digests
set after_digest = public.get_planner_schedule_digest();

select is(
  (
    select count(*)
    from public.planner_items item
    where item.owner_id = '11111111-1111-4111-8111-111111111111'
      and date_trunc('month', item.scheduled_date)::date = date_trunc('month', current_date)::date
  ),
  (select count(*) from tmp_target_month_before),
  'unpublish keeps row count unchanged in target month'
);

select is(
  (
    select count(*)
    from public.planner_items item
    where item.owner_id = '11111111-1111-4111-8111-111111111111'
      and date_trunc('month', item.scheduled_date)::date = date_trunc('month', current_date)::date
      and item.locked
  ),
  0::bigint,
  'unpublish clears locked state in target month'
);

select is(
  (
    select count(*)
    from public.planner_items item
    join tmp_target_month_before baseline using (id)
    where (item.scheduled_date, item.scheduled_time, item.original_scheduled_date)
          is distinct from
          (baseline.scheduled_date, baseline.scheduled_time, baseline.original_scheduled_date)
  ),
  0::bigint,
  'unpublish preserves scheduled_date, scheduled_time, and original_scheduled_date'
);

select ok(
  (
    select item.locked
    from public.planner_items item
    where item.owner_id = '11111111-1111-4111-8111-111111111111'
      and item.unit_key = 'unit:next-month'
  ),
  'unpublish leaves adjacent-month lock state unchanged'
);

select throws_ok(
  $tap$
  select *
  from public.clear_planner_schedule(
    date_trunc('month', current_date)::date,
    (select before_digest from tmp_unpublish_digests limit 1)
  );
  $tap$,
  'P0001'::character(5),
  'stale_schedule',
  'stale digest unpublish is rejected'
);

select is(
  public.get_planner_schedule_digest(),
  (select after_digest from tmp_unpublish_digests limit 1),
  'stale digest unpublish leaves schedule digest unchanged'
);

reset role;
select * from finish();
rollback;
