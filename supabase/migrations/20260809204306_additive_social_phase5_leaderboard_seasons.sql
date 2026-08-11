-- Social Phase 5:
-- Leaderboard seasons, live standings refresh, and rollover snapshots.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'leaderboard_season_status'
  ) then
    create type public.leaderboard_season_status as enum ('upcoming', 'open', 'closed');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'leaderboard_rollover'
  ) then
    create type public.leaderboard_rollover as enum ('none', 'weekly', 'monthly', 'quarterly', 'yearly');
  end if;
end;
$$;

create table if not exists public.leaderboard_seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subject_kind public.social_subject_kind not null default 'user',
  metric public.challenge_metric not null default 'total_xp',
  metric_track_key text references public.goal_categories(key) on update cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status public.leaderboard_season_status not null default 'upcoming',
  rollover public.leaderboard_rollover not null default 'none',
  previous_season_id uuid references public.leaderboard_seasons(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint leaderboard_seasons_window check (ends_at is null or ends_at > starts_at),
  constraint leaderboard_seasons_track_required check (
    metric <> 'category_xp'::public.challenge_metric
    or metric_track_key is not null
  ),
  constraint leaderboard_seasons_rollover_needs_end check (
    rollover = 'none'::public.leaderboard_rollover
    or ends_at is not null
  )
);

create unique index if not exists leaderboard_seasons_one_open
  on public.leaderboard_seasons (subject_kind, metric, coalesce(metric_track_key, ''))
  where status = 'open';

drop trigger if exists set_leaderboard_seasons_updated_at
on public.leaderboard_seasons;
create trigger set_leaderboard_seasons_updated_at
before update on public.leaderboard_seasons
for each row execute function public.set_updated_at();

create table if not exists public.leaderboard_standings (
  season_id uuid not null references public.leaderboard_seasons(id) on delete cascade,
  subject_kind public.social_subject_kind not null,
  subject_id uuid not null,
  score numeric not null default 0,
  tie_break_at timestamptz,
  rank integer not null,
  refreshed_at timestamptz not null default pg_catalog.now(),
  primary key (season_id, subject_kind, subject_id)
);

create index if not exists leaderboard_standings_rank_idx
  on public.leaderboard_standings (season_id, rank);

create table if not exists public.leaderboard_season_results (
  season_id uuid not null references public.leaderboard_seasons(id) on delete cascade,
  subject_kind public.social_subject_kind not null,
  subject_id uuid not null,
  score numeric not null,
  tie_break_at timestamptz,
  rank integer not null,
  display_name text not null,
  frozen_at timestamptz not null default pg_catalog.now(),
  primary key (season_id, subject_kind, subject_id)
);

create index if not exists leaderboard_results_rank_idx
  on public.leaderboard_season_results (season_id, rank);

create or replace function private.next_rollover_end(
  p_rollover public.leaderboard_rollover,
  p_starts_at timestamptz
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  case p_rollover
    when 'weekly'::public.leaderboard_rollover then
      return p_starts_at + interval '7 days';
    when 'monthly'::public.leaderboard_rollover then
      return p_starts_at + interval '1 month';
    when 'quarterly'::public.leaderboard_rollover then
      return p_starts_at + interval '3 months';
    when 'yearly'::public.leaderboard_rollover then
      return p_starts_at + interval '1 year';
    else
      return null;
  end case;
end;
$$;

create or replace function public.refresh_leaderboard_standings_service()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_rows integer := 0;
  v_inserted integer := 0;
  v_from date;
  v_to date;
  r_season public.leaderboard_seasons%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.leaderboard_refresh')
  );

  update public.leaderboard_seasons season
  set
    status = 'open'::public.leaderboard_season_status,
    updated_at = v_now
  where season.status = 'upcoming'::public.leaderboard_season_status
    and season.starts_at <= v_now
    and (season.ends_at is null or season.ends_at > v_now);

  for r_season in
    select season.*
    from public.leaderboard_seasons season
    where season.status = 'open'::public.leaderboard_season_status
  loop
    v_from := (r_season.starts_at at time zone 'UTC')::date;
    v_to := (
      case
        when r_season.ends_at is null then v_now
        else least(r_season.ends_at, v_now)
      end at time zone 'UTC'
    )::date;

    delete from public.leaderboard_standings standing
    where standing.season_id = r_season.id;

    if r_season.subject_kind = 'user'::public.social_subject_kind then
      insert into public.leaderboard_standings (
        season_id,
        subject_kind,
        subject_id,
        score,
        tie_break_at,
        rank,
        refreshed_at
      )
      select
        r_season.id,
        'user'::public.social_subject_kind,
        ranked.subject_id,
        ranked.score,
        ranked.tie_break_at,
        ranked.rank,
        v_now
      from (
        select
          scored.subject_id,
          scored.score,
          scored.tie_break_at,
          dense_rank() over (
            order by scored.score desc, scored.tie_break_at asc nulls last, scored.subject_id asc
          )::integer as rank
        from (
          select
            profile.id as subject_id,
            private.challenge_progress_value(
              r_season.metric,
              r_season.metric_track_key,
              array[profile.id]::uuid[],
              v_from,
              v_to
            ) as score,
            (
              select min(ledger.created_at)
              from public.xp_ledger ledger
              where ledger.user_id = profile.id
                and ledger.earned_on between v_from and v_to
                and (
                  (r_season.metric in ('total_xp', 'category_xp')
                    and ledger.event_type in ('completion_credit', 'goal_achievement'))
                  or (
                    r_season.metric in (
                      'completions_count',
                      'distinct_active_days',
                      'max_streak_days'
                    )
                    and ledger.event_type = 'completion_credit'
                    and ledger.xp_delta > 0
                  )
                )
                and (
                  r_season.metric <> 'category_xp'
                  or ledger.track_key = r_season.metric_track_key
                )
            ) as tie_break_at
          from public.profiles profile

          where exists (
            select 1
            from public.xp_ledger ledger
            where ledger.user_id = profile.id
              and ledger.earned_on between v_from and v_to
          )
        ) scored
      ) ranked;

      get diagnostics v_inserted = row_count;
      v_rows := v_rows + v_inserted;
    end if;

    if r_season.ends_at is not null and r_season.ends_at <= v_now then
      update public.leaderboard_seasons season
      set
        status = 'closed'::public.leaderboard_season_status,
        updated_at = v_now
      where season.id = r_season.id
        and season.status = 'open'::public.leaderboard_season_status;
    end if;
  end loop;

  return v_rows;
end;
$$;

create or replace function public.rollover_leaderboard_seasons_service()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_count integer := 0;
  v_next_id uuid;
  v_next_slug text;
  r_season public.leaderboard_seasons%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.leaderboard_rollover')
  );

  perform public.refresh_leaderboard_standings_service();

  for r_season in
    select season.*
    from public.leaderboard_seasons season
    where season.status = 'closed'::public.leaderboard_season_status
      and season.ends_at is not null
      and season.rollover <> 'none'::public.leaderboard_rollover
      and season.ends_at <= v_now
      and not exists (
        select 1
        from public.leaderboard_seasons child
        where child.previous_season_id = season.id
      )
  loop
    v_next_slug := r_season.slug || '-' || to_char(r_season.ends_at, 'YYYYMMDD');

    insert into public.leaderboard_seasons (
      slug,
      title,
      subject_kind,
      metric,
      metric_track_key,
      starts_at,
      ends_at,
      status,
      rollover,
      previous_season_id,
      created_by
    )
    values (
      v_next_slug,
      r_season.title,
      r_season.subject_kind,
      r_season.metric,
      r_season.metric_track_key,
      r_season.ends_at,
      private.next_rollover_end(r_season.rollover, r_season.ends_at),
      'open'::public.leaderboard_season_status,
      r_season.rollover,
      r_season.id,
      r_season.created_by
    )
    on conflict (slug) do nothing
    returning id into v_next_id;

    if v_next_id is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  insert into public.leaderboard_season_results (
    season_id,
    subject_kind,
    subject_id,
    score,
    tie_break_at,
    rank,
    display_name
  )
  select
    standing.season_id,
    standing.subject_kind,
    standing.subject_id,
    standing.score,
    standing.tie_break_at,
    standing.rank,
    coalesce(profile.display_name, profile.username, 'Unknown')
  from public.leaderboard_standings standing
  join public.leaderboard_seasons season
    on season.id = standing.season_id
  left join public.profiles profile
    on profile.id = standing.subject_id
  where season.status = 'closed'::public.leaderboard_season_status
  on conflict (season_id, subject_kind, subject_id) do nothing;

  insert into public.feed_events (
    actor_id,
    event_type,
    subject_key,
    bucket_date,
    track_key,
    goal_id,
    xp_delta,
    occurrence_count,
    payload
  )
  select
    standing.subject_id,
    'season_result'::public.feed_event_type,
    standing.season_id::text,
    current_date,
    season.metric_track_key,
    null,
    0,
    1,
    jsonb_build_object(
      'seasonId', standing.season_id,
      'rank', standing.rank,
      'score', standing.score
    )
  from public.leaderboard_standings standing
  join public.leaderboard_seasons season
    on season.id = standing.season_id
  where season.status = 'closed'::public.leaderboard_season_status
    and standing.rank <= 3
  on conflict (actor_id, event_type, subject_key, bucket_date) do nothing;

  return v_count;
end;
$$;

create or replace function public.get_social_leaderboards()
returns table (
  id uuid,
  slug text,
  title text,
  subject_kind public.social_subject_kind,
  metric public.challenge_metric,
  metric_track_key text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.leaderboard_season_status,
  rollover public.leaderboard_rollover
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  return query
  select
    season.id,
    season.slug,
    season.title,
    season.subject_kind,
    season.metric,
    season.metric_track_key,
    season.starts_at,
    season.ends_at,
    season.status,
    season.rollover
  from public.leaderboard_seasons season
  where season.status in (
    'open'::public.leaderboard_season_status,
    'closed'::public.leaderboard_season_status
  )
  order by
    case season.status
      when 'open'::public.leaderboard_season_status then 0
      else 1
    end,
    coalesce(season.ends_at, season.starts_at) desc
  limit 20;
end;
$$;

create or replace function public.get_social_leaderboard_season(p_season_id uuid)
returns table (
  id uuid,
  slug text,
  title text,
  subject_kind public.social_subject_kind,
  metric public.challenge_metric,
  metric_track_key text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.leaderboard_season_status,
  rollover public.leaderboard_rollover
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_season_id is null then
    raise exception using errcode = '22023', message = 'season_id_required';
  end if;

  return query
  select
    season.id,
    season.slug,
    season.title,
    season.subject_kind,
    season.metric,
    season.metric_track_key,
    season.starts_at,
    season.ends_at,
    season.status,
    season.rollover
  from public.leaderboard_seasons season
  where season.id = p_season_id
    and season.status in (
      'open'::public.leaderboard_season_status,
      'closed'::public.leaderboard_season_status
    );
end;
$$;

create or replace function public.get_leaderboard_standings(
  p_season_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  season_id uuid,
  subject_kind public.social_subject_kind,
  subject_id uuid,
  display_name text,
  score numeric,
  rank integer,
  tie_break_at timestamptz,
  viewer_rank integer
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_subject_kind public.social_subject_kind;
  v_status public.leaderboard_season_status;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_season_id is null then
    raise exception using errcode = '22023', message = 'season_id_required';
  end if;

  select season.subject_kind, season.status
  into v_subject_kind, v_status
  from public.leaderboard_seasons season
  where season.id = p_season_id;

  if not found then
    raise exception using errcode = '22023', message = 'season_not_found';
  end if;

  if v_status = 'closed'::public.leaderboard_season_status then
    return query
    with viewer as (
      select result.rank as viewer_rank
      from public.leaderboard_season_results result
      where result.season_id = p_season_id
        and result.subject_kind = v_subject_kind
        and result.subject_id = v_uid
    )
    select
      result.season_id,
      result.subject_kind,
      result.subject_id,
      result.display_name,
      result.score,
      result.rank,
      result.tie_break_at,
      (select viewer.viewer_rank from viewer) as viewer_rank
    from public.leaderboard_season_results result
    where result.season_id = p_season_id
    order by result.rank asc
    limit v_limit
    offset v_offset;
    return;
  end if;

  return query
  with viewer as (
    select standing.rank as viewer_rank
    from public.leaderboard_standings standing
    where standing.season_id = p_season_id
      and standing.subject_kind = v_subject_kind
      and standing.subject_id = v_uid
  )
  select
    standing.season_id,
    standing.subject_kind,
    standing.subject_id,
    coalesce(profile.display_name, profile.username, 'Unknown') as display_name,
    standing.score,
    standing.rank,
    standing.tie_break_at,
    (select viewer.viewer_rank from viewer) as viewer_rank
  from public.leaderboard_standings standing
  left join public.profiles profile
    on profile.id = standing.subject_id
  where standing.season_id = p_season_id
  order by standing.rank asc
  limit v_limit
  offset v_offset;
end;
$$;

alter table public.leaderboard_seasons enable row level security;
alter table public.leaderboard_standings enable row level security;
alter table public.leaderboard_season_results enable row level security;

revoke all on table public.leaderboard_seasons
  from public, anon, authenticated;
revoke all on table public.leaderboard_standings
  from public, anon, authenticated;
revoke all on table public.leaderboard_season_results
  from public, anon, authenticated;
grant select, insert, update, delete on table public.leaderboard_seasons to service_role;
grant select, insert, update, delete on table public.leaderboard_standings to service_role;
grant select, insert, update, delete on table public.leaderboard_season_results to service_role;

revoke all on function private.next_rollover_end(public.leaderboard_rollover, timestamptz)
  from public, anon, authenticated;
revoke all on function public.refresh_leaderboard_standings_service()
  from public, anon, authenticated;
grant execute on function public.refresh_leaderboard_standings_service()
  to service_role;
revoke all on function public.rollover_leaderboard_seasons_service()
  from public, anon, authenticated;
grant execute on function public.rollover_leaderboard_seasons_service()
  to service_role;

revoke all on function public.get_social_leaderboards()
  from public, anon;
grant execute on function public.get_social_leaderboards()
  to authenticated;

revoke all on function public.get_social_leaderboard_season(uuid)
  from public, anon;
grant execute on function public.get_social_leaderboard_season(uuid)
  to authenticated;

revoke all on function public.get_leaderboard_standings(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_leaderboard_standings(uuid, integer, integer)
  to authenticated;

do $cron$
begin
  begin
    perform cron.unschedule('refresh-leaderboard-standings');
  exception
    when others then null;
  end;
  begin
    perform cron.unschedule('rollover-leaderboard-seasons-hourly');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'refresh-leaderboard-standings',
    '*/15 * * * *',
    $job$select public.refresh_leaderboard_standings_service()$job$
  );

  perform cron.schedule(
    'rollover-leaderboard-seasons-hourly',
    '5 * * * *',
    $job$select public.rollover_leaderboard_seasons_service()$job$
  );
exception
  when others then null;
end;
$cron$;
