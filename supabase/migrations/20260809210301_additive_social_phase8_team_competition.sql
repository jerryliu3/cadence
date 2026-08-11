-- Social Phase 8:
-- Enable team subjects across challenge and leaderboard competition flows.

create or replace function private.active_team_for_user(
  p_user_id uuid
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select team.id
  from public.teams team
  where team.status = 'active'::public.team_status
    and p_user_id in (team.user_a_id, team.user_b_id)
  order by team.accepted_at desc nulls last
  limit 1;
$$;

create or replace function private.subject_member_ids(
  p_subject_kind public.social_subject_kind,
  p_subject_id uuid
)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_ids uuid[];
begin
  if p_subject_kind = 'user'::public.social_subject_kind then
    return array[p_subject_id]::uuid[];
  end if;

  if p_subject_kind = 'team'::public.social_subject_kind then
    select array[team.user_a_id, team.user_b_id]::uuid[]
    into v_user_ids
    from public.teams team
    where team.id = p_subject_id
      and team.status = 'active'::public.team_status;

    return coalesce(v_user_ids, '{}'::uuid[]);
  end if;

  raise exception using errcode = '22023', message = 'invalid_subject_kind';
end;
$$;

create or replace function private.refresh_challenge_participant(
  p_challenge_id uuid,
  p_subject_kind public.social_subject_kind,
  p_subject_id uuid,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges%rowtype;
  v_progress numeric;
  v_window_start date;
  v_window_end date;
  v_member_ids uuid[];
  v_member_id uuid;
  v_source_key text;
  v_award_seq bigint;
  v_awarded_any boolean := false;
  v_completed boolean := false;
begin
  if p_challenge_id is null or p_subject_id is null then
    return false;
  end if;

  select challenge.*
  into v_challenge
  from public.challenges challenge
  where challenge.id = p_challenge_id;

  if not found then
    return false;
  end if;
  if v_challenge.subject_kind <> p_subject_kind then
    return false;
  end if;
  if v_challenge.status not in ('active', 'closed') then
    return false;
  end if;

  v_member_ids := private.subject_member_ids(p_subject_kind, p_subject_id);
  if v_member_ids is null or array_length(v_member_ids, 1) is null then
    return false;
  end if;

  v_window_start := (v_challenge.starts_at at time zone 'UTC')::date;
  v_window_end := (least(p_now, v_challenge.ends_at) at time zone 'UTC')::date;

  v_progress := private.challenge_progress_value(
    v_challenge.metric,
    v_challenge.metric_track_key,
    v_member_ids,
    v_window_start,
    v_window_end
  );

  update public.challenge_participants participant
  set
    progress_value = v_progress,
    progress_at = p_now
  where participant.challenge_id = p_challenge_id
    and participant.subject_kind = p_subject_kind
    and participant.subject_id = p_subject_id;

  if not found then
    return false;
  end if;

  if v_challenge.status = 'active'
    and v_progress >= v_challenge.target_value then
    update public.challenge_participants participant
    set
      completed_at = coalesce(participant.completed_at, p_now)
    where participant.challenge_id = p_challenge_id
      and participant.subject_kind = p_subject_kind
      and participant.subject_id = p_subject_id
      and participant.completed_at is null;

    v_completed := found;

    if v_completed and v_challenge.reward_xp > 0 then
      foreach v_member_id in array v_member_ids
      loop
        if p_subject_kind = 'user'::public.social_subject_kind then
          v_source_key := 'challenge:' || p_challenge_id::text || ':user:' || v_member_id::text;
        else
          v_source_key := 'ch:' || pg_catalog.substr(
            md5(
              p_challenge_id::text || ':' || p_subject_kind::text || ':' || p_subject_id::text || ':' || v_member_id::text
            ),
            1,
            24
          );
        end if;

        select public.award_social_xp_service(
          v_member_id,
          'challenge_award',
          v_source_key,
          v_challenge.reward_xp
        )
        into v_award_seq;

        if v_award_seq is not null then
          v_awarded_any := true;
        end if;
      end loop;

      if v_awarded_any then
        update public.challenge_participants participant
        set awarded_at = coalesce(participant.awarded_at, p_now)
        where participant.challenge_id = p_challenge_id
          and participant.subject_kind = p_subject_kind
          and participant.subject_id = p_subject_id;
      end if;
    end if;

    if v_completed then
      foreach v_member_id in array v_member_ids
      loop
        perform private.emit_feed_event(
          p_actor_id => v_member_id,
          p_event_type => 'challenge_completed'::public.feed_event_type,
          p_subject_key => p_challenge_id::text || ':' || p_subject_kind::text || ':' || p_subject_id::text,
          p_bucket_date => (p_now at time zone 'UTC')::date,
          p_track_key => v_challenge.metric_track_key,
          p_goal_id => null,
          p_xp_delta => greatest(v_challenge.reward_xp, 0),
          p_occurrence_delta => 1,
          p_payload => jsonb_build_object(
            'challengeId', p_challenge_id,
            'metric', v_challenge.metric,
            'subjectKind', p_subject_kind,
            'subjectId', p_subject_id
          )
        );
      end loop;
    end if;
  end if;

  return true;
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

  for r_challenge in
    select challenge.*
    from public.challenges challenge
    where challenge.status = 'active'::public.challenge_status
  loop
    -- enrollment='auto' does not bulk-enroll all users/teams; opt-in join is primary.


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
    select
      participant.challenge_id,
      count(*)::integer as count_value
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
    coalesce(counts.count_value, 0) as participant_count,
    participant.subject_id is not null as viewer_joined,
    participant.progress_value as viewer_progress,
    participant.completed_at as viewer_completed_at,
    participant.awarded_at as viewer_awarded_at
  from public.challenges challenge
  left join participant_counts counts
    on counts.challenge_id = challenge.id
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
  order by
    case challenge.status
      when 'active'::public.challenge_status then 0
      when 'scheduled'::public.challenge_status then 1
      else 2
    end asc,
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
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_challenge_id is null then
    raise exception using errcode = '22023', message = 'challenge_id_required';
  end if;

  select challenge.subject_kind
  into v_subject_kind
  from public.challenges challenge
  where challenge.id = p_challenge_id;

  if not found then
    raise exception using errcode = '22023', message = 'challenge_not_found';
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
    counts.count_value as participant_count,
    participant.subject_id is not null as viewer_joined,
    participant.progress_value as viewer_progress,
    participant.completed_at as viewer_completed_at,
    participant.awarded_at as viewer_awarded_at
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

  if v_challenge.subject_kind = 'user'::public.social_subject_kind then
    v_subject_id := v_uid;
  elsif v_challenge.subject_kind = 'team'::public.social_subject_kind then
    v_team_id := private.active_team_for_user(v_uid);
    if v_team_id is null then
      raise exception using errcode = '22023', message = 'team_required';
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

  insert into public.challenge_participants (
    challenge_id,
    subject_kind,
    subject_id
  )
  values (
    p_challenge_id,
    v_challenge.subject_kind,
    v_subject_id
  )
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

  select challenge.enrollment, challenge.status, challenge.subject_kind
  into v_enrollment, v_status, v_subject_kind
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

  return found;
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
    elsif r_season.subject_kind = 'team'::public.social_subject_kind then
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
          from public.teams team
          where team.status = 'active'::public.team_status

            and exists (
              select 1
              from public.xp_ledger ledger
              where ledger.user_id in (team.user_a_id, team.user_b_id)
                and ledger.earned_on between v_from and v_to
            )
        ) scored
      ) ranked;
    end if;

    get diagnostics v_inserted = row_count;
    v_rows := v_rows + v_inserted;

    if r_season.ends_at is not null and r_season.ends_at <= v_now then
      update public.leaderboard_seasons season
      set
        status = 'closed'::public.leaderboard_season_status,
        closed_at = coalesce(season.closed_at, v_now),
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
      update public.leaderboard_seasons season
      set next_season_id = v_next_id
      where season.id = r_season.id;
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
    case
      when standing.subject_kind = 'team'::public.social_subject_kind then
        coalesce(team_a.display_name, team_a.username, 'Unknown')
        || ' + '
        || coalesce(team_b.display_name, team_b.username, 'Unknown')
      else
        coalesce(profile.display_name, profile.username, 'Unknown')
    end as display_name
  from public.leaderboard_standings standing
  join public.leaderboard_seasons season
    on season.id = standing.season_id
  left join public.profiles profile
    on standing.subject_kind = 'user'::public.social_subject_kind
    and profile.id = standing.subject_id
  left join public.teams team
    on standing.subject_kind = 'team'::public.social_subject_kind
    and team.id = standing.subject_id
  left join public.profiles team_a on team_a.id = team.user_a_id
  left join public.profiles team_b on team_b.id = team.user_b_id
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
    standing.season_id::text || ':team:' || standing.subject_id::text,
    current_date,
    season.metric_track_key,
    null,
    0,
    1,
    jsonb_build_object(
      'seasonId', standing.season_id,
      'rank', standing.rank,
      'score', standing.score,
      'teamId', standing.subject_id
    )
  from public.leaderboard_standings standing
  join public.leaderboard_seasons season
    on season.id = standing.season_id
  join public.teams team
    on team.id = standing.subject_id
  cross join lateral (
    values (team.user_a_id), (team.user_b_id)
  ) as member(actor_id)
  where season.status = 'closed'::public.leaderboard_season_status
    and standing.rank <= 3
    and standing.subject_kind = 'team'::public.social_subject_kind
  on conflict (actor_id, event_type, subject_key, bucket_date) do nothing;

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
  v_viewer_subject_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_season_id is null then
    raise exception using errcode = '22023', message = 'season_id_required';
  end if;

  select season.subject_kind
  into v_subject_kind
  from public.leaderboard_seasons season
  where season.id = p_season_id;

  if not found then
    raise exception using errcode = '22023', message = 'season_not_found';
  end if;

  if v_subject_kind = 'user'::public.social_subject_kind then
    v_viewer_subject_id := v_uid;
  else
    v_viewer_subject_id := private.active_team_for_user(v_uid);
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
        coalesce(team_a.display_name, team_a.username, result.display_name, 'Unknown')
        || ' + '
        || coalesce(team_b.display_name, team_b.username, result.display_name, 'Unknown')
      else
        coalesce(profile.display_name, profile.username, result.display_name, 'Unknown')
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
  left join public.leaderboard_season_results result
    on result.season_id = standing.season_id
    and result.subject_kind = standing.subject_kind
    and result.subject_id = standing.subject_id
  where standing.season_id = p_season_id
  order by standing.rank asc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function private.active_team_for_user(uuid)
  from public, anon, authenticated;
revoke all on function private.subject_member_ids(public.social_subject_kind, uuid)
  from public, anon, authenticated;
revoke all on function private.refresh_challenge_participant(
  uuid,
  public.social_subject_kind,
  uuid,
  timestamptz
)
  from public, anon, authenticated;
