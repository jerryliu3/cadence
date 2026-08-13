-- Expose cohort/audience scope on social challenge and leaderboard read RPCs.

drop function if exists public.get_social_challenges();
drop function if exists public.get_challenge_detail(uuid);
drop function if exists public.get_social_leaderboards();
drop function if exists public.get_social_leaderboard_season(uuid);

create function public.get_social_challenges()
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
  viewer_awarded_at timestamptz,
  audience_kind public.social_audience_kind,
  cohort_id uuid
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
    participant.awarded_at,
    challenge.audience_kind,
    challenge.cohort_id
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

create function public.get_challenge_detail(
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
  viewer_awarded_at timestamptz,
  audience_kind public.social_audience_kind,
  cohort_id uuid
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
    participant.awarded_at,
    challenge.audience_kind,
    challenge.cohort_id
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

create function public.get_social_leaderboards()
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
  rollover public.leaderboard_rollover,
  scope public.leaderboard_scope_kind,
  cohort_id uuid
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
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
    season.rollover,
    season.scope,
    season.cohort_id
  from public.leaderboard_seasons season
  where season.status in (
      'open'::public.leaderboard_season_status,
      'closed'::public.leaderboard_season_status
    )
    and (
      season.scope = 'global'::public.leaderboard_scope_kind
      or (
        season.scope = 'cohort'::public.leaderboard_scope_kind
        and private.viewer_in_cohort(v_uid, season.cohort_id)
      )
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

create function public.get_social_leaderboard_season(p_season_id uuid)
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
  rollover public.leaderboard_rollover,
  scope public.leaderboard_scope_kind,
  cohort_id uuid
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_scope public.leaderboard_scope_kind;
  v_cohort_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_season_id is null then
    raise exception using errcode = '22023', message = 'season_id_required';
  end if;

  select season.scope, season.cohort_id
  into v_scope, v_cohort_id
  from public.leaderboard_seasons season
  where season.id = p_season_id;
  if not found then
    raise exception using errcode = '22023', message = 'season_not_found';
  end if;
  if v_scope = 'cohort'::public.leaderboard_scope_kind
    and not private.viewer_in_cohort(v_uid, v_cohort_id) then
    raise exception using errcode = '42501', message = 'cohort_membership_required';
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
    season.rollover,
    season.scope,
    season.cohort_id
  from public.leaderboard_seasons season
  where season.id = p_season_id
    and season.status in (
      'open'::public.leaderboard_season_status,
      'closed'::public.leaderboard_season_status
    );
end;
$$;

revoke all on function public.get_social_challenges() from public, anon;
grant execute on function public.get_social_challenges() to authenticated;

revoke all on function public.get_challenge_detail(uuid) from public, anon;
grant execute on function public.get_challenge_detail(uuid) to authenticated;

revoke all on function public.get_social_leaderboards() from public, anon;
grant execute on function public.get_social_leaderboards() to authenticated;

revoke all on function public.get_social_leaderboard_season(uuid) from public, anon;
grant execute on function public.get_social_leaderboard_season(uuid) to authenticated;
