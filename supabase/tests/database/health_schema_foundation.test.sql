begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(20);

insert into auth.users (id, email)
values
  ('c1111111-1111-4111-8111-111111111111', 'health-schema-alice@example.com'),
  ('c2222222-2222-4222-8222-222222222222', 'health-schema-bob@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values
  ('c1111111-1111-4111-8111-111111111111', 'health_schema_alice', 'America/Los_Angeles'),
  ('c2222222-2222-4222-8222-222222222222', 'health_schema_bob', 'UTC')
on conflict (id) do update
set timezone = excluded.timezone;

select has_type('public', 'health_provider', 'health_provider enum exists');
select has_type('public', 'health_metric_key', 'health_metric_key enum exists');
select has_table('public', 'health_activities', 'health_activities exists');
select has_table('public', 'health_activity_groups', 'health_activity_groups exists');
select has_table('public', 'health_daily_metrics', 'health_daily_metrics exists');
select has_table('public', 'health_source_priority', 'health_source_priority exists');
select has_function(
  'public',
  'health_local_date_from_offset',
  array['timestamptz', 'integer'],
  'health_local_date_from_offset exists'
);

select is(
  public.health_local_date_from_offset(
    timestamptz '2026-08-14 04:00:00+00',
    -240
  ),
  date '2026-08-14',
  'offset-derived local_date keeps the local calendar day'
);

select is(
  public.health_local_date_from_offset(
    timestamptz '2026-08-14 03:59:00+00',
    -240
  ),
  date '2026-08-13',
  'offset-derived local_date crosses midnight without using profile timezone'
);

insert into public.health_activities (
  id,
  user_id,
  provider,
  provider_native_id,
  source_identifier,
  source_name,
  metric_key,
  started_at,
  utc_offset_minutes,
  value_numeric,
  unit
)
values (
  'c1000000-0000-4000-8000-000000000001',
  'c1111111-1111-4111-8111-111111111111',
  'apple_healthkit',
  'hk-sample-1',
  'com.apple.health',
  'Apple Watch',
  'steps',
  timestamptz '2026-08-14 04:00:00+00',
  -240,
  1200,
  'count'
);

select is(
  (
    select local_date
    from public.health_activities
    where id = 'c1000000-0000-4000-8000-000000000001'
  ),
  date '2026-08-14',
  'generated local_date uses sample offset, not profiles.timezone'
);

insert into public.health_activities (
  id,
  user_id,
  provider,
  provider_native_id,
  source_identifier,
  metric_key,
  started_at,
  utc_offset_minutes,
  value_numeric,
  unit
)
values (
  'c1000000-0000-4000-8000-000000000002',
  'c1111111-1111-4111-8111-111111111111',
  'apple_healthkit',
  'hk-sample-2',
  'com.apple.health',
  'steps',
  timestamptz '2026-08-14 03:59:00+00',
  -240,
  80,
  'count'
);

select is(
  (
    select local_date
    from public.health_activities
    where id = 'c1000000-0000-4000-8000-000000000002'
  ),
  date '2026-08-13',
  'generated local_date can land on the previous local day'
);

select throws_ok(
  $$
    insert into public.health_activities (
      user_id, provider, provider_native_id, source_identifier, metric_key,
      started_at, utc_offset_minutes, value_numeric, unit
    ) values (
      'c1111111-1111-4111-8111-111111111111',
      'apple_healthkit',
      'hk-sample-1',
      'com.apple.health',
      'steps',
      timestamptz '2026-08-14 05:00:00+00',
      -240,
      1,
      'count'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "health_activities_provider_native_uidx"',
  'provider-native identity is unique per user'
);

insert into public.health_activities (
  user_id,
  provider,
  provider_native_id,
  source_identifier,
  metric_key,
  started_at,
  utc_offset_minutes,
  value_numeric,
  unit
)
values (
  'c2222222-2222-4222-8222-222222222222',
  'apple_healthkit',
  'hk-sample-1',
  'com.apple.health',
  'steps',
  timestamptz '2026-08-14 04:00:00+00',
  0,
  50,
  'count'
);

select ok(
  true,
  'the same provider-native id may exist for a different user'
);

insert into public.health_activity_groups (
  id,
  user_id,
  metric_key,
  local_date
)
values (
  'c2000000-0000-4000-8000-000000000001',
  'c1111111-1111-4111-8111-111111111111',
  'steps',
  date '2026-08-14'
);

update public.health_activities
set group_id = 'c2000000-0000-4000-8000-000000000001',
    is_canonical = true
where id = 'c1000000-0000-4000-8000-000000000001';

insert into public.health_activities (
  user_id,
  provider,
  provider_native_id,
  source_identifier,
  metric_key,
  started_at,
  utc_offset_minutes,
  value_numeric,
  unit,
  group_id,
  is_canonical,
  suppressed_reason
)
values (
  'c1111111-1111-4111-8111-111111111111',
  'android_health_connect',
  'hc-sample-loser',
  'com.google.android.apps.fitness',
  'steps',
  timestamptz '2026-08-14 04:05:00+00',
  -240,
  1100,
  'count',
  'c2000000-0000-4000-8000-000000000001',
  false,
  'fuzzy_overlap'
);

select throws_ok(
  $$
    insert into public.health_activities (
      user_id, provider, provider_native_id, source_identifier, metric_key,
      started_at, utc_offset_minutes, value_numeric, unit, group_id, is_canonical
    ) values (
      'c1111111-1111-4111-8111-111111111111',
      'apple_healthkit',
      'hk-sample-second-canonical',
      'com.apple.health',
      'steps',
      timestamptz '2026-08-14 04:01:00+00',
      -240,
      1,
      'count',
      'c2000000-0000-4000-8000-000000000001',
      true
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "health_activities_one_canonical_per_group_uidx"',
  'each dedup group has at most one canonical activity'
);

select throws_ok(
  $$
    insert into public.health_activities (
      user_id, provider, provider_native_id, source_identifier, metric_key,
      started_at, utc_offset_minutes, value_numeric, unit, local_date
    ) values (
      'c1111111-1111-4111-8111-111111111111',
      'apple_healthkit',
      'hk-sample-local-date-write',
      'com.apple.health',
      'steps',
      timestamptz '2026-08-14 04:00:00+00',
      -240,
      1,
      'count',
      date '2026-08-20'
    )
  $$,
  '428C9',
  'cannot insert a non-DEFAULT value into column "local_date"',
  'local_date is generated from started_at plus per-record offset'
);

insert into public.health_daily_metrics (
  user_id,
  local_date,
  metric_key,
  value_numeric,
  canonical_activity_count
)
values (
  'c1111111-1111-4111-8111-111111111111',
  date '2026-08-14',
  'steps',
  1200,
  1
);

select throws_ok(
  $$
    insert into public.health_daily_metrics (
      user_id, local_date, metric_key, value_numeric
    ) values (
      'c1111111-1111-4111-8111-111111111111',
      date '2026-08-14',
      'steps',
      999
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "health_daily_metrics_pkey"',
  'daily metrics are unique per user, local_date, and metric'
);

insert into public.health_source_priority (
  user_id,
  metric_key,
  source_identifier,
  priority
)
values (
  'c1111111-1111-4111-8111-111111111111',
  'steps',
  'com.apple.health',
  1
);

select throws_ok(
  $$
    insert into public.health_source_priority (
      user_id, metric_key, source_identifier, priority
    ) values (
      'c1111111-1111-4111-8111-111111111111',
      'steps',
      'com.apple.health',
      2
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "health_source_priority_pkey"',
  'source priority is unique per user, metric, and source identifier'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'c1111111-1111-4111-8111-111111111111',
  true
);

select is(
  (
    select count(*)::integer
    from public.health_activities
    where user_id = 'c1111111-1111-4111-8111-111111111111'
  ),
  3,
  'owner can read their health activities'
);

select throws_ok(
  $$
    insert into public.health_activities (
      user_id, provider, provider_native_id, source_identifier, metric_key,
      started_at, utc_offset_minutes, value_numeric, unit
    ) values (
      'c1111111-1111-4111-8111-111111111111',
      'apple_healthkit',
      'hk-client-write',
      'com.apple.health',
      'steps',
      timestamptz '2026-08-14 06:00:00+00',
      -240,
      1,
      'count'
    )
  $$,
  '42501',
  'permission denied for table health_activities',
  'authenticated clients cannot write health activities directly'
);

select set_config(
  'request.jwt.claim.sub',
  'c2222222-2222-4222-8222-222222222222',
  true
);

select is(
  (
    select count(*)::integer
    from public.health_activities
    where user_id = 'c1111111-1111-4111-8111-111111111111'
  ),
  0,
  'users cannot read another user health activities'
);

select * from finish();
rollback;
