-- Forward-only follow-up for social stack fixes.
-- This migration replays SQL changes that were previously edited in already-shipped migrations.

create or replace function private.next_rollover_end(
  p_rollover public.leaderboard_rollover,
  p_starts_at timestamptz
)
returns timestamptz
language plpgsql
stable
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

    v_inserted := 0;

    if r_season.subject_kind = 'user'::public.social_subject_kind then
      insert into public.leaderboard_standings (
        season_id, subject_kind, subject_id, score, tie_break_at, rank, refreshed_at
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
                  (r_season.metric in ('total_xp', 'category_xp') and ledger.event_type in ('completion_credit', 'goal_achievement'))
                  or (
                    r_season.metric in ('completions_count', 'distinct_active_days', 'max_streak_days')
                    and ledger.event_type = 'completion_credit'
                    and ledger.xp_delta > 0
                  )
                )
                and (r_season.metric <> 'category_xp' or ledger.track_key = r_season.metric_track_key)
            ) as tie_break_at
          from public.profiles profile
          where exists (
              select 1
              from public.xp_ledger ledger
              where ledger.user_id = profile.id
                and ledger.earned_on between v_from and v_to
            )
            and profile.social_activity_visible = true
            and (
              r_season.scope = 'global'::public.leaderboard_scope_kind
              or (
                r_season.scope = 'cohort'::public.leaderboard_scope_kind
                and private.viewer_in_cohort(profile.id, r_season.cohort_id)
              )
            )
        ) scored
      ) ranked;
      get diagnostics v_inserted = row_count;
    elsif r_season.subject_kind = 'team'::public.social_subject_kind then
      insert into public.leaderboard_standings (
        season_id, subject_kind, subject_id, score, tie_break_at, rank, refreshed_at
      )
      select
        r_season.id,
        'team'::public.social_subject_kind,
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
            team.id as subject_id,
            private.challenge_progress_value(
              r_season.metric,
              r_season.metric_track_key,
              array[team.user_a_id, team.user_b_id]::uuid[],
              v_from,
              v_to
            ) as score,
            (
              select min(ledger.created_at)
              from public.xp_ledger ledger
              where ledger.user_id in (team.user_a_id, team.user_b_id)
                and ledger.earned_on between v_from and v_to
                and (
                  (r_season.metric in ('total_xp', 'category_xp') and ledger.event_type in ('completion_credit', 'goal_achievement'))
                  or (
                    r_season.metric in ('completions_count', 'distinct_active_days', 'max_streak_days')
                    and ledger.event_type = 'completion_credit'
                    and ledger.xp_delta > 0
                  )
                )
                and (r_season.metric <> 'category_xp' or ledger.track_key = r_season.metric_track_key)
            ) as tie_break_at
          from public.teams team
          where team.status = 'active'::public.team_status
            and exists (
              select 1
              from public.profiles team_a
              where team_a.id = team.user_a_id
                and team_a.social_activity_visible = true
            )
            and exists (
              select 1
              from public.profiles team_b
              where team_b.id = team.user_b_id
                and team_b.social_activity_visible = true
            )
            and exists (
              select 1
              from public.xp_ledger ledger
              where ledger.user_id in (team.user_a_id, team.user_b_id)
                and ledger.earned_on between v_from and v_to
            )
            and (
              r_season.scope = 'global'::public.leaderboard_scope_kind
              or (
                r_season.scope = 'cohort'::public.leaderboard_scope_kind
                and private.team_in_cohort(team.id, r_season.cohort_id)
              )
            )
        ) scored
      ) ranked;
      get diagnostics v_inserted = row_count;
    end if;

    v_rows := v_rows + v_inserted;

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
  v_newly_frozen_seasons uuid[] := '{}'::uuid[];
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
      v_count := v_count + 1;
    end if;
  end loop;

  with inserted as (
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
        when standing.subject_kind = 'team'::public.social_subject_kind then
          coalesce(team_a.display_name, team_a.username, 'Unknown')
          || ' + '
          || coalesce(team_b.display_name, team_b.username, 'Unknown')
        else
          coalesce(profile.display_name, profile.username, 'Unknown')
      end
    from public.leaderboard_standings standing
    join public.leaderboard_seasons season on season.id = standing.season_id
    left join public.profiles profile
      on standing.subject_kind = 'user'::public.social_subject_kind
      and profile.id = standing.subject_id
    left join public.teams team
      on standing.subject_kind = 'team'::public.social_subject_kind
      and team.id = standing.subject_id
    left join public.profiles team_a on team_a.id = team.user_a_id
    left join public.profiles team_b on team_b.id = team.user_b_id
    where season.status = 'closed'::public.leaderboard_season_status
      and not exists (
        select 1
        from public.leaderboard_season_results existing
        where existing.season_id = standing.season_id
      )
    on conflict (season_id, subject_kind, subject_id) do nothing
    returning season_id
  )
  select coalesce(array_agg(distinct inserted.season_id), '{}'::uuid[])
  into v_newly_frozen_seasons
  from inserted;

  perform private.emit_feed_event(
    p_actor_id => result.subject_id,
    p_event_type => 'season_result'::public.feed_event_type,
    p_subject_key => result.season_id::text,
    p_bucket_date => current_date,
    p_track_key => season.metric_track_key,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object(
      'seasonId', result.season_id,
      'rank', result.rank,
      'score', result.score
    )
  )
  from public.leaderboard_season_results result
  join public.leaderboard_seasons season
    on season.id = result.season_id
  where result.season_id = any(v_newly_frozen_seasons)
    and result.subject_kind = 'user'::public.social_subject_kind
    and result.rank <= 3;

  perform private.emit_feed_event(
    p_actor_id => member.actor_id,
    p_event_type => 'season_result'::public.feed_event_type,
    p_subject_key => result.season_id::text || ':team:' || result.subject_id::text,
    p_bucket_date => current_date,
    p_track_key => season.metric_track_key,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object(
      'seasonId', result.season_id,
      'rank', result.rank,
      'score', result.score,
      'teamId', result.subject_id
    )
  )
  from public.leaderboard_season_results result
  join public.leaderboard_seasons season
    on season.id = result.season_id
  join public.teams team
    on team.id = result.subject_id
  cross join lateral (
    values (team.user_a_id), (team.user_b_id)
  ) as member(actor_id)
  where result.season_id = any(v_newly_frozen_seasons)
    and result.subject_kind = 'team'::public.social_subject_kind
    and result.rank <= 3;

  return v_count;
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
  v_scope public.leaderboard_scope_kind;
  v_cohort_id uuid;
  v_viewer_subject_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_season_id is null then
    raise exception using errcode = '22023', message = 'season_id_required';
  end if;

  select season.subject_kind, season.status, season.scope, season.cohort_id
  into v_subject_kind, v_status, v_scope, v_cohort_id
  from public.leaderboard_seasons season
  where season.id = p_season_id;
  if not found then
    raise exception using errcode = '22023', message = 'season_not_found';
  end if;

  if v_scope = 'cohort'::public.leaderboard_scope_kind
    and not private.viewer_in_cohort(v_uid, v_cohort_id) then
    raise exception using errcode = '42501', message = 'cohort_membership_required';
  end if;

  if v_subject_kind = 'user'::public.social_subject_kind then
    v_viewer_subject_id := v_uid;
  else
    v_viewer_subject_id := private.active_team_for_user(v_uid);
  end if;

  if v_status = 'closed'::public.leaderboard_season_status then
    return query
    with viewer as (
      select result.rank
      from public.leaderboard_season_results result
      where result.season_id = p_season_id
        and result.subject_kind = v_subject_kind
        and result.subject_id = v_viewer_subject_id
    )
    select
      result.season_id,
      result.subject_kind,
      result.subject_id,
      result.display_name,
      result.score,
      result.rank,
      result.tie_break_at,
      (select viewer.rank from viewer) as viewer_rank
    from public.leaderboard_season_results result
    where result.season_id = p_season_id
    order by result.rank asc
    limit v_limit
    offset v_offset;
    return;
  end if;

  return query
  with viewer as (
    select standing.rank
    from public.leaderboard_standings standing
    where standing.season_id = p_season_id
      and standing.subject_kind = v_subject_kind
      and standing.subject_id = v_viewer_subject_id
  )
  select
    standing.season_id,
    standing.subject_kind,
    standing.subject_id,
    case
      when standing.subject_kind = 'team'::public.social_subject_kind then
        coalesce(team_a.display_name, team_a.username, 'Unknown')
        || ' + '
        || coalesce(team_b.display_name, team_b.username, 'Unknown')
      else
        coalesce(profile.display_name, profile.username, 'Unknown')
    end as display_name,
    standing.score,
    standing.rank,
    standing.tie_break_at,
    (select viewer.rank from viewer) as viewer_rank
  from public.leaderboard_standings standing
  left join public.profiles profile
    on standing.subject_kind = 'user'::public.social_subject_kind
    and profile.id = standing.subject_id
  left join public.teams team
    on standing.subject_kind = 'team'::public.social_subject_kind
    and team.id = standing.subject_id
  left join public.profiles team_a on team_a.id = team.user_a_id
  left join public.profiles team_b on team_b.id = team.user_b_id
  where standing.season_id = p_season_id
    and (
      (
        standing.subject_kind = 'user'::public.social_subject_kind
        and coalesce(profile.social_activity_visible, false) = true
      )
      or (
        standing.subject_kind = 'team'::public.social_subject_kind
        and coalesce(team_a.social_activity_visible, false) = true
        and coalesce(team_b.social_activity_visible, false) = true
      )
    )
  order by standing.rank asc
  limit v_limit
  offset v_offset;
end;
$$;

drop function if exists private.refresh_user_challenge_participant(
  uuid,
  uuid,
  timestamptz
);

drop function if exists public.assert_xp_ledger_consistency_service();

do $$
declare
  v_job_id bigint;
begin
  if to_regnamespace('cron') is null then
    return;
  end if;

  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'xp-drift-check-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

create or replace function public.refresh_challenge_progress_service()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_refreshed integer := 0;
  r_challenge public.challenges%rowtype;
  r_participant record;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.challenge_refresh')
  );

  update public.challenges challenge
  set
    status = 'active'::public.challenge_status,
    updated_at = v_now
  where challenge.status = 'scheduled'::public.challenge_status
    and challenge.starts_at <= v_now
    and challenge.ends_at > v_now;

  update public.challenges challenge
  set
    status = 'closed'::public.challenge_status,
    updated_at = v_now
  where challenge.status = 'scheduled'::public.challenge_status
    and challenge.ends_at <= v_now;

  for r_challenge in
    select challenge.*
    from public.challenges challenge
    where challenge.status = 'active'::public.challenge_status
  loop
    for r_participant in
      select participant.subject_kind, participant.subject_id
      from public.challenge_participants participant
      where participant.challenge_id = r_challenge.id
        and participant.subject_kind = r_challenge.subject_kind
    loop
      if private.refresh_challenge_participant(
        r_challenge.id,
        r_participant.subject_kind,
        r_participant.subject_id,
        v_now
      ) then
        v_refreshed := v_refreshed + 1;
      end if;
    end loop;

    if r_challenge.ends_at <= v_now then
      update public.challenges challenge
      set
        status = 'closed'::public.challenge_status,
        updated_at = v_now
      where challenge.id = r_challenge.id
        and challenge.status = 'active'::public.challenge_status;
    end if;
  end loop;

  return v_refreshed;
end;
$$;

create or replace function public.get_social_challenges()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  status public.challenge_status,
  subject_kind public.social_subject_kind,
  metric public.challenge_metric,
  metric_track_key text,
  target_value numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  reward_xp integer,
  max_participants integer,
  participant_count integer,
  viewer_joined boolean,
  viewer_progress numeric,
  viewer_completed_at timestamptz,
  viewer_awarded_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  v_team_id := private.active_team_for_user(v_uid);

  return query
  with participant_counts as (
    select participant.challenge_id, count(*)::integer as count_value
    from public.challenge_participants participant
    group by participant.challenge_id
  )
  select
    challenge.id,
    challenge.slug,
    challenge.title,
    challenge.description,
    challenge.status,
    challenge.subject_kind,
    challenge.metric,
    challenge.metric_track_key,
    challenge.target_value,
    challenge.starts_at,
    challenge.ends_at,
    challenge.reward_xp,
    challenge.max_participants,
    coalesce(counts.count_value, 0),
    participant.subject_id is not null,
    participant.progress_value,
    participant.completed_at,
    participant.awarded_at
  from public.challenges challenge
  left join participant_counts counts on counts.challenge_id = challenge.id
  left join public.challenge_participants participant
    on participant.challenge_id = challenge.id
    and participant.subject_kind = challenge.subject_kind
    and (
      (challenge.subject_kind = 'user'::public.social_subject_kind and participant.subject_id = v_uid)
      or (
        challenge.subject_kind = 'team'::public.social_subject_kind
        and v_team_id is not null
        and participant.subject_id = v_team_id
      )
    )
  where challenge.status in (
      'scheduled'::public.challenge_status,
      'active'::public.challenge_status,
      'closed'::public.challenge_status
    )
    and (
      challenge.status <> 'scheduled'::public.challenge_status
      or challenge.ends_at > pg_catalog.now()
    )
    and (
      challenge.audience_kind = 'global'::public.social_audience_kind
      or (
        challenge.audience_kind = 'cohort'::public.social_audience_kind
        and private.viewer_in_cohort(v_uid, challenge.cohort_id)
      )
    )
  order by
    case challenge.status
      when 'active'::public.challenge_status then 0
      when 'scheduled'::public.challenge_status then 1
      else 2
    end,
    challenge.starts_at desc;
end;
$$;

create or replace function public.get_challenge_detail(
  p_challenge_id uuid
)
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  status public.challenge_status,
  subject_kind public.social_subject_kind,
  metric public.challenge_metric,
  metric_track_key text,
  target_value numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  reward_xp integer,
  max_participants integer,
  participant_count integer,
  viewer_joined boolean,
  viewer_progress numeric,
  viewer_completed_at timestamptz,
  viewer_awarded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_subject_kind public.social_subject_kind;
  v_audience_kind public.social_audience_kind;
  v_cohort_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_challenge_id is null then
    raise exception using errcode = '22023', message = 'challenge_id_required';
  end if;

  select challenge.subject_kind, challenge.audience_kind, challenge.cohort_id
  into v_subject_kind, v_audience_kind, v_cohort_id
  from public.challenges challenge
  where challenge.id = p_challenge_id;
  if not found then
    raise exception using errcode = '22023', message = 'challenge_not_found';
  end if;
  if v_audience_kind = 'cohort'::public.social_audience_kind
    and not private.viewer_in_cohort(v_uid, v_cohort_id) then
    raise exception using errcode = '42501', message = 'cohort_membership_required';
  end if;

  if v_subject_kind = 'user'::public.social_subject_kind then
    perform private.refresh_challenge_participant(
      p_challenge_id,
      'user'::public.social_subject_kind,
      v_uid,
      pg_catalog.now()
    );
  else
    v_team_id := private.active_team_for_user(v_uid);
    if v_team_id is not null then
      perform private.refresh_challenge_participant(
        p_challenge_id,
        'team'::public.social_subject_kind,
        v_team_id,
        pg_catalog.now()
      );
    end if;
  end if;

  return query
  with participant_counts as (
    select count(*)::integer as count_value
    from public.challenge_participants participant
    where participant.challenge_id = p_challenge_id
  )
  select
    challenge.id,
    challenge.slug,
    challenge.title,
    challenge.description,
    challenge.status,
    challenge.subject_kind,
    challenge.metric,
    challenge.metric_track_key,
    challenge.target_value,
    challenge.starts_at,
    challenge.ends_at,
    challenge.reward_xp,
    challenge.max_participants,
    counts.count_value,
    participant.subject_id is not null,
    participant.progress_value,
    participant.completed_at,
    participant.awarded_at
  from public.challenges challenge
  cross join participant_counts counts
  left join public.challenge_participants participant
    on participant.challenge_id = challenge.id
    and participant.subject_kind = challenge.subject_kind
    and (
      (challenge.subject_kind = 'user'::public.social_subject_kind and participant.subject_id = v_uid)
      or (
        challenge.subject_kind = 'team'::public.social_subject_kind
        and v_team_id is not null
        and participant.subject_id = v_team_id
      )
    )
  where challenge.id = p_challenge_id
    and challenge.status in (
      'scheduled'::public.challenge_status,
      'active'::public.challenge_status,
      'closed'::public.challenge_status
    )
    and (
      challenge.status <> 'scheduled'::public.challenge_status
      or challenge.ends_at > pg_catalog.now()
    );
end;
$$;

create or replace function public.join_challenge_service(
  p_challenge_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_challenge public.challenges%rowtype;
  v_participant_count integer;
  v_subject_id uuid;
  v_team_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_challenge_id is null then
    raise exception using errcode = '22023', message = 'challenge_id_required';
  end if;

  select challenge.*
  into v_challenge
  from public.challenges challenge
  where challenge.id = p_challenge_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'challenge_not_found';
  end if;
  if v_challenge.status not in ('scheduled', 'active') then
    raise exception using errcode = '22023', message = 'challenge_not_joinable';
  end if;
  if v_challenge.ends_at <= pg_catalog.now() then
    raise exception using errcode = '22023', message = 'challenge_not_joinable';
  end if;

  if v_challenge.audience_kind = 'cohort'::public.social_audience_kind
    and not private.viewer_in_cohort(v_uid, v_challenge.cohort_id) then
    raise exception using errcode = '42501', message = 'cohort_membership_required';
  end if;

  if v_challenge.subject_kind = 'user'::public.social_subject_kind then
    v_subject_id := v_uid;
  elsif v_challenge.subject_kind = 'team'::public.social_subject_kind then
    v_team_id := private.active_team_for_user(v_uid);
    if v_team_id is null then
      raise exception using errcode = '22023', message = 'team_required';
    end if;
    if v_challenge.audience_kind = 'cohort'::public.social_audience_kind
      and not private.team_in_cohort(v_team_id, v_challenge.cohort_id) then
      raise exception using errcode = '42501', message = 'cohort_membership_required';
    end if;
    v_subject_id := v_team_id;
  else
    raise exception using errcode = '22023', message = 'challenge_subject_not_supported';
  end if;

  if v_challenge.max_participants is not null then
    select count(*)::integer
    into v_participant_count
    from public.challenge_participants participant
    where participant.challenge_id = p_challenge_id
      and participant.subject_kind = v_challenge.subject_kind;

    if v_participant_count >= v_challenge.max_participants
      and not exists (
        select 1
        from public.challenge_participants participant
        where participant.challenge_id = p_challenge_id
          and participant.subject_kind = v_challenge.subject_kind
          and participant.subject_id = v_subject_id
      ) then
      raise exception using errcode = '22023', message = 'challenge_full';
    end if;
  end if;

  insert into public.challenge_participants (challenge_id, subject_kind, subject_id)
  values (p_challenge_id, v_challenge.subject_kind, v_subject_id)
  on conflict (challenge_id, subject_kind, subject_id) do nothing;

  if v_challenge.status = 'active'::public.challenge_status then
    perform private.refresh_challenge_participant(
      p_challenge_id,
      v_challenge.subject_kind,
      v_subject_id,
      pg_catalog.now()
    );
  end if;

  return exists (
    select 1
    from public.challenge_participants participant
    where participant.challenge_id = p_challenge_id
      and participant.subject_kind = v_challenge.subject_kind
      and participant.subject_id = v_subject_id
  );
end;
$$;

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
  begin
    perform cron.unschedule('rollover-leaderboard-seasons-daily');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'refresh-leaderboard-standings',
    '*/15 * * * *',
    $job$select public.refresh_leaderboard_standings_service()$job$
  );

  perform cron.schedule(
    'rollover-leaderboard-seasons-daily',
    '5 0 * * *',
    $job$select public.rollover_leaderboard_seasons_service()$job$
  );
exception
  when others then null;
end;
$cron$;

create or replace function public.accept_team_invite_service(
  p_team_id uuid,
  p_visibility_acknowledged boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_partner_id uuid;
  v_user_a_id uuid;
  v_user_b_id uuid;
  v_lock_first text;
  v_lock_second text;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_team_id is null then
    raise exception using errcode = '22023', message = 'team_id_required';
  end if;
  if coalesce(p_visibility_acknowledged, false) = false then
    raise exception using errcode = '22023', message = 'visibility_ack_required';
  end if;

  select
    team.user_a_id,
    team.user_b_id
  into
    v_user_a_id,
    v_user_b_id
  from public.teams team
  where team.id = p_team_id
    and team.status = 'pending'::public.team_status
    and team.initiator_id <> v_uid
    and v_uid in (team.user_a_id, team.user_b_id)
  for update;

  if not found then
    return false;
  end if;

  v_lock_first := least(v_user_a_id::text, v_user_b_id::text);
  v_lock_second := greatest(v_user_a_id::text, v_user_b_id::text);

  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.team_user:' || v_lock_first)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.team_user:' || v_lock_second)
  );

  update public.teams team
  set
    status = 'active'::public.team_status,
    accepted_at = pg_catalog.now(),
    visibility_acknowledged_at = pg_catalog.now()
  where team.id = p_team_id
    and team.status = 'pending'::public.team_status
    and team.initiator_id <> v_uid
    and v_uid in (team.user_a_id, team.user_b_id)
    and not exists (
      select 1
      from public.teams active_team
      where active_team.id <> team.id
        and active_team.status = 'active'::public.team_status
        and (
          v_user_a_id in (active_team.user_a_id, active_team.user_b_id)
          or v_user_b_id in (active_team.user_a_id, active_team.user_b_id)
        )
    )
  returning case when team.user_a_id = v_uid then team.user_b_id else team.user_a_id end
  into v_partner_id;

  if not found then
    return false;
  end if;

  insert into public.team_preferences (team_id, user_id)
  values
    (p_team_id, v_uid),
    (p_team_id, v_partner_id)
  on conflict (team_id, user_id) do nothing;

  perform private.emit_feed_event(
    p_actor_id => v_uid,
    p_event_type => 'team_formed'::public.feed_event_type,
    p_subject_key => p_team_id::text,
    p_bucket_date => current_date,
    p_track_key => null,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object('teamId', p_team_id)
  );
  perform private.emit_feed_event(
    p_actor_id => v_partner_id,
    p_event_type => 'team_formed'::public.feed_event_type,
    p_subject_key => p_team_id::text,
    p_bucket_date => current_date,
    p_track_key => null,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object('teamId', p_team_id)
  );

  perform private.enqueue_notification_outbox(
    p_user_id => v_partner_id,
    p_kind => 'team_accepted'::public.notification_kind,
    p_title => 'Your team invite was accepted',
    p_body => 'You now have an active team partner.',
    p_url => '/social?tab=team',
    p_dedupe_key => 'team-accepted:' || p_team_id::text || ':' || v_partner_id::text
  );
  perform private.enqueue_notification_outbox(
    p_user_id => v_uid,
    p_kind => 'team_accepted'::public.notification_kind,
    p_title => 'Team connection confirmed',
    p_body => 'Your team partnership is now active.',
    p_url => '/social?tab=team',
    p_dedupe_key => 'team-accepted:' || p_team_id::text || ':' || v_uid::text
  );

  return true;
end;
$$;

do $$
begin
  begin
    perform cron.unschedule('expire-team-invites-daily');
  exception
    when others then null;
  end;
end;
$$;

drop function if exists public.expire_pending_team_invites_service();

create or replace function public.leave_challenge_service(
  p_challenge_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.challenge_status;
  v_subject_kind public.social_subject_kind;
  v_subject_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_challenge_id is null then
    raise exception using errcode = '22023', message = 'challenge_id_required';
  end if;

  select challenge.status, challenge.subject_kind
  into v_status, v_subject_kind
  from public.challenges challenge
  where challenge.id = p_challenge_id;

  if not found then
    raise exception using errcode = '22023', message = 'challenge_not_found';
  end if;
  if v_status not in ('scheduled', 'active') then
    raise exception using errcode = '22023', message = 'challenge_not_leaveable';
  end if;

  if v_subject_kind = 'user'::public.social_subject_kind then
    v_subject_id := v_uid;
  else
    v_subject_id := private.active_team_for_user(v_uid);
    if v_subject_id is null then
      raise exception using errcode = '22023', message = 'team_required';
    end if;
  end if;

  delete from public.challenge_participants participant
  where participant.challenge_id = p_challenge_id
    and participant.subject_kind = v_subject_kind
    and participant.subject_id = v_subject_id
    and participant.completed_at is null;

  if found then
    return true;
  end if;

  if exists (
    select 1
    from public.challenge_participants participant
    where participant.challenge_id = p_challenge_id
      and participant.subject_kind = v_subject_kind
      and participant.subject_id = v_subject_id
      and participant.completed_at is not null
  ) then
    raise exception using errcode = '22023', message = 'challenge_not_leaveable';
  end if;

  return true;
end;
$$;
