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
    v_viewer_subject_id := private.active_duo_for_user(v_uid);
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
      when standing.subject_kind = 'duo'::public.social_subject_kind then
        coalesce(duo_a.display_name, duo_a.username, result.display_name, 'Unknown')
        || ' + '
        || coalesce(duo_b.display_name, duo_b.username, result.display_name, 'Unknown')
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
  left join public.duos duo
    on standing.subject_kind = 'duo'::public.social_subject_kind
    and duo.id = standing.subject_id
  left join public.profiles duo_a on duo_a.id = duo.user_a_id
  left join public.profiles duo_b on duo_b.id = duo.user_b_id
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
