create or replace function public.list_planner_tasks(
  p_for_date date default null
)
returns table (
  task_id uuid,
  title text,
  scheduled_date date,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_timezone text := 'UTC';
  v_today date;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select coalesce(p.timezone, 'UTC')
  into v_timezone
  from public.profiles p
  where p.id = v_uid;

  v_today := private.local_today_for_timezone(coalesce(v_timezone, 'UTC'));

  return query
  select
    t.id as task_id,
    t.title,
    t.scheduled_date,
    t.completed_at,
    t.created_at,
    t.updated_at
  from public.planner_tasks t
  where t.owner_id = v_uid
    and t.is_deleted = false
    and (
      p_for_date is null
      or t.scheduled_date <= p_for_date
    )
    and (
      t.completed_at is null
      or (t.completed_at at time zone coalesce(v_timezone, 'UTC'))::date >= coalesce(p_for_date, v_today)
    )
  order by
    case when t.completed_at is null then 0 else 1 end asc,
    t.scheduled_date asc,
    t.created_at asc;
end;
$$;

create or replace function public.delete_planner_task(
  p_task_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  delete from public.planner_tasks t
  where t.id = p_task_id
    and t.owner_id = v_uid
    and t.is_deleted = false;

  if not found then
    raise exception using errcode = 'P0001', message = 'planner_task_not_found';
  end if;

  return true;
end;
$$;

revoke all on function public.list_planner_tasks(date) from public, anon;
grant execute on function public.list_planner_tasks(date)
  to authenticated, service_role;

revoke all on function public.delete_planner_task(uuid) from public, anon;
grant execute on function public.delete_planner_task(uuid)
  to authenticated, service_role;
