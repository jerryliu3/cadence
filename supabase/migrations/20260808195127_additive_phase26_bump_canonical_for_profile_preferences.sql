-- Additive Phase 26:
-- Ensure profile-backed planner preference writes advance canonical revisions.

create or replace function private.bump_canonical_for_profile_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.timezone is distinct from new.timezone
    or old.timezone_confirmed_at is distinct from new.timezone_confirmed_at
    or old.week_starts_on is distinct from new.week_starts_on
    or old.rest_weekdays is distinct from new.rest_weekdays
    or old.blackout_ranges is distinct from new.blackout_ranges then
    perform private.bump_planner_canonical_revision(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_planner_preferences_canonical_revision
on public.profiles;

create trigger profiles_planner_preferences_canonical_revision
after update of timezone, timezone_confirmed_at, week_starts_on, rest_weekdays, blackout_ranges
on public.profiles
for each row execute function private.bump_canonical_for_profile_preferences();
