-- Additive Phase 32:
-- Settle unpublish semantics by unlocking planner rows in-place.

drop function if exists public.clear_planner_schedule(date, text);

create or replace function public.clear_planner_schedule(
  p_month date,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  unlocked_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current_digest text;
  v_unlocked_count integer := 0;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception using errcode = '22023', message = 'invalid_scope_month';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );

  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;

  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  update public.planner_items item
  set locked = false
  where item.owner_id = v_owner
    and item.locked
    and date_trunc('month', item.scheduled_date)::date = p_month;

  get diagnostics v_unlocked_count = row_count;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    v_unlocked_count;
end;
$$;

grant execute on function public.clear_planner_schedule(date, text) to authenticated;
