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

  -- Rebuild owner mirror across all active months so duplicate legacy units
  -- resolve deterministically rather than depending on month sync order.
  delete from public.planner_items item
  where item.owner_id = p_owner;

  with candidate_rows as (
    select
      coalesce(plan_goal.original_goal_id, plan_goal.goal_id) as goal_id,
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
      item.locked,
      item.revision,
      item.updated_at as item_updated_at,
      plan.activated_at as plan_activated_at,
      plan.created_at as plan_created_at,
      plan.scope_month as plan_scope_month,
      item.id as execution_item_id
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
      and plan.status = 'active'
      and item.scheduled_date is not null
  ),
  deduped_unit as (
    select
      *,
      row_number() over (
        partition by goal_id, unit_key
        order by
          plan_activated_at desc nulls last,
          plan_created_at desc nulls last,
          revision desc,
          item_updated_at desc nulls last,
          plan_scope_month desc,
          execution_item_id desc
      ) as unit_rank
    from candidate_rows
  ),
  deduped_date as (
    select
      *,
      row_number() over (
        partition by goal_id, scheduled_date
        order by
          plan_activated_at desc nulls last,
          plan_created_at desc nulls last,
          revision desc,
          item_updated_at desc nulls last,
          unit_key asc,
          execution_item_id desc
      ) as date_rank
    from deduped_unit
    where unit_rank = 1
  )
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
    goal_id,
    unit_key,
    scheduled_date,
    scheduled_time,
    locked
  from deduped_date
  where date_rank = 1;

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
