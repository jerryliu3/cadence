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

-- Unlock personal rewards from the XP write path so trophy GET stays read-only.
-- Keep the rest of private.refresh_xp_profile equivalent to
-- 20260811162000_additive_social_phase3_wire_feed_emission_into_xp_rpcs.sql.
create or replace function private.refresh_xp_profile(
  p_user_id uuid,
  p_track_keys text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_global_total integer;
  v_global_level integer;
  v_prev_global_level integer;
  v_tracks text[];
  v_track text;
  v_track_total integer;
  v_track_level integer;
  v_prev_track_level integer;
begin
  if p_user_id is null then
    raise exception
      using errcode = '22023',
            message = 'xp_user_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.xp.profile:' || p_user_id::text)
  );

  select coalesce(pg_catalog.sum(l.xp_delta), 0)::integer
  into v_global_total
  from public.xp_ledger l
  where l.user_id = p_user_id;

  if v_global_total < 0 then
    raise warning 'xp_anomaly kind=negative_total user=% detail=%',
      p_user_id,
      jsonb_build_object('track', 'global', 'total_xp', v_global_total);
  end if;

  v_global_level := private.xp_level_for_total(v_global_total);

  select profile.current_level
  into v_prev_global_level
  from public.xp_profiles profile
  where profile.user_id = p_user_id
    and profile.track_key = 'global';

  insert into public.xp_profiles (
    user_id,
    track_key,
    total_xp,
    current_level
  )
  values (
    p_user_id,
    'global',
    v_global_total,
    v_global_level
  )
  on conflict (user_id, track_key)
  do update
  set
    total_xp = excluded.total_xp,
    current_level = excluded.current_level,
    updated_at = pg_catalog.now();

  -- Null previous level means first profile materialization; do not emit
  -- a synthetic 0 -> N level_up for brand-new users.
  perform private.emit_feed_for_xp_level_up(
    p_user_id,
    'global',
    v_prev_global_level,
    v_global_level
  );

  if p_track_keys is null or pg_catalog.cardinality(p_track_keys) = 0 then
    select pg_catalog.array_agg(distinct track_key order by track_key)
    into v_tracks
    from (
      select l.track_key
      from public.xp_ledger l
      where l.user_id = p_user_id
        and l.track_key <> 'global'
      union
      select p.track_key
      from public.xp_profiles p
      where p.user_id = p_user_id
        and p.track_key <> 'global'
    ) as track_set;
  else
    select pg_catalog.array_agg(distinct t order by t)
    into v_tracks
    from unnest(p_track_keys) as t
    where t is not null
      and pg_catalog.btrim(t) <> ''
      and t <> 'global';
  end if;

  if v_tracks is not null and pg_catalog.cardinality(v_tracks) > 0 then
    foreach v_track in array v_tracks loop
      select coalesce(pg_catalog.sum(l.xp_delta), 0)::integer
      into v_track_total
      from public.xp_ledger l
      where l.user_id = p_user_id
        and l.track_key = v_track;

      if v_track_total < 0 then
        raise warning 'xp_anomaly kind=negative_total user=% detail=%',
          p_user_id,
          jsonb_build_object('track', v_track, 'total_xp', v_track_total);
      end if;

      if v_track_total = 0 then
        delete from public.xp_profiles
        where user_id = p_user_id
          and track_key = v_track;
      else
        v_track_level := private.xp_level_for_total(v_track_total);

        select profile.current_level
        into v_prev_track_level
        from public.xp_profiles profile
        where profile.user_id = p_user_id
          and profile.track_key = v_track;

        insert into public.xp_profiles (
          user_id,
          track_key,
          total_xp,
          current_level
        )
        values (
          p_user_id,
          v_track,
          v_track_total,
          v_track_level
        )
        on conflict (user_id, track_key)
        do update
        set
          total_xp = excluded.total_xp,
          current_level = excluded.current_level,
          updated_at = pg_catalog.now();

        perform private.emit_feed_for_xp_level_up(
          p_user_id,
          v_track,
          v_prev_track_level,
          v_track_level
        );
      end if;
    end loop;
  end if;

  insert into public.user_awards (user_id, reward_id)
  select p_user_id, r.id
  from public.xp_rewards r
  where r.level <= v_global_level
  on conflict (user_id, reward_id) do nothing;

  update public.user_awards ua
  set revoked_at = coalesce(ua.revoked_at, pg_catalog.now())
  from public.xp_rewards r
  where ua.user_id = p_user_id
    and ua.reward_id = r.id
    and r.level > v_global_level
    and ua.revoked_at is null;

  update public.user_rewards
  set unlocked_at = pg_catalog.timezone('utc', pg_catalog.now())
  where user_id = p_user_id
    and archived_at is null
    and unlocked_at is null
    and unlock_total_xp <= v_global_total;
end;
$$;
