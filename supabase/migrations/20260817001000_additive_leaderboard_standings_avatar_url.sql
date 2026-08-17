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
  avatar_url text,
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
      case
        when result.subject_kind = 'user'::public.social_subject_kind then profile.avatar_url
        else null::text
      end as avatar_url,
      result.score,
      result.rank,
      result.tie_break_at,
      (select viewer.rank from viewer) as viewer_rank
    from public.leaderboard_season_results result
    left join public.profiles profile
      on result.subject_kind = 'user'::public.social_subject_kind
      and profile.id = result.subject_id
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
        private.team_display_name(standing.subject_id)
      else
        coalesce(profile.display_name, profile.username, 'Unknown')
    end as display_name,
    case
      when standing.subject_kind = 'user'::public.social_subject_kind then profile.avatar_url
      else null::text
    end as avatar_url,
    standing.score,
    standing.rank,
    standing.tie_break_at,
    (select viewer.rank from viewer) as viewer_rank
  from public.leaderboard_standings standing
  left join public.profiles profile
    on standing.subject_kind = 'user'::public.social_subject_kind
    and profile.id = standing.subject_id
  where standing.season_id = p_season_id
    and (
      (
        standing.subject_kind = 'user'::public.social_subject_kind
        and coalesce(profile.social_activity_visible, false) = true
      )
      or (
        standing.subject_kind = 'team'::public.social_subject_kind
        and private.team_all_members_socially_visible(standing.subject_id)
      )
    )
  order by standing.rank asc
  limit v_limit
  offset v_offset;
end;
$$;
