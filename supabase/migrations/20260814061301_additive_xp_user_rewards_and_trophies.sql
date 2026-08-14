create table if not exists public.user_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(pg_catalog.btrim(title)) between 1 and 120),
  note text null check (note is null or length(note) <= 500),
  unlock_total_xp integer not null check (unlock_total_xp > 0),
  unlocked_at timestamptz null,
  claimed_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_rewards_claim_requires_unlock
    check (claimed_at is null or unlocked_at is not null)
);

create index if not exists user_rewards_user_idx
on public.user_rewards (user_id, created_at desc);

create index if not exists user_rewards_unlock_idx
on public.user_rewards (user_id, unlock_total_xp)
where archived_at is null;

drop trigger if exists set_user_rewards_updated_at on public.user_rewards;
create trigger set_user_rewards_updated_at
before update on public.user_rewards
for each row execute function public.set_updated_at();

alter table public.user_rewards enable row level security;

drop policy if exists user_rewards_select_self on public.user_rewards;
create policy user_rewards_select_self
on public.user_rewards
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_rewards_insert_self on public.user_rewards;
create policy user_rewards_insert_self
on public.user_rewards
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_rewards_update_self on public.user_rewards;
create policy user_rewards_update_self
on public.user_rewards
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on table public.user_rewards from anon;
revoke all on table public.user_rewards from authenticated;
grant select on table public.user_rewards to authenticated;
grant insert (user_id, title, note, unlock_total_xp) on table public.user_rewards to authenticated;
grant update (title, note, unlock_total_xp, archived_at) on table public.user_rewards to authenticated;
