create or replace function private.guard_execution_plan_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_status text;
  v_core_mutation boolean;
begin
  if tg_op = 'DELETE' then
    if pg_catalog.pg_trigger_depth() > 1
      and pg_catalog.current_setting(
        'app.planner_deleting_profile_id',
        true
      ) = old.owner_id::text then
      return old;
    end if;
    raise exception using
      errcode = '55000',
      message = 'execution plan items cannot be deleted';
  end if;

  if (
    pg_catalog.to_jsonb(new)
      - array[
          'scheduled_date',
          'locked',
          'locked_at',
          'revision',
          'updated_at',
          'scheduled_time_override',
          'effective_scheduled_local_time'
        ]::text[]
  ) is distinct from (
    pg_catalog.to_jsonb(old)
      - array[
          'scheduled_date',
          'locked',
          'locked_at',
          'revision',
          'updated_at',
          'scheduled_time_override',
          'effective_scheduled_local_time'
        ]::text[]
  ) then
    raise exception using
      errcode = '55000',
      message = 'execution plan item obligation state is immutable';
  end if;

  v_core_mutation := (
    new.scheduled_date,
    new.locked,
    new.locked_at
  ) is distinct from (
    old.scheduled_date,
    old.locked,
    old.locked_at
  );

  if v_core_mutation then
    if new.revision <> old.revision + 1 then
      raise exception using
        errcode = '40001',
        message = 'execution plan item revision must increment exactly once';
    end if;
  elsif new.revision not in (old.revision, old.revision + 1) then
    raise exception using
      errcode = '40001',
      message = 'execution plan item revision changed unexpectedly';
  end if;

  if new.scheduled_date is distinct from old.scheduled_date
    and not new.locked then
    raise exception using
      errcode = '23514',
      message = 'moving an execution plan item must lock it';
  end if;

  select status
  into v_plan_status
  from public.execution_plans
  where id = old.plan_id
  for update;

  if v_plan_status <> 'active' then
    raise exception using
      errcode = '55000',
      message = 'only active plan items may change';
  end if;

  new.updated_at := pg_catalog.now();
  new.locked_at := case
    when new.locked then coalesce(new.locked_at, pg_catalog.now())
    else null
  end;

  return new;
end;
$$;
