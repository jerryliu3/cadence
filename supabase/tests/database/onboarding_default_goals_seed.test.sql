begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '7a111111-1111-4111-8111-111111111111',
  'seeded-onboarding@example.com',
  '{"username":"seeded_onboarding","seed_default_goals":true}'::jsonb
)
on conflict (id) do nothing;

select ok(
  exists(
    select 1
    from public.profiles profile
    where profile.id = '7a111111-1111-4111-8111-111111111111'
  ),
  'signup trigger creates profile for seeded account'
);

select is(
  (
    select count(*)::integer
    from public.goals goal
    where goal.owner_id = '7a111111-1111-4111-8111-111111111111'
      and goal.is_deleted = false
  ),
  3,
  'seeded account receives exactly three onboarding default goals'
);

select is(
  (
    select count(*)::integer
    from public.goals goal
    where goal.owner_id = '7a111111-1111-4111-8111-111111111111'
      and goal.frequency_type = 'fixed_milestones'::public.goal_frequency_type
      and coalesce(goal.target_count, 0) = 1
      and goal.recurrence_interval is null
  ),
  3,
  'seeded defaults are lightweight one-milestone goals'
);

select is(
  (
    select (goal.end_date - goal.start_date)::integer
    from public.goals goal
    where goal.owner_id = '7a111111-1111-4111-8111-111111111111'
      and goal.title = 'Create your Goalmaxxing account'
  ),
  0,
  'account setup starter goal is due on creation date'
);

select is(
  (
    select (goal.end_date - goal.start_date)::integer
    from public.goals goal
    where goal.owner_id = '7a111111-1111-4111-8111-111111111111'
      and goal.title = 'Create your first goal'
  ),
  1,
  'first goal starter item is due the next day'
);

select is(
  (
    select (goal.end_date - goal.start_date)::integer
    from public.goals goal
    where goal.owner_id = '7a111111-1111-4111-8111-111111111111'
      and goal.title = 'Invite your first teammate'
  ),
  7,
  'team invite starter item is due within the first week'
);

select is(
  (
    select goal.start_date
    from public.goals goal
    where goal.owner_id = '7a111111-1111-4111-8111-111111111111'
      and goal.title = 'Create your Goalmaxxing account'
  ),
  current_date,
  'account setup starter goal anchors to current local date'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '7a222222-2222-4222-8222-222222222222',
  'unseeded-onboarding@example.com',
  '{"username":"unseeded_onboarding","seed_default_goals":false}'::jsonb
)
on conflict (id) do nothing;

select is(
  (
    select count(*)::integer
    from public.goals goal
    where goal.owner_id = '7a222222-2222-4222-8222-222222222222'
      and goal.is_deleted = false
  ),
  0,
  'accounts with explicit seed_default_goals=false do not receive defaults'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '7a333333-3333-4333-8333-333333333333',
  'missing-seed-flag@example.com',
  '{"username":"missing_seed_flag"}'::jsonb
)
on conflict (id) do nothing;

select is(
  (
    select count(*)::integer
    from public.goals goal
    where goal.owner_id = '7a333333-3333-4333-8333-333333333333'
      and goal.is_deleted = false
  ),
  0,
  'accounts without seed_default_goals metadata do not receive defaults'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '7a444444-4444-4444-8444-444444444444',
  'seed-string-onboarding@example.com',
  '{"username":"seed_string_onboarding","seed_default_goals":"yes"}'::jsonb
)
on conflict (id) do nothing;

select is(
  (
    select count(*)::integer
    from public.goals goal
    where goal.owner_id = '7a444444-4444-4444-8444-444444444444'
      and goal.is_deleted = false
  ),
  3,
  'accounts with seed_default_goals string yes receive defaults'
);

select is(
  (
    select count(*)::integer
    from public.goals goal
    where goal.owner_id = '7a111111-1111-4111-8111-111111111111'
      and goal.category_key in ('personal', 'relationships')
  ),
  3,
  'seeded defaults use canonical category keys'
);

select * from finish();
rollback;
