-- Align volatility markers with underlying function behavior.
-- These helpers are used in XP recompute paths; mismarked volatility can
-- allow unsafe planner assumptions and stale results.

alter function private.goal_anchored_period_start(
  date,
  public.recurrence_interval,
  integer
)
stable;

alter function private.goal_period_key(
  date,
  public.recurrence_interval,
  date
)
stable;

alter function private.goal_xp_credited_units(uuid, uuid)
volatile;
