begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(8);

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
      end_date,
      is_group
    ) values (
      '31000000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      'Open cadence',
      'test',
      'recurring',
      'weekly',
      null,
      '2026-01-01',
      null,
      false
    )
  $$,
  'open-ended cadence goals can be created without deadlines'
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
      end_date,
      is_group
    ) values (
      '31000000-0000-4000-8000-000000000002',
      '11111111-1111-4111-8111-111111111111',
      'Milestone missing deadline',
      'test',
      'fixed_milestones',
      null,
      3,
      '2026-01-01',
      null,
      false
    )
  $$,
  '23514'::character(5),
  'new row for relation "goals" violates check constraint "goals_deadline_required_by_requirement"',
  'milestone goals must provide a deadline'
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
      end_date,
      is_group
    ) values (
      '31000000-0000-4000-8000-000000000003',
      '11111111-1111-4111-8111-111111111111',
      'Target total missing deadline',
      'test',
      'recurring',
      'weekly',
      8,
      '2026-01-01',
      null,
      false
    )
  $$,
  '23514'::character(5),
  'new row for relation "goals" violates check constraint "goals_deadline_required_by_requirement"',
  'target-total recurring goals must provide a deadline'
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
      end_date,
      is_group
    ) values (
      '31000000-0000-4000-8000-000000000004',
      '11111111-1111-4111-8111-111111111111',
      'Overlong deadline',
      'test',
      'recurring',
      'weekly',
      null,
      '2026-01-01',
      '2028-01-01',
      false
    )
  $$,
  '23514'::character(5),
  'new row for relation "goals" violates check constraint "goals_deadline_horizon_max_24_months"',
  'deadline spans beyond twenty-four months are rejected'
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
      end_date,
      is_group
    ) values (
      '31000000-0000-4000-8000-000000000005',
      '11111111-1111-4111-8111-111111111111',
      'Twenty four month milestone',
      'test',
      'fixed_milestones',
      null,
      2,
      '2026-01-01',
      '2027-12-31',
      false
    )
  $$,
  'twenty-four-month deadline spans are accepted'
);

select throws_ok(
  $$
    update public.goals
    set target_count = 4
    where id = '31000000-0000-4000-8000-000000000001'
  $$,
  '23514'::character(5),
  'new row for relation "goals" violates check constraint "goals_deadline_required_by_requirement"',
  'editing cadence goals into target-total without deadline is rejected'
);

select lives_ok(
  $$
    update public.goals
    set target_count = 4,
        end_date = '2026-12-31'
    where id = '31000000-0000-4000-8000-000000000001'
  $$,
  'editing cadence goals into target-total with deadline is accepted'
);

select throws_ok(
  $$
    update public.goals
    set end_date = '2028-12-31'
    where id = '31000000-0000-4000-8000-000000000001'
  $$,
  '23514'::character(5),
  'new row for relation "goals" violates check constraint "goals_deadline_horizon_max_24_months"',
  'editing deadlines beyond twenty-four months is rejected'
);

reset role;
select * from finish();
rollback;
