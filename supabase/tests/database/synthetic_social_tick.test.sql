begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(9);

select is(
  public.provision_synthetic_users_service(6, 3),
  6,
  'provisioning returns requested synthetic user count'
);

select is(
  public.provision_synthetic_users_service(6, 3),
  6,
  'provisioning remains idempotent for the same target count'
);

select is(
  (
    select count(*)::integer
    from public.synthetic_users
  ),
  6,
  'synthetic_users table contains expected user count'
);

update public.synthetic_config
set enabled = false,
    max_completions_per_tick = 4,
    max_reactions_per_tick = 5,
    throttle_above_real_dau = 999;

select is(
  public.synthetic_activity_tick_service()->>'status',
  'disabled',
  'tick no-ops when synthetic config is disabled'
);

update public.synthetic_config
set enabled = true,
    max_completions_per_tick = 4,
    max_reactions_per_tick = 5,
    throttle_above_real_dau = 999;

select ok(
  (
    with run as (
      select public.synthetic_activity_tick_service() as payload
    )
    select (run.payload->>'completions_written')::integer between 1 and 4
    from run
  ),
  'tick writes bounded completion volume when enabled'
);

select ok(
  (
    select count(*) > 0
    from public.xp_ledger ledger
    join public.synthetic_users synthetic
      on synthetic.user_id = ledger.user_id
  ),
  'tick completion writes produce XP ledger rows for synthetic users'
);

select ok(
  (
    select count(*) > 0
    from public.feed_events event
    join public.synthetic_users synthetic
      on synthetic.user_id = event.actor_id
  ),
  'tick completion writes emit social feed events'
);

update public.synthetic_users
set completions_today = daily_budget,
    last_active_date = current_date
where enabled = true;

select is(
  (public.synthetic_activity_tick_service()->>'completions_written')::integer,
  0,
  'tick respects per-user daily completion budgets'
);

insert into auth.users (id, email)
values ('ad111111-1111-4111-8111-111111111111', 'synthetic-throttle-real@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values ('ad111111-1111-4111-8111-111111111111', 'synthetic_throttle_real')
on conflict (id) do nothing;

insert into public.goals (
  id,
  owner_id,
  title,
  category,
  category_key,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date
)
values (
  'ad222222-2222-4222-8222-222222222222',
  'ad111111-1111-4111-8111-111111111111',
  'Throttle guard goal',
  'Health',
  'health',
  'recurring',
  'weekly',
  3,
  current_date - 7
)
on conflict (id) do nothing;

insert into public.completions (goal_id, user_id, completed_on, source)
values (
  'ad222222-2222-4222-8222-222222222222',
  'ad111111-1111-4111-8111-111111111111',
  current_date,
  'manual'
)
on conflict (goal_id, user_id, completed_on) do nothing;

update public.synthetic_config
set enabled = true,
    max_completions_per_tick = 4,
    max_reactions_per_tick = 5,
    throttle_above_real_dau = 1;

select is(
  public.synthetic_activity_tick_service()->>'status',
  'throttled',
  'tick pauses when real daily active users meet throttle threshold'
);

select * from finish();
rollback;
