-- FOR SHARE keeps planner preference fields stable against direct profile
-- UPDATE while remaining compatible with the profile FK's KEY SHARE lock
-- acquired by goal XP recomputation paths.

do $migration$
declare
  v_definition text;
  v_profile_update_lock text := '  from public.profiles profile
  where profile.id = v_owner
  for update;';
  v_profile_share_lock text := '  from public.profiles profile
  where profile.id = v_owner
  for share;';
begin
  select pg_catalog.pg_get_functiondef(
    'public.prepare_planner_schedule(jsonb,jsonb,text)'::regprocedure
  )
  into v_definition;

  if pg_catalog.strpos(v_definition, v_profile_update_lock) = 0 then
    raise exception using
      errcode = '55000',
      message = 'unexpected_prepare_profile_lock';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    v_profile_update_lock,
    v_profile_share_lock
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
