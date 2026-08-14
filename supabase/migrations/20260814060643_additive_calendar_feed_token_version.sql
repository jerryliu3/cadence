alter table public.profiles
add column if not exists calendar_feed_token_version integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_calendar_feed_token_version_positive'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_calendar_feed_token_version_positive
      check (calendar_feed_token_version > 0);
  end if;
end
$$;
