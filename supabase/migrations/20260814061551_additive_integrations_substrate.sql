create table if not exists public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (
    provider in ('google_calendar', 'garmin', 'google_health_connect', 'apple_healthkit')
  ),
  connection_status text not null default 'active' check (
    connection_status in ('active', 'revoked', 'error')
  ),
  access_token_ciphertext text not null,
  refresh_token_ciphertext text null,
  token_expires_at timestamptz null,
  scope text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, provider)
);

create table if not exists public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (
    provider in ('google_calendar', 'garmin', 'google_health_connect', 'apple_healthkit')
  ),
  sync_kind text not null check (
    sync_kind in ('calendar_pull', 'calendar_push', 'health_pull')
  ),
  status text not null check (status in ('ok', 'error')),
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz not null default timezone('utc', now()),
  detail jsonb not null default '{}'::jsonb
);

create table if not exists public.integration_calendar_busy_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google_calendar')),
  day date not null,
  busy_minutes integer not null check (busy_minutes >= 0 and busy_minutes <= 1440),
  source_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, provider, day)
);

create table if not exists public.integration_health_daily_rollups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (
    provider in ('garmin', 'google_health_connect', 'apple_healthkit')
  ),
  day date not null,
  steps integer null check (steps is null or steps >= 0),
  active_minutes integer null check (active_minutes is null or active_minutes >= 0),
  workout_count integer null check (workout_count is null or workout_count >= 0),
  source_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, provider, day)
);

create index if not exists oauth_connections_user_provider_idx
on public.oauth_connections (user_id, provider);

create index if not exists integration_sync_runs_user_started_idx
on public.integration_sync_runs (user_id, started_at desc);

create index if not exists integration_calendar_busy_user_day_idx
on public.integration_calendar_busy_days (user_id, day);

create index if not exists integration_health_rollups_user_day_idx
on public.integration_health_daily_rollups (user_id, day);

drop trigger if exists set_oauth_connections_updated_at on public.oauth_connections;
create trigger set_oauth_connections_updated_at
before update on public.oauth_connections
for each row execute function public.set_updated_at();

drop trigger if exists set_integration_calendar_busy_days_updated_at on public.integration_calendar_busy_days;
create trigger set_integration_calendar_busy_days_updated_at
before update on public.integration_calendar_busy_days
for each row execute function public.set_updated_at();

drop trigger if exists set_integration_health_daily_rollups_updated_at on public.integration_health_daily_rollups;
create trigger set_integration_health_daily_rollups_updated_at
before update on public.integration_health_daily_rollups
for each row execute function public.set_updated_at();

alter table public.oauth_connections enable row level security;
alter table public.integration_sync_runs enable row level security;
alter table public.integration_calendar_busy_days enable row level security;
alter table public.integration_health_daily_rollups enable row level security;

drop policy if exists oauth_connections_select_self on public.oauth_connections;
create policy oauth_connections_select_self
on public.oauth_connections
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists integration_sync_runs_select_self on public.integration_sync_runs;
create policy integration_sync_runs_select_self
on public.integration_sync_runs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists integration_calendar_busy_days_select_self on public.integration_calendar_busy_days;
create policy integration_calendar_busy_days_select_self
on public.integration_calendar_busy_days
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists integration_health_daily_rollups_select_self on public.integration_health_daily_rollups;
create policy integration_health_daily_rollups_select_self
on public.integration_health_daily_rollups
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.oauth_connections from anon;
revoke all on table public.oauth_connections from authenticated;
grant select on table public.oauth_connections to authenticated;

revoke all on table public.integration_sync_runs from anon;
revoke all on table public.integration_sync_runs from authenticated;
grant select on table public.integration_sync_runs to authenticated;

revoke all on table public.integration_calendar_busy_days from anon;
revoke all on table public.integration_calendar_busy_days from authenticated;
grant select on table public.integration_calendar_busy_days to authenticated;

revoke all on table public.integration_health_daily_rollups from anon;
revoke all on table public.integration_health_daily_rollups from authenticated;
grant select on table public.integration_health_daily_rollups to authenticated;
