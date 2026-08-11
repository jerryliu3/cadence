-- XP Phase 2:
-- Retire the table trigger guard in favor of explicit RPC-level validation.

drop trigger if exists completions_guard_future_dates
on public.completions;

drop function if exists private.guard_completion_date();
