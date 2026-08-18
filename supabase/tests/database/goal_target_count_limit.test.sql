begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(5);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111119',
  'goal-target-count-limit@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username)
values (
  '11111111-1111-4111-8111-111111111119',
  'goal_target_count_limit_fixture'
)
on conflict (id) do nothing;

set local role service_role;

select lives_ok(
  $$
    insert into public.goals (
      id,
      owner_id,
      title,
      category,
      frequency_type,
      recurrence_interval,
      target_count,
      start_date,
      end_date
    ) values (
      '32000000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111119',
      'Maximum target cap goal',
      'test',
      'fixed_milestones',
      null,
      1000,
      '2026-01-01',
      '2026-12-31'
    )
  $$,
  'goal target_count accepts exactly 1000'
);

select throws_ok(
  $$
    insert into public.goals (
      id,
      owner_id,
      title,
      category,
      frequency_type,
      recurrence_interval,
      target_count,
      start_date,
      end_date
    ) values (
      '32000000-0000-4000-8000-000000000002',
      '11111111-1111-4111-8111-111111111119',
      'Oversized target cap goal',
      'test',
      'fixed_milestones',
      null,
      1001,
      '2026-01-01',
      '2026-12-31'
    )
  $$,
  '23514'::character(5),
  'new row for relation "goals" violates check constraint "goals_target_count_max_1000"',
  'goal target_count rejects values above 1000'
);

select lives_ok(
  $$
    insert into public.goals (
      id,
      owner_id,
      title,
      category,
      frequency_type,
      recurrence_interval,
      target_count,
      start_date,
      end_date
    ) values (
      '32000000-0000-4000-8000-000000000003',
      '11111111-1111-4111-8111-111111111119',
      'Untargeted cadence goal',
      'test',
      'recurring',
      'weekly',
      null,
      '2026-01-01',
      null
    )
  $$,
  'goal target_count allows null for cadence goals'
);

select throws_ok(
  $$
    update public.goals
    set target_count = 1001
    where id = '32000000-0000-4000-8000-000000000001'
  $$,
  '23514'::character(5),
  'new row for relation "goals" violates check constraint "goals_target_count_max_1000"',
  'updating target_count above 1000 is rejected'
);

select is(
  (
    select count(*)::integer
    from public.goals
    where target_count > 1000
  ),
  0,
  'no goal rows remain above target_count 1000'
);

reset role;
select * from finish();
rollback;
