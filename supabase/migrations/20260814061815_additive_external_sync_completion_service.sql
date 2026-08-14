create or replace function private.xp_points_for_completion_source(
  p_source public.completion_source
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_source = 'linked_cascade'::public.completion_source
      then greatest(
        1,
        pg_catalog.floor(
          private.xp_manual_completion_points() * private.xp_cascade_multiplier()
        )::integer
      )
    when p_source = 'external_sync'::public.completion_source
      then private.xp_manual_completion_points()
    else private.xp_manual_completion_points()
  end;
$$;

revoke all on function private.xp_points_for_completion_source(public.completion_source)
  from public, anon, authenticated;

create or replace function public.apply_external_completion_service(
  p_goal_id uuid,
  p_completed_on date,
  p_provider text,
  p_external_key text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inserted boolean := false;
  v_rows_inserted integer := 0;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_goal_id is null then
    raise exception using errcode = '22023', message = 'invalid_goal_id';
  end if;

  if p_completed_on is null then
    raise exception using errcode = '22023', message = 'invalid_completion_date';
  end if;

  if p_provider is null or pg_catalog.length(pg_catalog.btrim(p_provider)) = 0 then
    raise exception using errcode = '22023', message = 'invalid_external_provider';
  end if;

  insert into public.completions (
    goal_id,
    user_id,
    completed_on,
    source
  )
  values (
    p_goal_id,
    v_uid,
    p_completed_on,
    'external_sync'::public.completion_source
  )
  on conflict (goal_id, user_id, completed_on) do nothing;

  get diagnostics v_rows_inserted = row_count;
  v_inserted := v_rows_inserted > 0;
  if v_inserted then
    perform public.recompute_goal_xp_service(v_uid, p_goal_id);
  end if;

  insert into public.integration_sync_runs (
    user_id,
    provider,
    sync_kind,
    status,
    detail
  )
  values (
    v_uid,
    p_provider,
    'health_pull',
    'ok',
    jsonb_build_object(
      'goal_id', p_goal_id,
      'completed_on', p_completed_on,
      'external_key', p_external_key,
      'inserted', v_inserted
    )
  );

  return v_inserted;
end;
$$;

grant execute on function public.apply_external_completion_service(
  uuid,
  date,
  text,
  text
) to authenticated;
