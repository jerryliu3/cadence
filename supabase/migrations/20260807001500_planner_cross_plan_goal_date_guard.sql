create or replace function private.enforce_cross_plan_goal_date_conflict()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_new_original_goal_id uuid;
  v_new_scope_month date;
  v_new_plan_status text;
begin
  if new.scheduled_date is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.scheduled_date is not distinct from old.scheduled_date then
    return new;
  end if;

  select goal.original_goal_id, plan.scope_month, plan.status
  into v_new_original_goal_id, v_new_scope_month, v_new_plan_status
  from public.execution_plan_goals goal
  join public.execution_plans plan
    on plan.id = new.plan_id
   and plan.owner_id = new.owner_id
  where goal.id = new.plan_goal_id
    and goal.plan_id = new.plan_id
    and goal.owner_id = new.owner_id;

  if v_new_original_goal_id is null then
    raise exception using
      errcode = '23514',
      message = 'cross_plan_goal_date_conflict_context_missing';
  end if;

  if v_new_plan_status <> 'active' then
    return new;
  end if;

  if exists (
    select 1
    from public.execution_plan_items item
    join public.execution_plans plan
      on plan.id = item.plan_id
     and plan.owner_id = item.owner_id
    join public.execution_plan_goals goal
      on goal.id = item.plan_goal_id
     and goal.plan_id = item.plan_id
     and goal.owner_id = item.owner_id
    where item.owner_id = new.owner_id
      and item.scheduled_date = new.scheduled_date
      and goal.original_goal_id = v_new_original_goal_id
      and plan.status = 'active'
      and plan.scope_month <> v_new_scope_month
      and (tg_op <> 'UPDATE' or item.id <> new.id)
    limit 1
  ) then
    raise exception using
      errcode = '23514',
      message = 'cross_plan_goal_date_conflict';
  end if;

  return new;
end;
$$;

drop trigger if exists execution_plan_items_cross_plan_goal_date_guard
on public.execution_plan_items;

create trigger execution_plan_items_cross_plan_goal_date_guard
before insert or update of scheduled_date
on public.execution_plan_items
for each row
execute function private.enforce_cross_plan_goal_date_conflict();
