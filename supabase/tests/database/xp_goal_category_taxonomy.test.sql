begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(13);

select is(
  private.normalize_goal_category_key('fitness'),
  'health',
  'fitness alias resolves to health key'
);

select is(
  private.normalize_goal_category_key('PRODUCTIVITY'),
  'personal',
  'productivity alias resolves case-insensitively'
);

select is(
  private.normalize_goal_category_key('career'),
  'career',
  'explicit taxonomy key resolves directly'
);

select is(
  private.normalize_goal_category_key('something-custom'),
  'other',
  'unknown categories normalize to other'
);

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
  'b1400000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'XP taxonomy trigger insert test',
  null,
  'fitness',
  '#10b981',
  'recurring',
  'weekly',
  3,
  current_date - 7,
  current_date + 7,
  false
);

select is(
  (
    select category_key
    from public.goals
    where id = 'b1400000-0000-4000-8000-000000000001'
  ),
  'health',
  'insert trigger derives category_key from category'
);

update public.goals
set
  category = 'finance',
  category_key = 'learning'
where id = 'b1400000-0000-4000-8000-000000000001';

select is(
  (
    select category_key
    from public.goals
    where id = 'b1400000-0000-4000-8000-000000000001'
  ),
  'finance',
  'update trigger rewrites mismatched category_key to normalized category'
);

select throws_ok(
  $tap$
    insert into public.goal_categories (key, label, aliases, color, sort_order)
    values ('global', 'Global', '{}'::text[], '#111111', 998);
  $tap$,
  '23514',
  null,
  'goal_categories blocks reserved global key inserts'
);

reset role;
alter table public.goals disable trigger goals_set_category_key;
set local role service_role;
select throws_ok(
  $tap$
    insert into public.goals (
      id,
      owner_id,
      title,
      description,
      category,
      category_key,
      color,
      frequency_type,
      recurrence_interval,
      target_count,
      start_date,
      end_date,
      is_group
    )
    values (
      'b1400000-0000-4000-8000-000000000099',
      '11111111-1111-4111-8111-111111111111',
      'XP taxonomy fk enforcement',
      null,
      'health',
      'missing_key',
      '#10b981',
      'recurring',
      'weekly',
      1,
      current_date - 1,
      current_date + 1,
      false
    );
  $tap$,
  '23503',
  null,
  'goals.category_key foreign key rejects unknown taxonomy keys'
);
reset role;
alter table public.goals enable trigger goals_set_category_key;
set local role service_role;

select throws_ok(
  $tap$
    delete from public.goal_categories where key = 'health';
  $tap$,
  '23503',
  null,
  'cannot delete taxonomy keys referenced by existing goals'
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
  (select count(*)::integer from public.goal_categories),
  8,
  'goal_categories seed contains expected v1 taxonomy keys'
);

select ok(
  exists(
    select 1
    from public.goal_categories
    where key = 'other'
      and sort_order = 999
  ),
  'other key exists as fallback category'
);

select lives_ok(
  $tap$
    select key
    from public.goal_categories
    order by sort_order asc;
  $tap$,
  'authenticated users can read taxonomy catalog'
);

select throws_ok(
  $tap$
    insert into public.goal_categories (key, label, aliases, color, sort_order)
    values ('hacked', 'Hacked', '{}'::text[], '#000000', 1);
  $tap$,
  '42501',
  null,
  'authenticated users cannot mutate taxonomy catalog'
);

reset role;
select * from finish();
rollback;
