-- Social Phase 1:
-- Privacy and visibility foundation for social surfaces.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'goal_feed_visibility'
  ) then
    create type public.goal_feed_visibility as enum ('private', 'title_public');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'goal_group_visibility'
  ) then
    create type public.goal_group_visibility as enum ('shared', 'excluded');
  end if;
end;
$$;

alter table public.profiles
  add column if not exists social_activity_visible boolean,
  add column if not exists social_competition_eligible boolean,
  add column if not exists social_visibility_updated_at timestamptz,
  add column if not exists leaderboard_banned_at timestamptz;

update public.profiles
set social_activity_visible = true
where social_activity_visible is null;

update public.profiles
set social_competition_eligible = true
where social_competition_eligible is null;

update public.profiles
set social_visibility_updated_at = pg_catalog.now()
where social_visibility_updated_at is null;

alter table public.profiles
  alter column social_activity_visible set default true,
  alter column social_competition_eligible set default true,
  alter column social_visibility_updated_at set default pg_catalog.now();

alter table public.profiles
  alter column social_activity_visible set not null,
  alter column social_competition_eligible set not null,
  alter column social_visibility_updated_at set not null;

alter table public.goals
  add column if not exists feed_visibility public.goal_feed_visibility,
  add column if not exists group_visibility public.goal_group_visibility;

update public.goals
set feed_visibility = 'private'::public.goal_feed_visibility
where feed_visibility is null;

update public.goals
set group_visibility = 'shared'::public.goal_group_visibility
where group_visibility is null;

alter table public.goals
  alter column feed_visibility set default 'private'::public.goal_feed_visibility,
  alter column group_visibility set default 'shared'::public.goal_group_visibility;

alter table public.goals
  alter column feed_visibility set not null,
  alter column group_visibility set not null;

create index if not exists goals_feed_public_idx
on public.goals (id)
where feed_visibility = 'title_public'::public.goal_feed_visibility;

create or replace function public.find_profile_by_username(
  p_query text,
  p_limit integer default 8
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 20);
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if v_query = '' then
    return;
  end if;

  return query
  select
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    profile.created_at
  from public.profiles profile
  where profile.id <> v_uid
    and profile.username ilike ('%' || v_query || '%')
  order by profile.username asc
  limit v_limit;
end;
$$;

grant execute on function public.find_profile_by_username(text, integer) to authenticated;
