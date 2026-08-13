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
  end_date
)
values
  (
    'b2400000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'XP future completion guard goal',
    null,
    'health',
    '#10b981',
    'recurring',
    'weekly',
    3,
    current_date - 14,
    current_date + 14
  )
on conflict (id) do nothing;

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
    insert into public.completions (goal_id, user_id, completed_on, source)
    values (
      'b2400000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      current_date + 1,
      'manual'
    );
  $tap$,
  '42501',
  null,
  'authenticated clients cannot insert completion rows directly'
);

select throws_ok(
  $tap$
    select public.mark_goal_complete(
      'b2400000-0000-4000-8000-000000000001',
      current_date + 1
    );
  $tap$,
  '23514',
  'future_completion_not_allowed',
  'future dated completions are rejected by mark_goal_complete'
);

select lives_ok(
  $tap$
    select public.mark_goal_complete(
      'b2400000-0000-4000-8000-000000000001',
      current_date
    );
  $tap$,
  'today completion RPC remains allowed'
);

reset role;
select * from finish();
rollback;
