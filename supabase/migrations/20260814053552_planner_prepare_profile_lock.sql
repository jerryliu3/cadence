-- Keep owner-local planner semantics stable for the full preparation
-- transaction. Lock order is owner advisory lock, owner profile row, then
-- relevant owner goal rows in UUID order.

do $migration$
declare
  v_definition text;
  v_goal_lock text := '  perform goal.id
  from public.goals goal
  where goal.owner_id = v_owner
    and (
      exists (
        select 1
        from public.planner_items existing
        where existing.goal_id = goal.id
          and existing.owner_id = v_owner
      )
      or exists (
        select 1
        from pg_catalog.jsonb_to_recordset(p_items) as incoming(goal_id uuid)
        where incoming.goal_id = goal.id
      )
    )
  order by goal.id
  for update;';
  v_profile_read text := '  select
    private.local_today_for_timezone(coalesce(profile.timezone, ''UTC'')),
    profile.week_starts_on
  into v_local_today, v_week_starts_on
  from public.profiles profile
  where profile.id = v_owner;';
  v_profile_lock text := '  select
    private.local_today_for_timezone(coalesce(profile.timezone, ''UTC'')),
    profile.week_starts_on
  into v_local_today, v_week_starts_on
  from public.profiles profile
  where profile.id = v_owner
  for update;';
begin
  select pg_catalog.pg_get_functiondef(
    'public.prepare_planner_schedule(jsonb,jsonb,text)'::regprocedure
  )
  into v_definition;

  if pg_catalog.strpos(
    v_definition,
    v_goal_lock || E'\n\n' || v_profile_read
  ) = 0 then
    raise exception using
      errcode = '55000',
      message = 'unexpected_prepare_lock_order';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    v_goal_lock || E'\n\n' || v_profile_read,
    v_profile_lock || E'\n\n' || v_goal_lock
  );

  execute v_definition;
end;
$migration$;

revoke all
on function public.prepare_planner_schedule(jsonb, jsonb, text)
from public, anon;

grant execute
on function public.prepare_planner_schedule(jsonb, jsonb, text)
to authenticated, service_role;
