begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(16);
select set_config(
  'health.today',
  (pg_catalog.timezone('utc', now()))::date::text,
  true
);

insert into auth.users (id, email)
values
  ('f1111111-1111-4111-8111-111111111111', 'health-ux-alice@example.com'),
  ('f2222222-2222-4222-8222-222222222222', 'health-ux-bob@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values
  ('f1111111-1111-4111-8111-111111111111', 'health_ux_alice', 'America/Los_Angeles'),
  ('f2222222-2222-4222-8222-222222222222', 'health_ux_bob', 'UTC')
on conflict (id) do update
set timezone = excluded.timezone;

insert into public.goals (
  id,
  owner_id,
  title,
  category,
  category_key,
  frequency_type,
  recurrence_interval,
  start_date,
  end_date
)
values (
  'f1600000-0000-4000-8000-000000000001',
  'f1111111-1111-4111-8111-111111111111',
  'Walk',
  'Health',
  'health',
  'recurring',
  'daily',
    current_setting('health.today')::date - 30,
    current_setting('health.today')::date + 180
);

insert into public.health_source_priority (
  user_id,
  metric_key,
  source_identifier,
  priority
)
values
  (
    'f1111111-1111-4111-8111-111111111111',
    'steps',
    'com.apple.health.watch',
    1
  ),
  (
    'f1111111-1111-4111-8111-111111111111',
    'steps',
    'com.google.android.apps.fitness',
    2
  )
on conflict do nothing;

select has_table(
  'public',
  'health_autocomplete_rules',
  'health_autocomplete_rules exists'
);
select has_function(
  'public',
  'disconnect_health_provider_service',
  array['health_provider'],
  'disconnect_health_provider_service exists'
);
select has_function(
  'public',
  'apply_health_autocomplete_service',
  array['date'],
  'apply_health_autocomplete_service exists'
);

select throws_ok(
  $$select public.disconnect_health_provider_service('apple_healthkit')$$,
  '28000',
  'authentication_required',
  'disconnect requires authentication'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'f1111111-1111-4111-8111-111111111111',
  true
);

select is(
  (
    select (public.ingest_health_activities_service(
      jsonb_build_array(
        jsonb_build_object(
          'provider', 'apple_healthkit',
          'provider_native_id', 'watch-steps-ux',
          'source_identifier', 'com.apple.health.watch',
          'metric_key', 'steps',
          'started_at', current_setting('health.today') || 'T04:00:00Z',
          'ended_at', current_setting('health.today') || 'T04:10:00Z',
          'utc_offset_minutes', -240,
          'value_numeric', 1000,
          'unit', 'count'
        ),
        jsonb_build_object(
          'provider', 'android_health_connect',
          'provider_native_id', 'fit-steps-ux',
          'source_identifier', 'com.google.android.apps.fitness',
          'metric_key', 'steps',
          'started_at', current_setting('health.today') || 'T04:01:00Z',
          'ended_at', current_setting('health.today') || 'T04:11:00Z',
          'utc_offset_minutes', -240,
          'value_numeric', 400,
          'unit', 'count'
        )
      )
    )->>'ingested_count')::integer
  ),
  2,
  'ingest writes overlapping provider samples'
);

select is(
  (
    select is_canonical
    from public.health_activities
    where provider_native_id = 'watch-steps-ux'
      and user_id = 'f1111111-1111-4111-8111-111111111111'
  ),
  true,
  'higher-priority Apple sample is canonical before disconnect'
);

select is(
  (
    select is_canonical
    from public.health_activities
    where provider_native_id = 'fit-steps-ux'
      and user_id = 'f1111111-1111-4111-8111-111111111111'
  ),
  false,
  'lower-priority Health Connect sample is suppressed before disconnect'
);

select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(
      public.disconnect_health_provider_service('apple_healthkit')
    ) as key
  ),
  array['deleted_count', 'recomputed_days']::text[],
  'disconnect result does not include raw health values'
);

select is(
  (
    select count(*)::integer
    from public.health_activities
    where user_id = 'f1111111-1111-4111-8111-111111111111'
      and provider = 'apple_healthkit'
  ),
  0,
  'disconnect deletes the provider samples'
);

select is(
  (
    select is_canonical
    from public.health_activities
    where provider_native_id = 'fit-steps-ux'
      and user_id = 'f1111111-1111-4111-8111-111111111111'
  ),
  true,
  'remaining Health Connect sample is re-elected canonical'
);

select is(
  (
    select value_numeric::integer
    from public.health_daily_metrics
    where user_id = 'f1111111-1111-4111-8111-111111111111'
      and local_date = current_setting('health.today')::date
      and metric_key = 'steps'
  ),
  400,
  'daily metrics recompute from remaining canonical rows'
);

select is(
  (
    public.upsert_health_autocomplete_rule_service(
      'f1600000-0000-4000-8000-000000000001',
      'steps',
      300,
      true
    )->>'metric_key'
  ),
  'steps',
  'autocomplete rule upsert returns the metric key without daily totals'
);

select is(
  (
    public.apply_health_autocomplete_service(current_setting('health.today')::date)->>'applied_count'
  )::integer,
  1,
  'opt-in rule completes the goal from canonical daily totals'
);

select is(
  (
    select source::text
    from public.completions
    where goal_id = 'f1600000-0000-4000-8000-000000000001'
      and user_id = 'f1111111-1111-4111-8111-111111111111'
      and completed_on = current_setting('health.today')::date
  ),
  'external_sync',
  'autocomplete writes an external_sync completion'
);

select is(
  public.delete_health_autocomplete_rule_service(
    (
      select id
      from public.health_autocomplete_rules
      where user_id = 'f1111111-1111-4111-8111-111111111111'
    )
  ),
  true,
  'rule owner can delete an autocomplete rule'
);

select throws_ok(
  $$
    insert into public.health_autocomplete_rules (
      user_id,
      goal_id,
      metric_key,
      threshold_numeric
    ) values (
      'f1111111-1111-4111-8111-111111111111',
      'f1600000-0000-4000-8000-000000000001',
      'steps',
      100
    )
  $$,
  '42501',
  'permission denied for table health_autocomplete_rules',
  'authenticated clients cannot write autocomplete rules directly'
);

select * from finish();
rollback;
