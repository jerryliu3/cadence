begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(15);

insert into auth.users (id, email)
values
  ('d1111111-1111-4111-8111-111111111111', 'health-ingest-alice@example.com'),
  ('d2222222-2222-4222-8222-222222222222', 'health-ingest-bob@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values
  ('d1111111-1111-4111-8111-111111111111', 'health_ingest_alice', 'America/Los_Angeles'),
  ('d2222222-2222-4222-8222-222222222222', 'health_ingest_bob', 'UTC')
on conflict (id) do update
set timezone = excluded.timezone;

select has_function(
  'public',
  'ingest_health_activities_service',
  array['jsonb'],
  'ingest_health_activities_service exists'
);
select has_function(
  'public',
  'recompute_health_daily_metrics_service',
  array['date', 'date'],
  'recompute_health_daily_metrics_service exists'
);
select is(
  private.health_ingest_lock_key('d1111111-1111-4111-8111-111111111111')
    is distinct from
  private.health_ingest_lock_key('d2222222-2222-4222-8222-222222222222'),
  true,
  'ingest advisory lock keys differ by user'
);

select throws_ok(
  $$select public.ingest_health_activities_service('[]'::jsonb)$$,
  '28000',
  'authentication_required',
  'ingest requires authentication'
);

reset role;
insert into public.health_source_priority (
  user_id,
  metric_key,
  source_identifier,
  priority
)
values (
  'd1111111-1111-4111-8111-111111111111',
  'steps',
  'com.apple.health.watch',
  1
)
on conflict do nothing;
insert into public.health_source_priority (
  user_id,
  metric_key,
  source_identifier,
  priority
)
values (
  'd1111111-1111-4111-8111-111111111111',
  'steps',
  'com.apple.health.phone',
  2
)
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'd1111111-1111-4111-8111-111111111111',
  true
);

select is(
  (
    select (public.ingest_health_activities_service(
      jsonb_build_array(
        jsonb_build_object(
          'provider', 'apple_healthkit',
          'provider_native_id', 'watch-steps-1',
          'source_identifier', 'com.apple.health.watch',
          'source_name', 'Apple Watch',
          'metric_key', 'steps',
          'started_at', '2026-08-14T04:00:00Z',
          'ended_at', '2026-08-14T04:10:00Z',
          'utc_offset_minutes', -240,
          'value_numeric', 1200,
          'unit', 'count'
        ),
        jsonb_build_object(
          'provider', 'apple_healthkit',
          'provider_native_id', 'phone-steps-1',
          'source_identifier', 'com.apple.health.phone',
          'source_name', 'iPhone',
          'metric_key', 'steps',
          'started_at', '2026-08-14T04:01:00Z',
          'ended_at', '2026-08-14T04:11:00Z',
          'utc_offset_minutes', -240,
          'value_numeric', 900,
          'unit', 'count'
        )
      )
    )->>'ingested_count')::integer
  ),
  2,
  'ingest upserts a batch of samples'
);

select is(
  (
    select count(*)::integer
    from public.health_activities
    where user_id = 'd1111111-1111-4111-8111-111111111111'
      and is_canonical
      and metric_key = 'steps'
      and local_date = date '2026-08-14'
  ),
  1,
  'source-priority exclusion keeps one canonical overlapping sample'
);

select is(
  (
    select provider_native_id
    from public.health_activities
    where user_id = 'd1111111-1111-4111-8111-111111111111'
      and is_canonical
      and local_date = date '2026-08-14'
      and metric_key = 'steps'
  ),
  'watch-steps-1',
  'higher-priority source wins canonical election'
);

select is(
  (
    select suppressed_reason
    from public.health_activities
    where provider_native_id = 'phone-steps-1'
      and user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  'source_priority',
  'lower-priority overlapping sample is retained as a suppressed loser'
);

select is(
  (
    select value_numeric::integer
    from public.health_daily_metrics
    where user_id = 'd1111111-1111-4111-8111-111111111111'
      and local_date = date '2026-08-14'
      and metric_key = 'steps'
  ),
  1200,
  'daily metrics sum canonical rows only'
);

select is(
  (
    select (public.ingest_health_activities_service(
      jsonb_build_array(
        jsonb_build_object(
          'provider', 'apple_healthkit',
          'provider_native_id', 'watch-steps-1',
          'source_identifier', 'com.apple.health.watch',
          'source_name', 'Apple Watch',
          'metric_key', 'steps',
          'started_at', '2026-08-14T04:00:00Z',
          'ended_at', '2026-08-14T04:10:00Z',
          'utc_offset_minutes', -240,
          'value_numeric', 1250,
          'unit', 'count'
        )
      )
    )->>'ingested_count')::integer
  ),
  1,
  'native identity upserts revisions'
);

select is(
  (
    select value_numeric::integer
    from public.health_activities
    where provider_native_id = 'watch-steps-1'
      and user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  1250,
  'revision upsert replaces the provider-native row in place'
);

select is(
  (
    select local_date
    from public.health_activities
    where provider_native_id = 'watch-steps-1'
      and user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  date '2026-08-14',
  'ingest local_date uses per-record offset, not profile timezone'
);

-- Equal-priority residual overlap uses fuzzy grouping.
select public.ingest_health_activities_service(
  jsonb_build_array(
    jsonb_build_object(
      'provider', 'apple_healthkit',
      'provider_native_id', 'workout-a',
      'source_identifier', 'com.nike.ntc',
      'metric_key', 'workout_duration_minutes',
      'started_at', '2026-08-14T16:00:00Z',
      'ended_at', '2026-08-14T16:30:00Z',
      'utc_offset_minutes', -240,
      'value_numeric', 30,
      'unit', 'min'
    ),
    jsonb_build_object(
      'provider', 'android_health_connect',
      'provider_native_id', 'workout-b',
      'source_identifier', 'com.strava',
      'metric_key', 'workout_duration_minutes',
      'started_at', '2026-08-14T16:02:00Z',
      'ended_at', '2026-08-14T16:32:00Z',
      'utc_offset_minutes', -240,
      'value_numeric', 28,
      'unit', 'min'
    )
  )
);

select is(
  (
    select count(*)::integer
    from public.health_activities
    where user_id = 'd1111111-1111-4111-8111-111111111111'
      and metric_key = 'workout_duration_minutes'
      and is_canonical
  ),
  1,
  'fuzzy overlap elects one canonical workout'
);

select is(
  (
    select suppressed_reason
    from public.health_activities
    where provider_native_id = 'workout-b'
      and user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  'fuzzy_overlap',
  'fuzzy overlap retains the loser with suppressed_reason'
);

select throws_ok(
  $$
    select public.ingest_health_activities_service(
      (
        select jsonb_agg(jsonb_build_object(
          'provider', 'apple_healthkit',
          'provider_native_id', 'overflow-' || g.n::text,
          'source_identifier', 'com.apple.health.watch',
          'metric_key', 'steps',
          'started_at', '2026-08-14T04:00:00Z',
          'utc_offset_minutes', -240,
          'value_numeric', 1,
          'unit', 'count'
        ))
        from generate_series(1, 501) as g(n)
      )
    )
  $$,
  '22023',
  'health_sample_batch_too_large',
  'ingest rejects batches larger than 500'
);

select * from finish();
rollback;
