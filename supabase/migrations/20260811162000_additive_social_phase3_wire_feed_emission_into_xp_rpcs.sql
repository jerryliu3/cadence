-- Social Phase 3:
-- Wire feed emission into XP RPCs (Approach A). No xp_ledger/xp_profiles triggers.

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
end;
$$;

create or replace function public.recompute_goal_xp_service(
  p_user_id uuid,
  p_goal_id uuid,
  p_force_zero boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows_written integer := 0;
  v_track_keys text[] := '{}'::text[];
  r record;
begin
  if p_user_id is null or p_goal_id is null then
    raise exception
      using errcode = '22023',
            message = 'xp_recompute_goal_args_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.xp:' || p_user_id::text || ':' || p_goal_id::text)
  );

  for r in
    with desired as (
      select *
      from private.goal_xp_credited_units(p_user_id, p_goal_id)
      where not p_force_zero
    ),
    current_balance as (
      select
        l.source_key,
        l.track_key,
        pg_catalog.min(l.event_type) as event_type,
        pg_catalog.max(l.earned_on) as earned_on,
        pg_catalog.sum(l.xp_delta)::integer as balance
      from public.xp_ledger l
      where l.user_id = p_user_id
        and l.goal_id = p_goal_id
      group by l.source_key, l.track_key
      having pg_catalog.sum(l.xp_delta) <> 0
    ),
    diff as (
      select
        coalesce(d.source_key, c.source_key) as source_key,
        coalesce(d.track_key, c.track_key) as track_key,
        coalesce(d.event_type, c.event_type) as event_type,
        coalesce(d.earned_on, c.earned_on) as earned_on,
        d.completion_id as completion_id,
        d.completion_source as completion_source,
        coalesce(d.xp_amount, 0) - coalesce(c.balance, 0) as xp_delta
      from desired d
      full outer join current_balance c
        on c.source_key = d.source_key
       and c.track_key = d.track_key
    )
    select *
    from diff
    where xp_delta <> 0
  loop
    insert into public.xp_ledger (
      user_id,
      goal_id,
      completion_id,
      track_key,
      event_type,
      entry_kind,
      source_key,
      xp_delta,
      earned_on,
      completion_source,
      metadata
    )
    values (
      p_user_id,
      p_goal_id,
      r.completion_id,
      r.track_key,
      r.event_type,
      case when r.xp_delta > 0 then 'award' else 'reversal' end,
      r.source_key,
      r.xp_delta,
      r.earned_on,
      r.completion_source,
      jsonb_build_object(
        'source', 'recompute_goal_xp_service',
        'force_zero', p_force_zero
      )
    );

    perform private.emit_feed_for_xp_ledger_row(
      p_user_id,
      r.event_type,
      r.track_key,
      p_goal_id,
      r.xp_delta,
      r.earned_on,
      r.source_key
    );

    v_rows_written := v_rows_written + 1;
    v_track_keys := pg_catalog.array_append(v_track_keys, r.track_key);
  end loop;

  if v_rows_written > 20 then
    raise warning 'xp_anomaly kind=large_delta user=% detail=%',
      p_user_id,
      jsonb_build_object(
        'goal_id', p_goal_id,
        'rows_written', v_rows_written
      );
  end if;

  if v_rows_written > 0 then
    perform private.refresh_xp_profile(p_user_id, v_track_keys);
  end if;

  return v_rows_written;
end;
$$;

