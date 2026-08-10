begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(3);

set local role service_role;

-- Alice's profile comes from the seed.
insert into public.goals (
  id, owner_id, title, description, category, color,
  frequency_type, recurrence_interval, target_count,
  start_date, end_date, is_group
) values (
  '10000000-0000-4000-8000-0000000000c1',
  '11111111-1111-4111-8111-111111111111',
  'Chained move goal', null, 'Personal', null,
  'recurring', 'daily', 3,
  '2027-03-01', '2027-03-31', false
) on conflict (id) do nothing;

insert into public.planner_items (
  owner_id, goal_id, unit_key, scheduled_date, original_scheduled_date, locked
) values
  ('11111111-1111-4111-8111-111111111111','10000000-0000-4000-8000-0000000000c1','total:1','2027-03-01','2027-03-01',false),
  ('11111111-1111-4111-8111-111111111111','10000000-0000-4000-8000-0000000000c1','total:2','2027-03-02','2027-03-02',false),
  ('11111111-1111-4111-8111-111111111111','10000000-0000-4000-8000-0000000000c1','total:3','2027-03-03','2027-03-03',false);

select is(
  (select condeferrable
     from pg_constraint
    where conname = 'planner_items_goal_date_unique'
      and conrelid = 'public.planner_items'::regclass),
  true,
  'goal/date uniqueness is deferrable so chained moves can be written'
);

-- Every item shifts one day later. Each row lands on the date the next row has
-- not vacated yet, so this fails per-row unless the constraint is deferred.
select lives_ok(
  $$update public.planner_items
      set scheduled_date = scheduled_date + 1
    where goal_id = '10000000-0000-4000-8000-0000000000c1'$$,
  'a chained one-day shift publishes without a transient uniqueness failure'
);

-- The final state is still enforced.
select throws_ok(
  $$update public.planner_items
      set scheduled_date = '2027-03-04'
    where goal_id = '10000000-0000-4000-8000-0000000000c1'
      and unit_key in ('total:1', 'total:2')$$,
  '23505',
  null,
  'two items of one goal still cannot share a date'
);

select * from finish();
rollback;
