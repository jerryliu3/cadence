begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(21);

insert into auth.users (id, email)
values
  ('e1111111-1111-4111-8111-111111111111', 'health-external-alice@example.com'),
  ('e2222222-2222-4222-8222-222222222222', 'health-external-bob@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username, timezone)
values
  ('e1111111-1111-4111-8111-111111111111', 'health_external_alice', 'America/Los_Angeles'),
  ('e2222222-2222-4222-8222-222222222222', 'health_external_bob', 'UTC')
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
  target_count,
  start_date,
  end_date
)
values
  (
    'e1600000-0000-4000-8000-000000000001',
    'e1111111-1111-4111-8111-111111111111',
    'External cascade root',
    'Health',
    'health',
    'recurring',
    'weekly',
    6,
    date '2026-08-01',
    date '2026-11-30'
  ),
  (
    'e1600000-0000-4000-8000-000000000002',
    'e1111111-1111-4111-8111-111111111111',
    'External cascade middle',
    'Health',
    'health',
    'recurring',
    'weekly',
    6,
    date '2026-08-01',
    date '2026-11-30'
  ),
  (
    'e1600000-0000-4000-8000-000000000003',
    'e1111111-1111-4111-8111-111111111111',
    'External cascade leaf',
    'Health',
    'health',
    'recurring',
    'weekly',
    6,
    date '2026-08-01',
    date '2026-11-30'
  ),
  (
    'e1600000-0000-4000-8000-000000000004',
    'e1111111-1111-4111-8111-111111111111',
    'External window goal',
    'Health',
    'health',
    'recurring',
    'daily',
    null,
    date '2026-08-01',
    date '2026-11-30'
  ),
  (
    'e1600000-0000-4000-8000-000000000005',
    'e1111111-1111-4111-8111-111111111111',
    'External offset today goal',
    'Health',
    'health',
    'recurring',
    'daily',
    null,
    date '2099-06-01',
    date '2099-08-31'
  );

insert into public.goal_links (
  id,
  owner_id,
  source_goal_id,
  target_goal_id
)
values
  (
    'e1610000-0000-4000-8000-000000000001',
    'e1111111-1111-4111-8111-111111111111',
    'e1600000-0000-4000-8000-000000000001',
    'e1600000-0000-4000-8000-000000000002'
  ),
  (
    'e1610000-0000-4000-8000-000000000002',
    'e1111111-1111-4111-8111-111111111111',
    'e1600000-0000-4000-8000-000000000002',
    'e1600000-0000-4000-8000-000000000003'
  );

select has_table(
  'public',
  'completion_unmark_tombstones',
  'completion_unmark_tombstones exists'
);
select has_table(
  'public',
  'health_completion_links',
  'health_completion_links exists'
);
select has_function(
  'public',
  'apply_external_completion_service',
  array['uuid', 'date', 'date', 'text'],
  'apply_external_completion_service exists'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_enum as enum_value
    join pg_catalog.pg_type as enum_type
      on enum_type.oid = enum_value.enumtypid
    join pg_catalog.pg_namespace as enum_schema
      on enum_schema.oid = enum_type.typnamespace
    where enum_schema.nspname = 'public'
      and enum_type.typname = 'completion_source'
      and enum_value.enumlabel = 'external_sync'
  ),
  'completion_source includes external_sync'
);
select is(
  private.xp_points_for_completion_source('external_sync'::public.completion_source),
  private.xp_points_for_completion_source('manual'::public.completion_source),
  'external_sync XP matches manual completion points'
);
select isnt(
  private.xp_points_for_completion_source('external_sync'::public.completion_source),
  private.xp_points_for_completion_source('linked_cascade'::public.completion_source),
  'external_sync XP does not silently use cascade points'
);

select throws_ok(
  $$
    select public.apply_external_completion_service(
      'e1600000-0000-4000-8000-000000000004',
      date '2026-08-14',
      date '2026-08-14',
      'hk:steps:1'
    )
  $$,
  '28000',
  'authentication_required',
  'apply_external_completion_service requires authentication'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'e1111111-1111-4111-8111-111111111111',
  true
);

select is(
  public.apply_external_completion_service(
    'e1600000-0000-4000-8000-000000000001',
    date '2026-08-14',
    date '2026-08-14',
    'hk:cascade:1'
  ),
  true,
  'external apply writes the root completion'
);

select is(
  (
    select count(*)::integer
    from public.completions
    where user_id = 'e1111111-1111-4111-8111-111111111111'
      and completed_on = date '2026-08-14'
      and goal_id in (
        'e1600000-0000-4000-8000-000000000001',
        'e1600000-0000-4000-8000-000000000002',
        'e1600000-0000-4000-8000-000000000003'
      )
  ),
  3,
  'external apply cascades to linked goals'
);

select is(
  (
    select source::text
    from public.completions
    where goal_id = 'e1600000-0000-4000-8000-000000000001'
      and user_id = 'e1111111-1111-4111-8111-111111111111'
      and completed_on = date '2026-08-14'
  ),
  'external_sync',
  'root completion uses external_sync'
);

select is(
  (
    select array_agg(source::text order by goal_id)
    from public.completions
    where goal_id in (
        'e1600000-0000-4000-8000-000000000002',
        'e1600000-0000-4000-8000-000000000003'
      )
      and user_id = 'e1111111-1111-4111-8111-111111111111'
      and completed_on = date '2026-08-14'
  ),
  array['linked_cascade', 'linked_cascade']::text[],
  'linked goals keep linked_cascade source'
);

select is(
  (
    select xp_delta
    from public.xp_ledger
    where user_id = 'e1111111-1111-4111-8111-111111111111'
      and goal_id = 'e1600000-0000-4000-8000-000000000001'
      and event_type = 'completion_credit'
      and entry_kind = 'award'
      and completion_source = 'external_sync'::public.completion_source
  ),
  20,
  'external_sync ledger XP matches manual mapping'
);

select is(
  public.apply_external_completion_service(
    'e1600000-0000-4000-8000-000000000001',
    date '2026-08-14',
    date '2026-08-14',
    'hk:cascade:1'
  ),
  false,
  'repeat external keys are idempotent'
);

select is(
  public.apply_external_completion_service(
    'e1600000-0000-4000-8000-000000000004',
    date '2026-08-13',
    date '2026-08-14',
    'hk:window:yesterday'
  ),
  true,
  'yesterday is eligible relative to p_local_today'
);

select is(
  public.apply_external_completion_service(
    'e1600000-0000-4000-8000-000000000004',
    date '2026-08-12',
    date '2026-08-14',
    'hk:window:older'
  ),
  false,
  'dates older than yesterday are rejected'
);

select is(
  public.apply_external_completion_service(
    'e1600000-0000-4000-8000-000000000005',
    date '2099-06-15',
    date '2099-06-15',
    'hk:window:offset-today'
  ),
  true,
  'p_local_today is used instead of profiles.timezone'
);

select is(
  public.apply_external_completion_service(
    'e1600000-0000-4000-8000-000000000004',
    date '2026-08-14',
    date '2026-08-14',
    'hk:window:today'
  ),
  true,
  'today is eligible relative to p_local_today'
);

select public.unmark_goal_complete(
  'e1600000-0000-4000-8000-000000000004',
  date '2026-08-14'
);

select is(
  public.apply_external_completion_service(
    'e1600000-0000-4000-8000-000000000004',
    date '2026-08-14',
    date '2026-08-14',
    'hk:window:resurrect'
  ),
  false,
  'manually unmarked days are not resurrected'
);

select lives_ok(
  $tap$
    select public.mark_goal_complete(
      'e1600000-0000-4000-8000-000000000004',
      date '2026-08-14'
    )
  $tap$,
  'manual complete still works after an unmark tombstone'
);

select set_config(
  'request.jwt.claim.sub',
  'e2222222-2222-4222-8222-222222222222',
  true
);

select throws_ok(
  $$
    select public.apply_external_completion_service(
      'e1600000-0000-4000-8000-000000000001',
      date '2026-08-14',
      date '2026-08-14',
      'hk:other-user'
    )
  $$,
  '42501',
  'not_authorized_for_goal',
  'users cannot apply external completions to another owner goal'
);

select set_config(
  'request.jwt.claim.sub',
  'e1111111-1111-4111-8111-111111111111',
  true
);

select throws_ok(
  $$
    insert into public.completion_unmark_tombstones (
      user_id,
      goal_id,
      completed_on
    ) values (
      'e1111111-1111-4111-8111-111111111111',
      'e1600000-0000-4000-8000-000000000004',
      date '2026-08-10'
    )
  $$,
  '42501',
  'permission denied for table completion_unmark_tombstones',
  'authenticated clients cannot write unmark tombstones directly'
);

select * from finish();
rollback;
