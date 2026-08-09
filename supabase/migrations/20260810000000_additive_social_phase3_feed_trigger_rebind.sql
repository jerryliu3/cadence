-- Social Phase 3 follow-up:
-- XP phase 4 recreates xp_ledger/xp_profiles, so re-bind feed triggers afterwards.

drop trigger if exists feed_event_from_xp_ledger
on public.xp_ledger;
create trigger feed_event_from_xp_ledger
after insert on public.xp_ledger
for each row
execute function private.feed_event_from_xp_ledger();

drop trigger if exists feed_event_from_xp_level
on public.xp_profiles;
create trigger feed_event_from_xp_level
after update on public.xp_profiles
for each row
when (new.current_level > old.current_level)
execute function private.feed_event_from_xp_level();
