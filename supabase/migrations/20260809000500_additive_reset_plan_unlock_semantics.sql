-- Additive follow-up:
-- Align clear_planner_schedule with reset semantics by unlocking in place
-- instead of deleting scheduled rows.

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
  v_execution_unlocked_count integer := 0;
  v_planner_items_unlocked_count integer := 0;
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

  if
    pg_catalog.to_regclass('public.execution_plan_items') is not null
    and pg_catalog.to_regclass('public.execution_plans') is not null
  then
    execute $sql$
      update public.execution_plan_items item
      set
        locked = false,
        revision = item.revision + 1
      from public.execution_plans plan
      where item.owner_id = $1
        and item.plan_id = plan.id
        and plan.owner_id = $1
        and plan.scope_month = $2
        and plan.status = 'active'
        and item.locked
    $sql$
    using v_owner, p_month;

    get diagnostics v_execution_unlocked_count = row_count;

    if
      v_execution_unlocked_count > 0
      and pg_catalog.to_regprocedure(
        'private.bump_planner_execution_revision(uuid)'
      ) is not null
    then
      perform private.bump_planner_execution_revision(v_owner);
    end if;
  end if;

  update public.planner_items item
  set locked = false
  where item.owner_id = v_owner
    and date_trunc('month', item.scheduled_date)::date = p_month
    and item.locked;

  get diagnostics v_planner_items_unlocked_count = row_count;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    greatest(v_execution_unlocked_count, v_planner_items_unlocked_count);
end;
$$;

grant execute on function public.clear_planner_schedule(date, text) to authenticated;
