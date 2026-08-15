create table if not exists public.health_sync_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider public.health_provider not null,
  permission_prompted_at timestamptz,
  last_ingest_at timestamptz,
  last_sample_at timestamptz,
  last_error text,
  updated_at timestamptz not null default pg_catalog.timezone('utc', now()),
  primary key (user_id, provider),
  constraint health_sync_state_error_length check (
    last_error is null or pg_catalog.char_length(last_error) <= 500
  )
);

drop trigger if exists set_health_sync_state_updated_at on public.health_sync_state;
create trigger set_health_sync_state_updated_at
before update on public.health_sync_state
for each row execute function public.set_updated_at();

alter table public.health_sync_state enable row level security;

drop policy if exists health_sync_state_select_self on public.health_sync_state;
create policy health_sync_state_select_self
on public.health_sync_state
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.health_sync_state from anon, authenticated;
grant select on table public.health_sync_state to authenticated;
