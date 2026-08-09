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
      and season.closed_at is not null
      and season.ends_at is not null
      and season.next_season_id is null
      and season.rollover <> 'none'::public.leaderboard_rollover
      and season.ends_at <= v_now
  loop
    v_next_slug := r_season.slug || '-' || to_char(r_season.ends_at, 'YYYYMMDD');

    insert into public.leaderboard_seasons (
      slug,
      title,
      subject_kind,
      metric,
      metric_track_key,
      scope,
      cohort_id,
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
      r_season.scope,
      r_season.cohort_id,
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
      update public.leaderboard_seasons season
      set next_season_id = v_next_id
      where season.id = r_season.id;
      v_count := v_count + 1;
    end if;
  end loop;

  insert into public.leaderboard_season_results (
    season_id, subject_kind, subject_id, score, tie_break_at, rank, display_name
  )
  select
    standing.season_id,
    standing.subject_kind,
    standing.subject_id,
    standing.score,
    standing.tie_break_at,
    standing.rank,
    case
      when standing.subject_kind = 'duo'::public.social_subject_kind then
        coalesce(duo_a.display_name, duo_a.username, 'Unknown')
        || ' + '
        || coalesce(duo_b.display_name, duo_b.username, 'Unknown')
      else
        coalesce(profile.display_name, profile.username, 'Unknown')
    end
  from public.leaderboard_standings standing
  join public.leaderboard_seasons season on season.id = standing.season_id
  left join public.profiles profile
    on standing.subject_kind = 'user'::public.social_subject_kind
    and profile.id = standing.subject_id
  left join public.duos duo
    on standing.subject_kind = 'duo'::public.social_subject_kind
    and duo.id = standing.subject_id
  left join public.profiles duo_a on duo_a.id = duo.user_a_id
  left join public.profiles duo_b on duo_b.id = duo.user_b_id
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
    and standing.subject_kind = 'user'::public.social_subject_kind
  on conflict (actor_id, event_type, subject_key, bucket_date) do nothing;

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
    member.actor_id,
    'season_result'::public.feed_event_type,
    standing.season_id::text || ':duo:' || standing.subject_id::text,
    current_date,
    season.metric_track_key,
    null,
    0,
    1,
    jsonb_build_object(
      'seasonId', standing.season_id,
      'rank', standing.rank,
      'score', standing.score,
      'duoId', standing.subject_id
    )
  from public.leaderboard_standings standing
  join public.leaderboard_seasons season
    on season.id = standing.season_id
  join public.duos duo
    on duo.id = standing.subject_id
  cross join lateral (
    values (duo.user_a_id), (duo.user_b_id)
  ) as member(actor_id)
  where season.status = 'closed'::public.leaderboard_season_status
    and standing.rank <= 3
    and standing.subject_kind = 'duo'::public.social_subject_kind
  on conflict (actor_id, event_type, subject_key, bucket_date) do nothing;

  return v_count;
end;
$$;
