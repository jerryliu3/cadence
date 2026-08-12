-- Social Phase 3 follow-up:
-- Feed emission is invoked from XP RPCs (no ledger/profile triggers).
-- Drop any legacy feed emission triggers if present from earlier drafts.

drop trigger if exists feed_event_from_xp_ledger on public.xp_ledger;
drop trigger if exists feed_event_from_xp_level on public.xp_profiles;
drop function if exists private.feed_event_from_xp_ledger();
drop function if exists private.feed_event_from_xp_level();
