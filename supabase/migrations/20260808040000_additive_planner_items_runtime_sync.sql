-- Additive Phase 7:
-- Keep planner_items in sync while legacy execution-plan runtime is still active.

create or replace function public.sync_planner_items_from_active_execution_plan_service(
  p_owner uuid,
  p_scope_month date
)
returns table (
  schedule_digest text,
  synced_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_synced_count integer := 0;
begin
  if p_owner is null then
    raise exception using errcode = '22023', message = 'owner_required';
  end if;
  if p_scope_month is null or extract(day from p_scope_month) <> 1 then
    raise exception using errcode = '22023', message = 'invalid_scope_month';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(p_owner)
  );

  delete from public.planner_items item
  where item.owner_id = p_owner
    and date_trunc('month', item.scheduled_date)::date = p_scope_month;

  insert into public.planner_items (
    owner_id,
    goal_id,
    unit_key,
    scheduled_date,
    scheduled_time,
    locked
  )
  select
    p_owner,
    coalesce(plan_goal.original_goal_id, plan_goal.goal_id),
    item.unit_key,
    item.scheduled_date,
    case
      when nullif(
        coalesce(item.scheduled_time_override, item.effective_scheduled_local_time),
        ''
      ) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then nullif(
        coalesce(item.scheduled_time_override, item.effective_scheduled_local_time),
        ''
      )
      else null
    end as scheduled_time,
    item.locked
  from public.execution_plans plan
  join public.execution_plan_items item
    on item.plan_id = plan.id
   and item.owner_id = plan.owner_id
  join public.execution_plan_goals plan_goal
    on plan_goal.id = item.plan_goal_id
   and plan_goal.plan_id = item.plan_id
   and plan_goal.owner_id = item.owner_id
  join public.goals goal
    on goal.id = coalesce(plan_goal.original_goal_id, plan_goal.goal_id)
   and goal.owner_id = p_owner
   and goal.is_deleted = false
  where plan.owner_id = p_owner
    and plan.scope_month = p_scope_month
    and plan.status = 'active'
    and item.scheduled_date is not null
  on conflict (goal_id, unit_key)
  do update
  set
    owner_id = excluded.owner_id,
    scheduled_date = excluded.scheduled_date,
    scheduled_time = excluded.scheduled_time,
    locked = excluded.locked;

  get diagnostics v_synced_count = row_count;

  return query
  select public.get_planner_schedule_digest(p_owner), v_synced_count;
end;
$$;

revoke execute on function public.sync_planner_items_from_active_execution_plan_service(
  uuid,
  date
) from public, anon, authenticated, service_role;

grant execute on function public.sync_planner_items_from_active_execution_plan_service(
  uuid,
  date
) to service_role;
