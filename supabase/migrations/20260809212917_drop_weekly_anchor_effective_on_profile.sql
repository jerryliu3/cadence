-- Cleanup phase 52:
-- Remove the obsolete weekly anchor cutover column after switching to
-- immediate profile-owned week boundaries for weekly cadence.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_username text;
  resolved_username text;
  resolved_week_starts_on smallint := 1;
begin
  base_username := lower(
    coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'user'
    )
  );

  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');
  if base_username = '' then
    base_username := 'user';
  end if;

  resolved_username := base_username;
  if exists (select 1 from public.profiles where username = resolved_username) then
    raise exception 'Username is already taken.'
      using errcode = '23505';
  end if;

  if
    jsonb_typeof(new.raw_user_meta_data) = 'object'
    and (new.raw_user_meta_data ? 'week_starts_on')
    and coalesce(new.raw_user_meta_data->>'week_starts_on', '') ~ '^[0-6]$'
  then
    resolved_week_starts_on := (new.raw_user_meta_data->>'week_starts_on')::smallint;
  end if;

  insert into public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    week_starts_on
  )
  values (
    new.id,
    resolved_username,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), resolved_username),
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    resolved_week_starts_on
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

alter table public.profiles
drop column if exists weekly_anchor_effective_on;
