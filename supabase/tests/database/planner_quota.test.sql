begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(11);

insert into auth.users (id, email)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner-quota-owner@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values (
  '11111111-1111-4111-8111-111111111111',
  'planner_quota_owner',
  'UTC'
)
on conflict (id) do update
set timezone = excluded.timezone;

delete from public.planner_ai_usage_daily
where owner_id = '11111111-1111-4111-8111-111111111111'
  and usage_date = (clock_timestamp() at time zone 'UTC')::date
  and feature in ('planner_coach', 'bulk_parser');
select results_eq(
  $$
    select allowed, request_count, remaining
    from public.consume_planner_ai_quota(
      '11111111-1111-4111-8111-111111111111',
      'planner_coach',
      2,
      5
    )
  $$,
  $$ values (true, 1, 1) $$,
  'the first provider attempt consumes one quota request'
);

select results_eq(
  $$
    select allowed, request_count, remaining
    from public.consume_planner_ai_quota(
      '11111111-1111-4111-8111-111111111111',
      'planner_coach',
      2,
      7
    )
  $$,
  $$ values (true, 2, 0) $$,
  'the final allowed attempt consumes the remaining quota'
);

select results_eq(
  $$
    select allowed, request_count, remaining
    from public.consume_planner_ai_quota(
      '11111111-1111-4111-8111-111111111111',
      'planner_coach',
      2,
      11
    )
  $$,
  $$ values (false, 2, 0) $$,
  'an attempt beyond the daily limit is rejected atomically'
);

select ok(
  (
    select retry_after_seconds > 0
    from public.consume_planner_ai_quota(
      '11111111-1111-4111-8111-111111111111',
      'planner_coach',
      2,
      0
    )
  ),
  'quota rejection includes a positive UTC-midnight retry delay'
);

select is(
  (
    select input_tokens
    from public.planner_ai_usage_daily
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and usage_date = (clock_timestamp() at time zone 'UTC')::date
      and feature = 'planner_coach'
  ),
  12::bigint,
  'rejected attempts do not add token telemetry'
);

select is(
  public.record_planner_ai_output_tokens(
    '11111111-1111-4111-8111-111111111111',
    (clock_timestamp() at time zone 'UTC')::date,
    'planner_coach',
    9
  ),
  9::bigint,
  'output token telemetry is recorded after a consumed attempt'
);

select results_eq(
  $$
    select allowed, request_count
    from public.consume_planner_ai_quota(
      '11111111-1111-4111-8111-111111111111',
      'bulk_parser',
      20,
      0
    )
  $$,
  $$ values (true, 1) $$,
  'quota counters are isolated by feature'
);

select throws_ok(
  $$
    select *
    from public.consume_planner_ai_quota(
      '11111111-1111-4111-8111-111111111111',
      'planner_coach',
      101,
      0
    )
  $$,
  '22023'::character(5),
  'planner AI quota limit must be between 1 and 100',
  'the database enforces the hard quota ceiling'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.planner_ai_usage_daily $$,
  '42501'::character(5),
  'permission denied for table planner_ai_usage_daily',
  'authenticated clients cannot read planner quota telemetry'
);

select throws_ok(
  $$
    select *
    from public.consume_planner_ai_quota(
      '11111111-1111-4111-8111-111111111111',
      'bulk_parser',
      20,
      0
    )
  $$,
  '42501'::character(5),
  'permission denied for function consume_planner_ai_quota',
  'authenticated clients cannot execute service-only quota functions'
);

reset role;
set local role service_role;
select ok(
  (
    select allowed
    from public.consume_planner_ai_quota(
      '11111111-1111-4111-8111-111111111111',
      'bulk_parser',
      20,
      0
    )
  ),
  'service_role can consume quota through the service function'
);

reset role;
select * from finish();
rollback;
