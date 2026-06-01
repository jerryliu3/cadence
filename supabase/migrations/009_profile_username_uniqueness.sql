create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  resolved_username text;
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

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    resolved_username,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), resolved_username),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
