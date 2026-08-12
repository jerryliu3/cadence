begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(13);

select is(
  private.normalize_goal_category_key('Health'),
  'health',
  'display label resolves to health key case-insensitively'
);

select is(
  private.normalize_goal_category_key('relationships'),
  'relationships',
  'explicit taxonomy key resolves directly'
);

select is(
  private.normalize_goal_category_key('community'),
  'other',
  'removed legacy category values normalize to other'
);

select is(
  private.normalize_goal_category_key('something-custom'),
  'other',
  'unknown categories normalize to other'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.create_goal(
  'b1400000-0000-4000-8000-000000000001',
  'XP taxonomy write-boundary insert test',
  null,
  null,
  'Health',
  'career',
  '#10b981',
  'recurring',
  'weekly',
  3,
  null,
  current_date - 7,
  current_date + 7,
  null,
  false
);

select is(
  (
    select category_key
    from public.goals
    where id = 'b1400000-0000-4000-8000-000000000001'
  ),
  'career',
  'create_goal keeps category_key as canonical source of truth'
);

select is(
  (
    select category
    from public.goals
    where id = 'b1400000-0000-4000-8000-000000000001'
  ),
  'Career',
  'create_goal rewrites category label from the canonical category_key'
);

select public.update_goal(
  'b1400000-0000-4000-8000-000000000001',
  'XP taxonomy write-boundary insert test',
  null,
  null,
  'Friends and family',
  'other',
  '#10b981',
  'recurring',
  'weekly',
  3,
  null,
  current_date - 7,
  current_date + 7,
  null,
  false
);

select is(
  (
    select category_key
    from public.goals
    where id = 'b1400000-0000-4000-8000-000000000001'
  ),
  'other',
  'update_goal keeps category_key canonical for custom labels'
);

select is(
  (
    select category
    from public.goals
    where id = 'b1400000-0000-4000-8000-000000000001'
  ),
  'Friends and family',
  'update_goal preserves custom label when category_key is other'
);

select is(
  (select count(*)::integer from public.goal_categories),
  5,
  'goal_categories seed contains expected category keys'
);

select is(
  (
    select count(*)::integer
    from public.goal_categories
    where key in ('learning', 'finance', 'community')
  ),
  0,
  'legacy category keys are removed from taxonomy seed'
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
