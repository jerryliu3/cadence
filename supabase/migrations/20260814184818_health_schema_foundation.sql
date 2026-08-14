-- Wave 1 health schema: on-device HealthKit / Health Connect ingest.
-- Full dedup path is required (see docs/integrations/health-device-findings.md).

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'health_provider'
  ) then
    create type public.health_provider as enum (
      'apple_healthkit',
      'android_health_connect'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'health_metric_key'
  ) then
    create type public.health_metric_key as enum (
      'steps',
      'active_energy_kcal',
      'distance_meters',
      'exercise_minutes',
      'sleep_asleep_minutes',
      'workout_duration_minutes'
    );
  end if;
end;
$$;

create or replace function public.health_local_date_from_offset(
  p_started_at timestamptz,
  p_utc_offset_minutes integer
)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (
    (p_started_at at time zone 'utc')
    + pg_catalog.make_interval(mins => p_utc_offset_minutes)
  )::date;
$$;

revoke all on function public.health_local_date_from_offset(timestamptz, integer)
  from public, anon;
grant execute on function public.health_local_date_from_offset(timestamptz, integer)
  to authenticated, service_role;

create table if not exists public.health_activity_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  metric_key public.health_metric_key not null,
  local_date date not null,
  created_at timestamptz not null default pg_catalog.timezone('utc', now())
);

create index if not exists health_activity_groups_user_day_metric_idx
  on public.health_activity_groups (user_id, local_date, metric_key);

create table if not exists public.health_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider public.health_provider not null,
  provider_native_id text not null,
  source_identifier text not null,
  source_name text,
  metric_key public.health_metric_key not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  utc_offset_minutes integer not null,
  local_date date generated always as (
    public.health_local_date_from_offset(started_at, utc_offset_minutes)
  ) stored,
  value_numeric numeric not null,
  unit text not null,
  payload jsonb not null default '{}'::jsonb,
  group_id uuid references public.health_activity_groups(id) on delete set null,
  is_canonical boolean not null default true,
  suppressed_reason text,
  created_at timestamptz not null default pg_catalog.timezone('utc', now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', now()),
  constraint health_activities_native_id_length check (
    pg_catalog.char_length(pg_catalog.btrim(provider_native_id)) between 1 and 256
  ),
  constraint health_activities_source_identifier_length check (
    pg_catalog.char_length(pg_catalog.btrim(source_identifier)) between 1 and 256
  ),
  constraint health_activities_source_name_length check (
    source_name is null
    or pg_catalog.char_length(source_name) <= 256
  ),
  constraint health_activities_unit_length check (
    pg_catalog.char_length(pg_catalog.btrim(unit)) between 1 and 32
  ),
  constraint health_activities_utc_offset_range check (
    utc_offset_minutes between -840 and 840
  ),
  constraint health_activities_value_nonnegative check (value_numeric >= 0),
  constraint health_activities_ended_at_order check (
    ended_at is null or ended_at >= started_at
  ),
  constraint health_activities_canonical_reason_chk check (
    (is_canonical and suppressed_reason is null)
    or (
      not is_canonical
      and suppressed_reason in (
        'source_priority',
        'fuzzy_overlap',
        'replaced_revision',
        'disconnected'
      )
    )
  )
);

create unique index if not exists health_activities_provider_native_uidx
  on public.health_activities (user_id, provider, provider_native_id);

-- Per-group canonical uniqueness. PostgreSQL unique indexes allow multiple
-- NULLs, so ungrouped singletons are unconstrained by design: cumulative
-- metrics (steps, energy, distance) keep many canonical buckets. Fuzzy
-- clustering assigns group_id only for workout_duration_minutes duplicates.
create unique index if not exists health_activities_one_canonical_per_group_uidx
  on public.health_activities (group_id)
  where is_canonical and group_id is not null;

create index if not exists health_activities_user_local_metric_idx
  on public.health_activities (user_id, local_date, metric_key);

create index if not exists health_activities_canonical_day_idx
  on public.health_activities (user_id, local_date, metric_key)
  where is_canonical;

create table if not exists public.health_daily_metrics (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  metric_key public.health_metric_key not null,
  value_numeric numeric not null,
  canonical_activity_count integer not null default 0,
  updated_at timestamptz not null default pg_catalog.timezone('utc', now()),
  primary key (user_id, local_date, metric_key),
  constraint health_daily_metrics_value_nonnegative check (value_numeric >= 0),
  constraint health_daily_metrics_count_nonnegative check (
    canonical_activity_count >= 0
  )
);

create table if not exists public.health_source_priority (
  user_id uuid not null references public.profiles(id) on delete cascade,
  metric_key public.health_metric_key not null,
  source_identifier text not null,
  priority integer not null,
  updated_at timestamptz not null default pg_catalog.timezone('utc', now()),
  primary key (user_id, metric_key, source_identifier),
  constraint health_source_priority_identifier_length check (
    pg_catalog.char_length(pg_catalog.btrim(source_identifier)) between 1 and 256
  ),
  constraint health_source_priority_rank check (priority >= 1)
);

drop trigger if exists set_health_activities_updated_at on public.health_activities;
create trigger set_health_activities_updated_at
before update on public.health_activities
for each row execute function public.set_updated_at();

drop trigger if exists set_health_daily_metrics_updated_at on public.health_daily_metrics;
create trigger set_health_daily_metrics_updated_at
before update on public.health_daily_metrics
for each row execute function public.set_updated_at();

drop trigger if exists set_health_source_priority_updated_at on public.health_source_priority;
create trigger set_health_source_priority_updated_at
before update on public.health_source_priority
for each row execute function public.set_updated_at();

alter table public.health_activity_groups enable row level security;
alter table public.health_activities enable row level security;
alter table public.health_daily_metrics enable row level security;
alter table public.health_source_priority enable row level security;

drop policy if exists health_activity_groups_select_self
  on public.health_activity_groups;
create policy health_activity_groups_select_self
on public.health_activity_groups
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists health_activities_select_self
  on public.health_activities;
create policy health_activities_select_self
on public.health_activities
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists health_daily_metrics_select_self
  on public.health_daily_metrics;
create policy health_daily_metrics_select_self
on public.health_daily_metrics
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists health_source_priority_select_self
  on public.health_source_priority;
create policy health_source_priority_select_self
on public.health_source_priority
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.health_activity_groups from anon, authenticated;
revoke all on table public.health_activities from anon, authenticated;
revoke all on table public.health_daily_metrics from anon, authenticated;
revoke all on table public.health_source_priority from anon, authenticated;

grant select on table public.health_activity_groups to authenticated;
grant select on table public.health_activities to authenticated;
grant select on table public.health_daily_metrics to authenticated;
grant select on table public.health_source_priority to authenticated;
