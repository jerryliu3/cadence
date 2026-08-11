-- Social Phase 1:
-- Privacy and visibility foundation for social surfaces.

alter table public.profiles
  add column if not exists social_activity_visible boolean;

update public.profiles
set social_activity_visible = true
where social_activity_visible is null;

alter table public.profiles
  alter column social_activity_visible set default true;

alter table public.profiles
  alter column social_activity_visible set not null;

alter table public.goals
  add column if not exists is_private boolean;

-- Public by default: feed title + group visibility share this single flag.
update public.goals
set is_private = false
where is_private is null;

alter table public.goals
  alter column is_private set default false;

alter table public.goals
  alter column is_private set not null;

create index if not exists goals_public_visibility_idx
on public.goals (id)
where is_private = false;

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
